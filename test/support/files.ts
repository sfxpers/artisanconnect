import decodeWebp, { init as initWebpDecode } from "@jsquash/webp/decode";
import encodeJpeg, { init as initJpegEncode } from "@jsquash/jpeg/encode";
import encodePng, { init as initPngEncode } from "@jsquash/png/encode";
import encodeWebp, { init as initWebpEncode } from "@jsquash/webp/encode";
import JPEG_ENCODER from "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?module";
import PNG_CODEC from "@jsquash/png/codec/pkg/squoosh_png_bg.wasm?module";
import WEBP_DECODER from "@jsquash/webp/codec/dec/webp_dec.wasm?module";
import WEBP_ENCODER from "@jsquash/webp/codec/enc/webp_enc_simd.wasm?module";

// Files as a party's device would send them. Photos are drawn and encoded
// here; voice notes, videos, and PDFs that only a real recorder or printer
// makes are in test/fixtures, and the containers whose length a test needs to
// set are built byte by byte.

const ready = Promise.all([
  initJpegEncode(JPEG_ENCODER),
  initPngEncode(PNG_CODEC),
  initWebpEncode(WEBP_ENCODER),
  initWebpDecode(WEBP_DECODER),
]);

type Colour = [number, number, number];
export const RED: Colour = [220, 30, 30];
export const BLUE: Colour = [30, 30, 220];

/** An image whose left half is one colour and right half another. */
export function picture(width: number, height: number, left = RED, right = BLUE): ImageData {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = x < width / 2 ? left : right;
      pixels.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return new ImageData(pixels, width, height);
}

/**
 * A JPEG as a phone camera saves it: with EXIF holding where it was taken
 * (Cape Town City Hall) and, optionally, how the camera was held.
 */
export async function cameraJpeg(
  width: number,
  height: number,
  { orientation = 1 }: { orientation?: number } = {},
): Promise<Uint8Array<ArrayBuffer>> {
  await ready;
  const jpeg = new Uint8Array(await encodeJpeg(picture(width, height), { quality: 90 }));
  const app1 = exifSegment(orientation);
  // The EXIF segment goes straight after the start-of-image marker.
  return concat(jpeg.subarray(0, 2), app1, jpeg.subarray(2));
}

export async function png(width: number, height: number): Promise<Uint8Array<ArrayBuffer>> {
  await ready;
  return new Uint8Array(await encodePng(picture(width, height)));
}

export async function webp(width: number, height: number): Promise<Uint8Array<ArrayBuffer>> {
  await ready;
  return new Uint8Array(await encodeWebp(picture(width, height), { quality: 90 }));
}

/** A PNG header claiming a size, with no image behind it. */
export function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return concat(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IEND", new Uint8Array()),
  );
}

/** The same bytes followed by zeros, to make a file of an exact size. */
export function paddedTo(bytes: Uint8Array, size: number): Uint8Array<ArrayBuffer> {
  const padded = new Uint8Array(size);
  padded.set(bytes);
  return padded;
}

export async function decodeStoredWebp(bytes: ArrayBuffer): Promise<ImageData> {
  await ready;
  return decodeWebp(bytes);
}

/** The four-letter chunk names of a RIFF (WebP) file, in order. */
export function riffChunks(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: string[] = [];
  for (let at = 12; at + 8 <= bytes.length;) {
    chunks.push(ascii(bytes.subarray(at, at + 4)));
    at += 8 + view.getUint32(at + 4, true) + (view.getUint32(at + 4, true) % 2);
  }
  return chunks;
}

export function pixelAt(image: ImageData, x: number, y: number): Colour {
  const i = (y * image.width + x) * 4;
  return [image.data[i]!, image.data[i + 1]!, image.data[i + 2]!];
}

