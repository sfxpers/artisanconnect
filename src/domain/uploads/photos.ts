import { startsWith, Unreadable } from "./bytes";

// A photo is drawn again as WebP by Cloudflare Images (ADR 0017), once at a
// size for viewing and once as a thumbnail. Only the pixels survive, turned the
// way the camera was held, so its location and every other piece of metadata
// are gone, and so is anything hidden after the picture. An animated one is
// kept as its first frame, a still photo.

type PhotoFormat = "jpeg" | "png" | "webp";

/** The long side of the copy that is shown. */
export const PHOTO_LONG_SIDE = 2048;
const THUMBNAIL_LONG_SIDE = 400;
const QUALITY = 80;

export function photoFormat(bytes: Uint8Array): PhotoFormat | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, "RIFF") && startsWith(bytes, "WEBP", 8)) return "webp";
  return null;
}

type Drawn = { copy: Uint8Array; thumbnail: Uint8Array; width: number; height: number };

export async function drawPhoto(images: ImagesBinding, bytes: Uint8Array): Promise<Drawn> {
  const draw = async (longSide: number) => {
    const drawn = await images
      .input(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream())
      .transform({ width: longSide, height: longSide, fit: "scale-down" })
      .output({ format: "image/webp", quality: QUALITY, anim: false });
    return new Uint8Array(await drawn.response().arrayBuffer());
  };
  try {
    const [copy, thumbnail] = await Promise.all([draw(PHOTO_LONG_SIDE), draw(THUMBNAIL_LONG_SIDE)]);
    const info = await images.info(new Blob([copy as Uint8Array<ArrayBuffer>]).stream());
    if (!("width" in info)) throw new Error("A drawn photo has no size.");
    return { copy, thumbnail, width: info.width, height: info.height };
  } catch (error) {
    throw new Unreadable(`The photo cannot be drawn: ${String(error)}`);
  }
}
