import decodeJpeg, { init as initJpegDecode } from "@jsquash/jpeg/decode";
import decodePng, { init as initPngDecode } from "@jsquash/png/decode";
import resize, { initResize } from "@jsquash/resize";
import decodeWebp, { init as initWebpDecode } from "@jsquash/webp/decode";
import encodeWebp, { init as initWebpEncode } from "@jsquash/webp/encode";
import JPEG_DECODER from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm?module";
import PNG_CODEC from "@jsquash/png/codec/pkg/squoosh_png_bg.wasm?module";
import RESIZER from "@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm?module";
import WEBP_DECODER from "@jsquash/webp/codec/dec/webp_dec.wasm?module";
import WEBP_ENCODER from "@jsquash/webp/codec/enc/webp_enc_simd.wasm?module";
import { ascii, need, startsWith, Unreadable, viewOf } from "./bytes";

// A photo is decoded to its pixels and drawn again as WebP, once at a size for
// viewing and once as a thumbnail. Nothing but the pixels survives, so its
// location and every other piece of metadata are gone, and so is anything
// hidden after the picture. The camera's orientation is applied first, since
// it is metadata too.

export type PhotoFormat = "jpeg" | "png" | "webp";

/** The long side of the copy that is shown. */
export const PHOTO_LONG_SIDE = 2048;
export const THUMBNAIL_LONG_SIDE = 400;
/**
 * The most pixels a photo may have: a 24-megapixel phone photo. Decoding
 * needs four bytes a pixel in memory, and a small file can claim a huge
 * picture, so the size is read from the header and checked before decoding.
 */
export const MAX_PHOTO_PIXELS = 24_000_000;
const QUALITY = 80;

let codecs: Promise<unknown> | undefined;
function loadCodecs() {
  codecs ??= Promise.all([
    initJpegDecode(JPEG_DECODER),
    initPngDecode(PNG_CODEC),
    initWebpDecode(WEBP_DECODER),
    initWebpEncode(WEBP_ENCODER),
    initResize(RESIZER),
  ]);
  return codecs;
}

export function photoFormat(bytes: Uint8Array): PhotoFormat | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, "RIFF") && startsWith(bytes, "WEBP", 8)) return "webp";
  return null;
}

export type PhotoHeader = {
  width: number;
  height: number;
  /** An animated WebP or PNG: a moving picture, not a photo. */
  animated: boolean;
};

/** The photo's size, read from its header without decoding it. */
export function readPhotoHeader(bytes: Uint8Array, format: PhotoFormat): PhotoHeader {
  switch (format) {
    case "jpeg":
      return readJpegHeader(bytes);
    case "png":
      return readPngHeader(bytes);
    case "webp":
      return readWebpHeader(bytes);
  }
}

export type Drawn = { copy: Uint8Array; thumbnail: Uint8Array; width: number; height: number };

export async function drawPhoto(
  bytes: Uint8Array<ArrayBuffer>,
  format: PhotoFormat,
): Promise<Drawn> {
  await loadCodecs();
  // The decoders take a whole buffer; copy only if these bytes are part of one.
  const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
  const buffer = whole ? bytes.buffer : bytes.slice().buffer;
  let pixels: ImageData;
  try {
    pixels = await (format === "jpeg"
      ? decodeJpeg(buffer)
      : format === "png"
        ? decodePng(buffer)
        : decodeWebp(buffer));
  } catch {
    throw new Unreadable("The photo cannot be decoded.");
  }
  const orientation = readOrientation(bytes, format);
  // Turned after shrinking, which is cheaper and gives the same picture.
  const copy = orient(await shrink(pixels, PHOTO_LONG_SIDE), orientation);
  const thumbnail = await shrink(copy, THUMBNAIL_LONG_SIDE);
  return {
    copy: new Uint8Array(await encodeWebp(copy, { quality: QUALITY })),
    thumbnail: new Uint8Array(await encodeWebp(thumbnail, { quality: QUALITY })),
    width: copy.width,
    height: copy.height,
  };
}

/** Shrinks so the long side fits, never enlarging. */
async function shrink(image: ImageData, longSide: number): Promise<ImageData> {
  const scale = longSide / Math.max(image.width, image.height);
  if (scale >= 1) return image;
  return resize(image, {
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
  });
}

/**
 * Turns pixels the way EXIF orientation 1–8 says to show them. Each case maps
 * a pixel of the result back to the pixel of the source it shows.
 */
function orient(image: ImageData, orientation: number): ImageData {
  if (orientation < 2 || orientation > 8) return image;
  const { width: w, height: h, data } = image;
  const swaps = orientation >= 5;
  const outWidth = swaps ? h : w;
  const outHeight = swaps ? w : h;
  const out = new Uint8ClampedArray(outWidth * outHeight * 4);
  const source = (x: number, y: number): [number, number] => {
    switch (orientation) {
      case 2:
        return [w - 1 - x, y];
      case 3:
        return [w - 1 - x, h - 1 - y];
      case 4:
        return [x, h - 1 - y];
      case 5:
        return [y, x];
      case 6:
        return [y, h - 1 - x];
      case 7:
        return [w - 1 - y, h - 1 - x];
      default:
        return [w - 1 - y, x];
    }
  };
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const [sx, sy] = source(x, y);
      const from = (sy * w + sx) * 4;
      out.set(data.subarray(from, from + 4), (y * outWidth + x) * 4);
    }
  }
  return new ImageData(out, outWidth, outHeight);
}

// Headers

