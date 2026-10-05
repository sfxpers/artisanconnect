// Browser only. Before a photo is sent it is drawn again at most 2048 pixels
// on its long side (#113): that cuts its size over mobile data and keeps the
// Worker's decode well inside its memory, since the domain refuses a photo
// over 12 megapixels. Drawing it on a canvas also turns an iPhone's HEIC
// photo into a JPEG in Safari, which can decode HEIC.

/** As `PHOTO_LONG_SIDE` in the domain's photo module, which runs only on the server. */
const LONG_SIDE = 2048;
const QUALITY = 0.9;

/**
 * The photo as a JPEG at most 2048 pixels on its long side, or the file as it
 * is when the browser cannot draw it; the server then says why it is refused.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    // Draws the camera's orientation in, as the server would.
    await image.decode();
    const scale = Math.min(1, LONG_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    // A JPEG has no transparency; what was clear shows white, not black.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]*$/, "") || "photo";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