export function fixture(dataUrl: string): Uint8Array<ArrayBuffer> {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// Voice notes and videos whose length a test sets. Each is the smallest
// well-formed container a recorder could write.

/** An Ogg Opus voice note (as WhatsApp or Firefox saves one). */
export function oggOpus(seconds: number, { video = false } = {}): Uint8Array<ArrayBuffer> {
  const preSkip = 312;
  // Version 1, one channel, the pre-skip, the input rate, no gain, mapping family 0.
  const head = concat(
    ascii("OpusHead"),
    new Uint8Array([1, 1]),
    le16(preSkip),
    le32(48_000),
    new Uint8Array(3),
  );
  const pages = [
    oggPage(1, 0, 0x02, 0n, head),
    oggPage(1, 1, 0, 0n, concat(ascii("OpusTags"), le32(0), le32(0))),
  ];
  if (video) pages.push(oggPage(2, 0, 0x02, 0n, concat(new Uint8Array([0x80]), ascii("theora"))));
  pages.push(
    oggPage(1, 2, 0x04, BigInt(Math.round(seconds * 48_000) + preSkip), new Uint8Array(20)),
  );
  return concat(...pages);
}

/**
 * A WebM voice note as Chrome records one: no stated duration, and a Segment
 * and Clusters of unknown size, so its length is only in its blocks' times.
 */
export function webmOpus(seconds: number, { video = false } = {}): Uint8Array<ArrayBuffer> {
  const unknownSize = new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  const tracks = [
    ebml([0xae], ebml([0xd7], [1]), ebml([0x83], [2]), ebml([0x86], ascii("A_OPUS"))),
  ];
  if (video) tracks.push(ebml([0xae], ebml([0xd7], [2]), ebml([0x83], [1])));
  const clusters: Uint8Array[] = [];
  // A Cluster every 30 seconds (in milliseconds), each with one block at its start and one 20ms before its end.
  for (let ms = 0; ms < seconds * 1000; ms += 30_000) {
    const last = Math.min(30_000, seconds * 1000 - ms) - 20;
    clusters.push(
      concat(
        new Uint8Array([0x1f, 0x43, 0xb6, 0x75]),
        unknownSize,
        ebml([0xe7], be(ms, 4)),
        ebml([0xa3], [0x81], be(0, 2), [0x80], new Uint8Array(3)),
        ebml([0xa3], [0x81], be(Math.max(0, Math.min(last, 32_767)), 2), [0x80], new Uint8Array(3)),
      ),
    );
  }
  return concat(
    ebml([0x1a, 0x45, 0xdf, 0xa3], ebml([0x42, 0x82], ascii("webm"))),
    new Uint8Array([0x18, 0x53, 0x80, 0x67]),
    unknownSize,
    ebml([0x15, 0x49, 0xa9, 0x66], ebml([0x2a, 0xd7, 0xb1], be(1_000_000, 3))),
    ebml([0x16, 0x54, 0xae, 0x6b], ...tracks),
    ...clusters,
  );
}

/** An M4A voice note (as a phone's voice recorder saves one). */
export function m4a(seconds: number, { video = false } = {}): Uint8Array<ArrayBuffer> {
  const timescale = 44_100;
  const duration = Math.round(seconds * timescale);
  const track = (handler: string) =>
    box(
      "trak",
      box("tkhd", new Uint8Array(12), be(handler === "soun" ? 1 : 2, 4), new Uint8Array(68)),
      box(
        "mdia",
        box(
          "mdhd",
          new Uint8Array(4),
          new Uint8Array(8),
          be(timescale, 4),
          be(duration, 4),
          new Uint8Array(4),
        ),
        box("hdlr", new Uint8Array(8), ascii(handler), new Uint8Array(13)),
      ),
    );
  return concat(
    box("ftyp", ascii("M4A "), new Uint8Array(4), ascii("M4A isom")),
    box(
      "moov",
      box(
        "mvhd",
        new Uint8Array(4),
        new Uint8Array(8),
        be(timescale, 4),
        be(duration, 4),
        new Uint8Array(80),
      ),
      track("soun"),
      ...(video ? [track("vide")] : []),
    ),
    box("mdat", new Uint8Array(16)),
  );
}

// PDFs. Each is a one-page document; the options add what a hostile PDF hides.

export async function pdf({
  script = "none",
  encrypted = false,
  packing = "flate",
}: {
  /** Where a JavaScript action sits: nowhere, in plain sight, behind a name escape, or compressed in an object stream. */
  script?: "none" | "plain" | "escaped" | "object-stream";
  encrypted?: boolean;
  /** How the object stream is packed: plain Flate, Flate then hex, or Flate with a predictor. */
  packing?: "flate" | "flate-then-hex" | "predictor";
} = {}): Promise<Uint8Array<ArrayBuffer>> {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>",
  ];
  const action = "<< /S /JavaScript /JS (app.alert\\(1\\)) >>";
  if (script === "plain") objects[0] = `<< /Type /Catalog /Pages 2 0 R /OpenAction ${action} >>`;
  if (script === "escaped") {
    objects[0] = "<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /Java#53cript /J#53 (x) >> >>";
  }
  let body = objects.map((o, i) => `${i + 1} 0 obj\n${o}\nendobj\n`).join("");
  if (script === "object-stream") {
    // The action is object 5, packed into object stream 4, so it is only seen once inflated.
    objects[0] = "<< /Type /Catalog /Pages 2 0 R /OpenAction 5 0 R >>";
    body = objects.map((o, i) => `${i + 1} 0 obj\n${o}\nendobj\n`).join("");
    const offsets = "5 0 ";
    const deflated = await deflate(ascii(offsets + action));
    const filter = {
      flate: "/Filter /FlateDecode",
      "flate-then-hex": "/Filter [/FlateDecode /ASCIIHexDecode]",
      predictor: "/Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 4 >>",
    }[packing];
    // Flate then hex: the inflated bytes are themselves hex, so the names stay hidden.
    const packed =
      packing === "flate-then-hex"
        ? await deflate(
            ascii(
              [...ascii(offsets + action)].map((b) => b.toString(16).padStart(2, "0")).join(""),
            ),
          )
        : deflated;
    body += `4 0 obj\n<< /Type /ObjStm /N 1 /First ${offsets.length} ${filter} /Length ${packed.length} >>\nstream\n`;
    return concat(
      ascii(`%PDF-1.7\n${body}`),
      packed,
      ascii(`\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`),
    );
  }
  const trailer = encrypted ? "<< /Root 1 0 R /Encrypt 9 0 R >>" : "<< /Root 1 0 R >>";
  return ascii(`%PDF-1.7\n${body}trailer\n${trailer}\n%%EOF\n`);
}

