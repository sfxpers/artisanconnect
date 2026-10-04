import { latin1, startsWith, Unreadable } from "../bytes";
import { inflate, MAX_DECODED_BYTES, PdfDocument } from "./document";
import { nameOf } from "./syntax";

export { pdfText, type PdfText } from "./text";

// A PDF may carry a script or a whole other file. Either is named by a key in
// a dictionary, and a dictionary is either in plain sight or packed into a
// compressed object stream, so the plain text and every inflated object
// stream are searched for those names. Streams that are not object streams
// hold page content and pictures, never a dictionary that could run anything.
// A PDF that opens without a password is encrypted all the same, so its
// object streams are decrypted before they are searched.

/** Names that run code, launch a program, or carry another file. */
const ACTIVE_NAMES = new Set([
  "JavaScript",
  "JS",
  "Launch",
  "EmbeddedFile",
  "EmbeddedFiles",
  "RichMedia",
  "XFA",
]);

export function isPdf(bytes: Uint8Array): boolean {
  return startsWith(bytes, "%PDF-");
}

/**
 * Whether the PDF carries a script or another file. Throws Locked for a PDF
 * that needs a password to open, and Unreadable for an object stream that
 * cannot be read.
 */
export async function hasActiveContent(bytes: Uint8Array): Promise<boolean> {
  // Names are never encrypted, so the plain text shows every one outside an object stream.
  if (hasActiveName(namesIn(latin1(bytes)))) return true;

  const document = await PdfDocument.open(bytes, { packed: false });
  let inflated = 0;
  for (const stream of document.streams()) {
    if (nameOf(stream.dict.get("Type")) !== "ObjStm") continue;
    const filter = document.resolve(stream.dict.get("Filter"));
    const filters = Array.isArray(filter) ? filter : filter === undefined ? [] : [filter];
    const data = document.decrypt(stream);
    if (filters.length === 0) {
      // Uncompressed: searched already, unless it was encrypted.
      if (document.security && hasActiveName(namesIn(latin1(data)))) return true;
      continue;
    }
    // Only plain Flate is unpacked. A filter chain or a predictor would leave
    // the names still encoded after inflating, so it cannot be checked.
    if (
      filters.length !== 1 ||
      nameOf(document.resolve(filters[0])) !== "FlateDecode" ||
      stream.dict.has("DecodeParms")
    ) {
      throw new Unreadable("An object stream we cannot unpack.");
    }
    const content = await inflate(data, MAX_DECODED_BYTES - inflated);
    inflated += content.length;
    if (hasActiveName(namesIn(latin1(content)))) return true;
  }
  return false;
}

function hasActiveName(names: Set<string>): boolean {
  for (const name of names) if (ACTIVE_NAMES.has(name)) return true;
  return false;
}

/** Every name (`/Type`), with `#xx` escapes decoded, since `/J#53` is `/JS`. */
function namesIn(text: string): Set<string> {
  const names = new Set<string>();
  for (const [, raw] of text.matchAll(/\/([^\s/<>[\]()%{}]+)/g)) {
    names.add(
      raw!.replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      ),
    );
  }
  return names;
}
