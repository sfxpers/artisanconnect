import { latin1, Unreadable } from "../bytes";
import { openSecurity, type Security } from "./security";
import {
  bytesOf,
  isDict,
  isWhite,
  Lexer,
  nameOf,
  numberOf,
  PdfOp,
  PdfRef,
  type PdfDict,
  type PdfValue,
} from "./syntax";

// A PDF's objects, found by reading the file from start to end rather than
// by trusting its cross-reference table, which a damaged or hostile file can
// get wrong. Where an object is written twice, as an edit appended to the
// file does, the later one counts.

/** What decoding every stream of one PDF may come to, so a small file cannot unpack into a huge one. */
export const MAX_DECODED_BYTES = 32 * 1024 * 1024;

export type PdfStream = {
  dict: PdfDict;
  /** The stream's bytes as stored: encrypted, if the PDF is, and still encoded. */
  raw: Uint8Array;
  num: number;
  gen: number;
};

type Entry = { num: number; gen: number; value: PdfValue; stream?: PdfStream };

export class PdfDocument {
  private decoded = 0;

  private constructor(
    private readonly objects: Map<number, Entry>,
    readonly trailer: PdfDict,
    readonly security: Security | null,
  ) {}

  /**
   * Reads the file's objects, and opens its encryption. Throws Locked if it
   * needs a password. Objects packed into object streams are read too, unless
   * `packed` is false.
   */
  static async open(bytes: Uint8Array, { packed = true } = {}): Promise<PdfDocument> {
    const { objects, trailer, encryptRef } = indexObjects(bytes);
    const encrypt = trailer.get("Encrypt");
    let security: Security | null = null;
    if (encrypt !== undefined) {
      const dict = encrypt instanceof PdfRef ? objects.get(encrypt.num)?.value : encrypt;
      const id = trailer.get("ID");
      const first = Array.isArray(id) ? bytesOf(id[0]) : null;
      if (!isDict(dict)) throw new Unreadable("The encryption dictionary is missing.");
      security = openSecurity(dict, first ?? new Uint8Array(0));
      for (const entry of objects.values()) {
        if (entry.num === encryptRef?.num) continue;
        if (entry.stream && nameOf(entry.stream.dict.get("Type")) === "XRef") continue;
        entry.value = decryptStrings(entry.value, security, entry.num, entry.gen);
        if (entry.stream && isDict(entry.value)) entry.stream.dict = entry.value;
      }
    }
    const document = new PdfDocument(objects, trailer, security);
    if (packed) await document.expandObjectStreams();
    return document;
  }

  /** The value, with a reference followed to the object it names. */
  resolve(value: PdfValue | undefined): PdfValue | undefined {
    for (let hops = 0; value instanceof PdfRef; hops++) {
      if (hops > 32) throw new Unreadable("References go round in a circle.");
      value = this.objects.get(value.num)?.value;
    }
    return value;
  }

  dict(value: PdfValue | undefined): PdfDict | null {
    const resolved = this.resolve(value);
    return isDict(resolved) ? resolved : null;
  }

  /** The stream a value is, or names. */
  stream(value: PdfValue | undefined): PdfStream | null {
    let ref = value;
    for (let hops = 0; ref instanceof PdfRef; hops++) {
      if (hops > 32) throw new Unreadable("References go round in a circle.");
      const entry = this.objects.get(ref.num);
      if (entry?.stream) return entry.stream;
      ref = entry?.value;
    }
    return null;
  }

  /** Every object's stream, in the order of their numbers. */
  *streams(): Generator<PdfStream> {
    for (const entry of this.objects.values()) if (entry.stream) yield entry.stream;
  }

  /** The stream's bytes, decrypted and decoded. Throws Unreadable for a filter it cannot undo. */
  async data(stream: PdfStream): Promise<Uint8Array> {
    let data = this.decrypt(stream);
    const filters = this.resolve(stream.dict.get("Filter"));
    const names = (Array.isArray(filters) ? filters : filters === undefined ? [] : [filters]).map(
      (filter) => nameOf(this.resolve(filter)),
    );
    const parms = this.resolve(stream.dict.get("DecodeParms"));
    for (const [i, name] of names.entries()) {
      const parm = this.dict(Array.isArray(parms) ? parms[i] : parms);
      data = await this.decode(name, data, parm);
    }
    return data;
  }

