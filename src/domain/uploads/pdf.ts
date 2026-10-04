import { latin1, Locked, startsWith, Unreadable } from "./bytes";

// A PDF may carry a script or a whole other file. Either is named by a key in
// a dictionary, and a dictionary is either in plain sight or packed into a
// compressed object stream, so the plain text and every inflated object
// stream are searched for those names. Streams that are not object streams
// hold page content and pictures, never a dictionary that could run anything.

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

/** What inflating every object stream may come to, so a small file cannot unpack into a huge one. */
const MAX_INFLATED_BYTES = 32 * 1024 * 1024;

export function isPdf(bytes: Uint8Array): boolean {
  return startsWith(bytes, "%PDF-");
}

/**
 * Whether the PDF carries a script or another file. Throws Unreadable for a
 * locked PDF, or an object stream that cannot be read.
 */
export async function hasActiveContent(bytes: Uint8Array<ArrayBuffer>): Promise<boolean> {
  const text = latin1(bytes);
  const names = namesIn(text);
  // A locked PDF's object streams are encrypted, so nothing in them can be checked.
  if (names.has("Encrypt")) throw new Locked("The PDF is locked.");
  if (hasActiveName(names)) return true;

  let inflated = 0;
  for (const stream of objectStreams(text)) {
    const keys = namesIn(stream.dictionary);
    const filters = [...keys].filter((name) => /Decode$|^Crypt$/.test(name));
    if (filters.length === 0 && !keys.has("Filter")) continue; // Uncompressed, so already searched.
    // Only plain Flate is unpacked. A filter chain or a predictor would leave
    // the names still encoded after inflating, so it cannot be checked.
    if (filters.length !== 1 || filters[0] !== "FlateDecode" || keys.has("DecodeParms")) {
      throw new Unreadable("An object stream we cannot unpack.");
    }
    const content = await inflate(
      bytes.subarray(stream.start, stream.end),
      MAX_INFLATED_BYTES - inflated,
    );
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

/** A stream's dictionary is short; looking back no further keeps a file full of "stream" cheap to search. */
const MAX_DICTIONARY_CHARS = 4096;

/** The dictionary and byte range of every stream whose object is an object stream. */
function* objectStreams(text: string) {
  for (const match of text.matchAll(/>>\s*stream(\r\n|\n)/g)) {
    const start = match.index + match[0].length;
    const before = text.slice(Math.max(0, match.index - MAX_DICTIONARY_CHARS), match.index);
    const dictionary = before.slice(Math.max(0, before.lastIndexOf(" obj")));
    if (!namesIn(dictionary).has("ObjStm")) continue;
    let end = text.indexOf("endstream", start);
    if (end < 0) throw new Unreadable("A stream with no end.");
    // The end-of-line before "endstream" is not part of the stream.
    if (text[end - 1] === "\n") end--;
    if (text[end - 1] === "\r") end--;
    yield { dictionary, start, end };
  }
}

async function inflate(compressed: Uint8Array<ArrayBuffer>, limit: number): Promise<Uint8Array> {
  const reader = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"))
    .getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw new Unreadable("The PDF unpacks to too much.");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof Unreadable) throw error;
    throw new Unreadable("An object stream that does not unpack.");
  }
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