function readJpegHeader(bytes: Uint8Array): PhotoHeader {
  for (const segment of jpegSegments(bytes)) {
    // Start-of-frame markers, which hold the size: C0–CF but for C4, C8, and CC.
    const marker = segment.marker;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      need(bytes, segment.dataStart, 5);
      const view = viewOf(bytes);
      return {
        height: view.getUint16(segment.dataStart + 1),
        width: view.getUint16(segment.dataStart + 3),
        animated: false,
      };
    }
  }
  throw new Unreadable("A JPEG with no frame.");
}

function* jpegSegments(bytes: Uint8Array) {
  const view = viewOf(bytes);
  for (let at = 2; ;) {
    need(bytes, at, 2);
    if (bytes[at] !== 0xff) throw new Unreadable("Bad JPEG marker.");
    const marker = bytes[at + 1]!;
    if (marker === 0xff) {
      at += 1; // A fill byte before the marker.
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return; // End of image, or start of scan.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2; // A marker with no length or data.
      continue;
    }
    need(bytes, at, 4);
    const length = view.getUint16(at + 2);
    need(bytes, at + 2, length);
    yield { marker, dataStart: at + 4, end: at + 2 + length };
    at += 2 + length;
  }
}

function readPngHeader(bytes: Uint8Array): PhotoHeader {
  const view = viewOf(bytes);
  need(bytes, 8, 25);
  if (ascii(bytes, 12, 4) !== "IHDR") throw new Unreadable("A PNG with no header.");
  let animated = false;
  for (const chunk of pngChunks(bytes)) {
    if (chunk.type === "acTL") animated = true;
    if (chunk.type === "IDAT") break;
  }
  return { width: view.getUint32(16), height: view.getUint32(20), animated };
}

function* pngChunks(bytes: Uint8Array) {
  const view = viewOf(bytes);
  for (let at = 8; at + 8 <= bytes.length;) {
    const length = view.getUint32(at);
    const type = ascii(bytes, at + 4, 4);
    need(bytes, at + 8, length);
    yield { type, dataStart: at + 8, end: at + 8 + length };
    if (type === "IEND") return;
    at += 12 + length;
  }
}

/**
 * An extended WebP states a canvas size and then holds the image itself, and
 * the decoder goes by the image, so both are read and the larger kept: a
 * small canvas cannot hide a huge image.
 */
function readWebpHeader(bytes: Uint8Array): PhotoHeader {
  const view = viewOf(bytes);
  const chunks = webpChunks(bytes);
  const extended = chunks[0]?.type === "VP8X" ? chunks[0] : undefined;
  let animated = false;
  let width = 0;
  let height = 0;
  if (extended) {
    const at = extended.dataStart;
    need(bytes, at, 10);
    animated = (bytes[at]! & 0x02) !== 0;
    width = 1 + (view.getUint32(at + 4, true) & 0xffffff);
    height = 1 + (view.getUint32(at + 6, true) >>> 8);
    if (animated) return { animated, width, height };
  }
  const image = chunks.find((c) => c.type === "VP8 " || c.type === "VP8L");
  if (!image) throw new Unreadable("A WebP with no image.");
  const at = image.dataStart;
  if (image.type === "VP8 ") {
    need(bytes, at, 10);
    width = Math.max(width, view.getUint16(at + 6, true) & 0x3fff);
    height = Math.max(height, view.getUint16(at + 8, true) & 0x3fff);
  } else {
    need(bytes, at, 5);
    const bits = view.getUint32(at + 1, true);
    width = Math.max(width, 1 + (bits & 0x3fff));
    height = Math.max(height, 1 + ((bits >>> 14) & 0x3fff));
  }
  return { animated, width, height };
}

function webpChunks(bytes: Uint8Array) {
  const view = viewOf(bytes);
  const chunks: { type: string; dataStart: number; end: number }[] = [];
  for (let at = 12; at + 8 <= bytes.length;) {
    const length = view.getUint32(at + 4, true);
    need(bytes, at + 8, length);
    chunks.push({ type: ascii(bytes, at, 4), dataStart: at + 8, end: at + 8 + length });
    at += 8 + length + (length % 2);
  }
  return chunks;
}

// Orientation, from the EXIF a JPEG, PNG, or WebP may carry.

function readOrientation(bytes: Uint8Array, format: PhotoFormat): number {
  try {
    const exif = findExif(bytes, format);
    return exif ? tiffOrientation(exif) : 1;
  } catch {
    // Damaged metadata only loses the turn; the pixels are still good.
    return 1;
  }
}

function findExif(bytes: Uint8Array, format: PhotoFormat): Uint8Array | null {
  const exifHeader = "Exif\0\0";
  if (format === "jpeg") {
    for (const s of jpegSegments(bytes)) {
      if (s.marker === 0xe1 && startsWith(bytes, exifHeader, s.dataStart)) {
        return bytes.subarray(s.dataStart + 6, s.end);
      }
    }
    return null;
  }
  const chunks = format === "png" ? [...pngChunks(bytes)] : webpChunks(bytes);
  const chunk = chunks.find((c) => c.type === (format === "png" ? "eXIf" : "EXIF"));
  if (!chunk) return null;
  const data = bytes.subarray(chunk.dataStart, chunk.end);
  return startsWith(data, exifHeader) ? data.subarray(6) : data;
}

function tiffOrientation(tiff: Uint8Array): number {
  const view = viewOf(tiff);
  const little = startsWith(tiff, "II");
  if (!little && !startsWith(tiff, "MM")) return 1;
  need(tiff, 0, 8);
  const ifd = view.getUint32(4, little);
  need(tiff, ifd, 2);
  const entries = view.getUint16(ifd, little);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    need(tiff, entry, 12);
    if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little);
  }
  return 1;
}
