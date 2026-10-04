import { Unreadable } from "../bytes";

// PDF's object syntax: numbers, names, strings, arrays, dictionaries, and
// references to other objects. Content streams use the same syntax, with
// operators between the operands.

export class PdfName {
  constructor(readonly name: string) {}
}

/** A reference to another object, `12 0 R`. */
export class PdfRef {
  constructor(
    readonly num: number,
    readonly gen: number,
  ) {}
}

/** A content stream's operator, such as `Tj`, or a keyword such as `stream`. */
export class PdfOp {
  constructor(readonly op: string) {}
}

export type PdfDict = Map<string, PdfValue>;

/** A string is its bytes; an array is a JavaScript array. */
export type PdfValue =
  | number
  | boolean
  | null
  | PdfName
  | PdfRef
  | Uint8Array
  | PdfValue[]
  | PdfDict;

const END_ARRAY = Symbol("]");
const END_DICT = Symbol(">>");
const END = Symbol("end");

type Token = PdfValue | PdfOp | typeof END_ARRAY | typeof END_DICT | typeof END;

/** Deeper than any real file nests, and shallow enough to never exhaust the stack. */
const MAX_DEPTH = 64;

export function isWhite(byte: number | undefined): boolean {
  return (
    byte === 0x20 ||
    byte === 0x0a ||
    byte === 0x0d ||
    byte === 0x09 ||
    byte === 0x0c ||
    byte === 0x00
  );
}

function isDelimiter(byte: number | undefined): boolean {
  return (
    byte === 0x28 || // (
    byte === 0x29 || // )
    byte === 0x3c || // <
    byte === 0x3e || // >
    byte === 0x5b || // [
    byte === 0x5d || // ]
    byte === 0x7b || // {
    byte === 0x7d || // }
    byte === 0x2f || // /
    byte === 0x25 // %
  );
}

function hexValue(byte: number): number {
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x37;
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x57;
  return -1;
}

/** Reads PDF values one after another from `at`, up to `end`. */
export class Lexer {
  constructor(
    readonly bytes: Uint8Array,
    public at = 0,
    readonly end = bytes.length,
  ) {}

  skipSpace(): void {
    const { bytes } = this;
    while (this.at < this.end) {
      const byte = bytes[this.at];
      if (isWhite(byte)) {
        this.at++;
      } else if (byte === 0x25) {
        // A comment runs to the end of its line.
        while (this.at < this.end && bytes[this.at] !== 0x0a && bytes[this.at] !== 0x0d) this.at++;
      } else {
        return;
      }
    }
  }

  /**
   * The next value or operator; undefined at the end, as `null` is a value.
   * Throws Unreadable at a stray `]` or `>>`.
   */
  next(): PdfValue | PdfOp | undefined {
    const token = this.token(0);
    if (token === END) return undefined;
    if (token === END_ARRAY || token === END_DICT) throw new Unreadable("A stray closing bracket.");
    return token;
  }

  /** The next value, which must not be an operator. */
  value(): PdfValue {
    const token = this.next();
    if (token === undefined || token instanceof PdfOp) throw new Unreadable("A value is missing.");
    return token;
  }