// Bytes

function exifSegment(orientation: number): Uint8Array<ArrayBuffer> {
  // A big-endian TIFF: IFD0 holds the orientation and a pointer to the GPS IFD.
  const gpsIfdOffset = 8 + 2 + 2 * 12 + 4;
  const ifd0 = concat(
    be(2, 2),
    concat(be(0x0112, 2), be(3, 2), be(1, 4), be(orientation, 2), be(0, 2)),
    concat(be(0x8825, 2), be(4, 2), be(1, 4), be(gpsIfdOffset, 4)),
    be(0, 4),
  );
  const gps = concat(
    be(2, 2),
    concat(be(0x0001, 2), be(2, 2), be(2, 4), ascii("S\0\0\0")),
    concat(be(0x0003, 2), be(2, 2), be(2, 4), ascii("E\0\0\0")),
    be(0, 4),
  );
  const tiff = concat(ascii("MM"), be(42, 2), be(8, 4), ifd0, gps);
  const data = concat(ascii("Exif\0\0"), tiff);
  return concat(new Uint8Array([0xff, 0xe1]), be(data.length + 2, 2), data);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  // Decoders this test feeds a header to stop before checking a CRC.
  return concat(be(data.length, 4), ascii(type), data, new Uint8Array(4));
}

function oggPage(
  serial: number,
  sequence: number,
  flags: number,
  granule: bigint,
  packet: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(27);
  const view = new DataView(header.buffer);
  header.set(ascii("OggS"));
  view.setUint8(5, flags);
  view.setBigInt64(6, granule, true);
  view.setUint32(14, serial, true);
  view.setUint32(18, sequence, true);
  const lacing: number[] = [];
  for (let left = packet.length; ; left -= 255) {
    lacing.push(Math.min(left, 255));
    if (left < 255) break;
  }
  view.setUint8(26, lacing.length);
  return concat(header, new Uint8Array(lacing), packet);
}