  /** The stream's bytes, decrypted but still encoded. */
  decrypt(stream: PdfStream): Uint8Array {
    if (!this.security) return stream.raw;
    const type = nameOf(stream.dict.get("Type"));
    if (type === "XRef") return stream.raw;
    if (type === "Metadata" && this.encryptsMetadata() === false) return stream.raw;
    return this.security.decryptStream(stream.raw, stream.num, stream.gen);
  }

  private encryptsMetadata(): boolean {
    const encrypt = this.dict(this.trailer.get("Encrypt"));
    return encrypt?.get("EncryptMetadata") !== false;
  }

  private async decode(
    filter: string | null,
    data: Uint8Array,
    parms: PdfDict | null,
  ): Promise<Uint8Array> {
    switch (filter) {
      case "FlateDecode":
      case "Fl": {
        const predictor = numberOf(parms?.get("Predictor")) ?? 1;
        if (predictor > 1) throw new Unreadable("A stream with a predictor.");
        const inflated = await inflate(data, MAX_DECODED_BYTES - this.decoded);
        this.decoded += inflated.length;
        return inflated;
      }
      case "ASCIIHexDecode":
      case "AHx":
        return asciiHex(data);
      case "ASCII85Decode":
      case "A85":
        return ascii85(data);
      case "Crypt":
        if ((nameOf(parms?.get("Name")) ?? "Identity") !== "Identity") {
          throw new Unreadable("A stream with its own crypt filter.");
        }
        return data;
      default:
        throw new Unreadable(`A stream encoded with ${filter ?? "an unnamed filter"}.`);
    }
  }

  /**
   * Objects packed into object streams (PDF 1.5 on) join the others, unless
   * the same number is also written on its own, which then counts.
   */
  private async expandObjectStreams() {
    const packed: PdfStream[] = [];
    for (const stream of this.streams()) {
      if (nameOf(stream.dict.get("Type")) === "ObjStm") packed.push(stream);
    }
    for (const stream of packed) {
      const count = numberOf(this.resolve(stream.dict.get("N"))) ?? 0;
      const first = numberOf(this.resolve(stream.dict.get("First"))) ?? 0;
      const data = await this.data(stream);
      const header = new Lexer(data, 0, Math.min(first, data.length));
      for (let i = 0; i < count; i++) {
        const num = header.next();
        const offset = header.next();
        if (typeof num !== "number" || typeof offset !== "number") break;
        if (this.objects.has(num)) continue;
        const lexer = new Lexer(data, first + offset);
        const value = lexer.next();
        if (value === undefined || value instanceof PdfOp) continue;
        this.objects.set(num, { num, gen: 0, value });
      }
    }
  }
}

/** Every object written in the file, the trailer, and the reference to the encryption dictionary. */
function indexObjects(bytes: Uint8Array) {
  const text = latin1(bytes);
  const objects = new Map<number, Entry>();
  const trailers: { at: number; dict: PdfDict }[] = [];
  let skipTo = 0;
  for (const match of text.matchAll(/(?<![0-9])(\d+)\s+(\d+)\s+obj\b/g)) {
    if (match.index < skipTo) continue;
    const num = Number(match[1]);
    const gen = Number(match[2]);
    const lexer = new Lexer(bytes, match.index + match[0].length);
    let value: PdfValue;
    try {
      value = lexer.value();
    } catch {
      continue; // A damaged object; the scan goes on after its header.
    }
    const entry: Entry = { num, gen, value };
    lexer.skipSpace();
    if (isDict(value) && text.startsWith("stream", lexer.at)) {
      const extent = streamExtent(text, bytes, lexer.at + "stream".length, value, objects);
      entry.stream = { dict: value, raw: bytes.subarray(extent.start, extent.end), num, gen };
      skipTo = extent.after;
      if (nameOf(value.get("Type")) === "XRef") trailers.push({ at: match.index, dict: value });
    } else {
      skipTo = lexer.at;
    }
    objects.set(num, entry);
  }
  for (const match of text.matchAll(/trailer\s*<</g)) {
    try {
      const dict = new Lexer(bytes, match.index + "trailer".length).value();
      if (isDict(dict)) trailers.push({ at: match.index, dict });
    } catch {
      // A damaged trailer; another may do.
    }
  }
  trailers.sort((a, b) => a.at - b.at);
  // The newest trailer counts; an older one fills in what it leaves out.
  const trailer: PdfDict = new Map();
  for (const { dict } of trailers) for (const [key, value] of dict) trailer.set(key, value);
  const encrypt = trailer.get("Encrypt");
  return {
    objects,
    trailer,
    encryptRef: encrypt instanceof PdfRef ? encrypt : null,
  };
}