  private token(depth: number): Token {
    if (depth > MAX_DEPTH) throw new Unreadable("Values nest too deep.");
    this.skipSpace();
    if (this.at >= this.end) return END;
    const { bytes } = this;
    const byte = bytes[this.at]!;
    switch (byte) {
      case 0x5b: // [
        this.at++;
        return this.array(depth);
      case 0x5d: // ]
        this.at++;
        return END_ARRAY;
      case 0x3c: // <
        if (bytes[this.at + 1] === 0x3c) {
          this.at += 2;
          return this.dict(depth);
        }
        return this.hexString();
      case 0x3e: // >
        if (bytes[this.at + 1] === 0x3e) {
          this.at += 2;
          return END_DICT;
        }
        this.at++;
        throw new Unreadable("A stray >.");
      case 0x28: // (
        return this.literalString();
      case 0x2f: // /
        return this.name();
      case 0x7b: // { and }, only in PostScript functions
      case 0x7d:
        this.at++;
        return new PdfOp(String.fromCharCode(byte));
      case 0x29: // )
        this.at++;
        throw new Unreadable("A stray ).");
    }
    const word = this.word();
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) return this.numberOrRef(Number(word), word);
    if (/^[+-]*\d*\.?\d*$/.test(word) && /\d/.test(word)) {
      // A malformed number such as `--5` or `0.5.3`: the leading sign and digits.
      return Number.parseFloat(word.replace(/^[+-]+/, (signs) => signs.at(-1)!)) || 0;
    }
    if (word === "true") return true;
    if (word === "false") return false;
    if (word === "null") return null;
    return new PdfOp(word);
  }

  private word(): string {
    const start = this.at;
    while (
      this.at < this.end &&
      !isWhite(this.bytes[this.at]) &&
      !isDelimiter(this.bytes[this.at])
    ) {
      this.at++;
    }
    if (this.at === start) this.at++; // Never stand still.
    let word = "";
    for (let i = start; i < this.at; i++) word += String.fromCharCode(this.bytes[i]!);
    return word;
  }

  /** `12 0 R` is a reference; any other number is itself. */
  private numberOrRef(value: number, word: string): number | PdfRef {
    if (!/^\d+$/.test(word)) return value;
    const mark = this.at;
    this.skipSpace();
    const generation = this.peekWord();
    if (generation !== null && /^\d+$/.test(generation.word)) {
      this.at = generation.end;
      this.skipSpace();
      const r = this.peekWord();
      if (r?.word === "R") {
        this.at = r.end;
        return new PdfRef(value, Number(generation.word));
      }
    }
    this.at = mark;
    return value;
  }

  private peekWord(): { word: string; end: number } | null {
    let at = this.at;
    let word = "";
    while (at < this.end && !isWhite(this.bytes[at]) && !isDelimiter(this.bytes[at])) {
      word += String.fromCharCode(this.bytes[at]!);
      at++;
    }
    return word ? { word, end: at } : null;
  }

  private array(depth: number): PdfValue[] {
    const items: PdfValue[] = [];
    for (;;) {
      const token = this.token(depth + 1);
      if (token === END_ARRAY || token === END) return items;
      if (token === END_DICT) throw new Unreadable("A >> inside an array.");
      // An operator inside an array is damage; skip it, as readers do.
      if (!(token instanceof PdfOp)) items.push(token);
    }
  }

  private dict(depth: number): PdfDict {
    const dict: PdfDict = new Map();
    for (;;) {
      const key = this.token(depth + 1);
      if (key === END_DICT || key === END) return dict;
      if (!(key instanceof PdfName)) continue; // A damaged key; readers skip it.
      const value = this.token(depth + 1);
      if (value === END_DICT || value === END) {
        dict.set(key.name, null);
        return dict;
      }
      if (value === END_ARRAY || value instanceof PdfOp) continue;
      dict.set(key.name, value);
    }
  }

  private name(): PdfName {
    this.at++; // The slash.
    const start = this.at;
    while (
      this.at < this.end &&
      !isWhite(this.bytes[this.at]) &&
      !isDelimiter(this.bytes[this.at])
    ) {
      this.at++;
    }
    let raw = "";
    for (let i = start; i < this.at; i++) raw += String.fromCharCode(this.bytes[i]!);
    // `/J#53` is `/JS`.
    return new PdfName(
      raw.replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))),
    );
  }

  private hexString(): Uint8Array {
    this.at++; // The <.
    const out: number[] = [];
    let high = -1;
    while (this.at < this.end) {
      const byte = this.bytes[this.at++]!;
      if (byte === 0x3e) break;
      const value = hexValue(byte);
      if (value < 0) continue; // Whitespace, or damage.
      if (high < 0) {
        high = value;
      } else {
        out.push(high * 16 + value);
        high = -1;
      }
    }
    if (high >= 0) out.push(high * 16); // An odd last digit is followed by 0.
    return new Uint8Array(out);
  }

  private literalString(): Uint8Array {
    const { bytes } = this;
    this.at++; // The (.
    const out: number[] = [];
    let open = 1;
    while (this.at < this.end) {
      const byte = bytes[this.at++]!;
      if (byte === 0x28) {
        open++;
      } else if (byte === 0x29) {
        open--;
        if (open === 0) break;
      } else if (byte === 0x5c) {
        const escaped = bytes[this.at++];
        switch (escaped) {
          case 0x6e: // n
            out.push(0x0a);
            continue;
          case 0x72: // r
            out.push(0x0d);
            continue;
          case 0x74: // t
            out.push(0x09);
            continue;
          case 0x62: // b
            out.push(0x08);
            continue;
          case 0x66: // f
            out.push(0x0c);
            continue;
          case 0x0d: // A backslash ends the line: the string goes on without it.
            if (bytes[this.at] === 0x0a) this.at++;
            continue;
          case 0x0a:
            continue;
          case undefined:
            continue;
        }
        if (escaped >= 0x30 && escaped <= 0x37) {
          let code = escaped - 0x30;
          for (let i = 0; i < 2; i++) {
            const digit = bytes[this.at];
            if (digit === undefined || digit < 0x30 || digit > 0x37) break;
            code = code * 8 + digit - 0x30;
            this.at++;
          }
          out.push(code & 0xff);
          continue;
        }
        out.push(escaped); // \( \) \\ and any other: the character itself.
        continue;
      } else if (byte === 0x0d) {
        // An end of line in a string is a newline, however it was written.
        if (bytes[this.at] === 0x0a) this.at++;
        out.push(0x0a);
        continue;
      }
      out.push(byte);
    }
    return new Uint8Array(out);
  }
}

// Reading values

export function isDict(value: PdfValue | undefined): value is PdfDict {
  return value instanceof Map;
}

export function nameOf(value: PdfValue | undefined): string | null {
  return value instanceof PdfName ? value.name : null;
}

export function numberOf(value: PdfValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function bytesOf(value: PdfValue | undefined): Uint8Array | null {
  return value instanceof Uint8Array ? value : null;
}