/** One EBML element with a known size. */
function ebml(id: number[], ...content: (Uint8Array | number[])[]): Uint8Array<ArrayBuffer> {
  const data = concat(...content.map((c) => (c instanceof Uint8Array ? c : new Uint8Array(c))));
  const size = concat(new Uint8Array([0x01]), be(data.length, 7));
  return concat(new Uint8Array(id), size, data);
}

function box(type: string, ...content: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const data = concat(...content);
  return concat(be(data.length + 8, 4), ascii(type), data);
}

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function be(value: number, length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--, value = Math.floor(value / 256)) bytes[i] = value % 256;
  return bytes;
}

function le16(value: number): Uint8Array<ArrayBuffer> {
  return be(value, 2).reverse();
}

function le32(value: number): Uint8Array<ArrayBuffer> {
  return be(value, 4).reverse();
}

function ascii(text: string): Uint8Array<ArrayBuffer>;
function ascii(bytes: Uint8Array): string;
function ascii(value: string | Uint8Array): Uint8Array<ArrayBuffer> | string {
  return typeof value === "string"
    ? Uint8Array.from(value, (c) => c.charCodeAt(0))
    : String.fromCharCode(...value);
}

export function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The start of an animated WebP: a VP8X chunk with its animation flag set. */
export function animatedWebpHeader(): Uint8Array<ArrayBuffer> {
  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x02;
  vp8x.set([31, 0, 0, 31, 0, 0], 4);
  const chunk = concat(ascii("VP8X"), le32(vp8x.length), vp8x);
  return concat(ascii("RIFF"), le32(4 + chunk.length), ascii("WEBP"), chunk);
}

/** A WebP whose extended header claims a 1×1 canvas over a 16000×16000 lossless image. */
export function webpUnderstatingItsSize(): Uint8Array<ArrayBuffer> {
  const vp8x = new Uint8Array(10);
  const bits = (16_000 - 1) | ((16_000 - 1) << 14);
  const vp8l = concat(new Uint8Array([0x2f]), le32(bits >>> 0), new Uint8Array(11));
  const chunks = concat(
    ascii("VP8X"),
    le32(vp8x.length),
    vp8x,
    ascii("VP8L"),
    le32(vp8l.length),
    vp8l,
  );
  return concat(ascii("RIFF"), le32(4 + chunks.length), ascii("WEBP"), chunks);
}

/**
 * A fragmented M4A, as Safari and Chrome record one: the header states no
 * length, and one fragment holds `samples` samples of the track's default
 * duration, so its length is only found by adding them up.
 */
export function fragmentedM4a(samples: number, sampleDuration = 1024): Uint8Array<ArrayBuffer> {
  const timescale = 44_100;
  return concat(
    box("ftyp", ascii("iso6"), new Uint8Array(4), ascii("iso6mp41")),
    box(
      "moov",
      box("mvhd", new Uint8Array(4), new Uint8Array(8), be(1000, 4), be(0, 4), new Uint8Array(80)),
      box(
        "trak",
        box("tkhd", new Uint8Array(12), be(1, 4), new Uint8Array(68)),
        box(
          "mdia",
          box("mdhd", new Uint8Array(12), be(timescale, 4), be(0, 4), new Uint8Array(4)),
          box("hdlr", new Uint8Array(8), ascii("soun"), new Uint8Array(13)),
        ),
      ),
      box(
        "mvex",
        box(
          "trex",
          new Uint8Array(4),
          be(1, 4),
          be(1, 4),
          be(sampleDuration, 4),
          new Uint8Array(8),
        ),
      ),
    ),
    box(
      "moof",
      box("mfhd", new Uint8Array(4), be(1, 4)),
      box(
        "traf",
        box("tfhd", new Uint8Array(4), be(1, 4)),
        box("trun", new Uint8Array(4), be(samples >>> 0, 4)),
      ),
    ),
    box("mdat", new Uint8Array(16)),
  );
}

/** A JPEG with a fill byte before its first marker, as some cameras write. */
export function withFillByte(jpeg: Uint8Array): Uint8Array<ArrayBuffer> {
  return concat(jpeg.subarray(0, 2), new Uint8Array([0xff]), jpeg.subarray(2));
}