/** Where a stream's data starts and ends, by its stated length if that is right, else by its end keyword. */
function streamExtent(
  text: string,
  bytes: Uint8Array,
  afterKeyword: number,
  dict: PdfDict,
  objects: Map<number, Entry>,
) {
  let start = afterKeyword;
  if (bytes[start] === 0x0d) start++;
  if (bytes[start] === 0x0a) start++;
  const stated = dict.get("Length");
  const length =
    stated instanceof PdfRef ? numberOf(objects.get(stated.num)?.value) : numberOf(stated);
  if (length !== null && length >= 0 && start + length <= bytes.length) {
    let at = start + length;
    while (isWhite(bytes[at])) at++;
    if (text.startsWith("endstream", at)) {
      return { start, end: start + length, after: at + "endstream".length };
    }
  }
  const keyword = text.indexOf("endstream", start);
  if (keyword < 0) throw new Unreadable("A stream with no end.");
  let end = keyword;
  // The end of line before "endstream" is not part of the stream.
  if (bytes[end - 1] === 0x0a) end--;
  if (bytes[end - 1] === 0x0d) end--;
  return { start, end: Math.max(start, end), after: keyword + "endstream".length };
}

function decryptStrings(value: PdfValue, security: Security, num: number, gen: number): PdfValue {
  if (value instanceof Uint8Array) return security.decryptString(value, num, gen);
  if (Array.isArray(value)) return value.map((item) => decryptStrings(item, security, num, gen));
  if (isDict(value)) {
    const out: PdfDict = new Map();
    for (const [key, item] of value) out.set(key, decryptStrings(item, security, num, gen));
    return out;
  }
  return value;
}

// Filters

export async function inflate(compressed: Uint8Array, limit: number): Promise<Uint8Array> {
  const reader = new Blob([compressed as Uint8Array<ArrayBuffer>])
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
    throw new Unreadable("A stream that does not unpack.");
  }
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

function asciiHex(data: Uint8Array): Uint8Array {
  const lexer = new Lexer(new Uint8Array([0x3c, ...data, 0x3e]));
  return bytesOf(lexer.value()) ?? new Uint8Array(0);
}

function ascii85(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let group: number[] = [];
  const flush = (count: number) => {
    let value = 0;
    for (let i = 0; i < 5; i++) value = value * 85 + (group[i] ?? 84);
    for (let i = 0; i < count - 1; i++) out.push((value >>> (24 - i * 8)) & 0xff);
    group = [];
  };
  for (let i = 0; i < data.length; i++) {
    const byte = data[i]!;
    if (byte === 0x7e) break; // ~> ends it.
    if (isWhite(byte)) continue;
    if (byte === 0x7a && group.length === 0) {
      out.push(0, 0, 0, 0); // z is four zero bytes.
      continue;
    }
    if (byte < 0x21 || byte > 0x75) throw new Unreadable("Bad ASCII85.");
    group.push(byte - 0x21);
    if (group.length === 5) flush(5);
  }
  if (group.length > 1) flush(group.length);
  return new Uint8Array(out);
}
