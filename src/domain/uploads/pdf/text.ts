import { Unreadable } from "../bytes";
import { PdfDocument, type PdfStream } from "./document";
import { glyphText, namedEncoding, STANDARD, WIN_ANSI } from "./encodings";
import {
  bytesOf,
  isDict,
  Lexer,
  nameOf,
  numberOf,
  PdfOp,
  type PdfDict,
  type PdfValue,
} from "./syntax";

// A PDF's text, read the way a viewer lays it out: each page's content is
// run, every piece of text shown is decoded through its font to Unicode, and
// where each lands on the page decides whether a space or a new line comes
// between pieces. Text drawn as a picture (a scan) cannot be read this way.

export type PdfText = {
  text: string;
  /** How many pictures the pages draw: a PDF of pictures and no text is a scan. */
  pictures: number;
};

/** More than any real document runs; a file built to run forever stops here. */
const MAX_OPERATIONS = 2_000_000;
const MAX_PAGES = 2000;
const MAX_FORM_DEPTH = 8;
/** If more than this share of the characters shown cannot be decoded, the text is not the document's. */
const MAX_UNDECODED_SHARE = 0.1;

/** The text of every page. Throws Locked if it needs a password, and Unreadable if it cannot be read. */
export async function pdfText(bytes: Uint8Array): Promise<PdfText> {
  const document = await PdfDocument.open(bytes);
  const reader = new TextReader(document);
  const pages = pageList(document);
  const texts: string[] = [];
  for (const page of pages) texts.push(await reader.page(page));
  if (reader.undecoded > reader.shown * MAX_UNDECODED_SHARE) {
    throw new Unreadable("The PDF's fonts do not say what their characters are.");
  }
  const text = texts
    .join("\n\n")
    .normalize("NFKC")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, pictures: reader.pictures };
}

type Page = {
  contents: PdfValue | undefined;
  resources: PdfDict | null;
  annotations: PdfValue | undefined;
};

/**
 * The pages in order, each with the resources it has or inherits. A page a
 * viewer would show is never skipped: past the limits, the PDF cannot be read.
 */
function pageList(document: PdfDocument): Page[] {
  const root = document.dict(document.trailer.get("Root"));
  const pages: Page[] = [];
  const seen = new Set<PdfDict>();
  const walk = (node: PdfDict | null, inherited: PdfDict | null, depth: number) => {
    if (!node || seen.has(node)) return;
    if (depth > 64) throw new Unreadable("The page tree nests too deep.");
    seen.add(node);
    const resources = document.dict(node.get("Resources")) ?? inherited;
    const kids = document.resolve(node.get("Kids"));
    if (Array.isArray(kids)) {
      for (const kid of kids) walk(document.dict(kid), resources, depth + 1);
    } else {
      if (pages.length >= MAX_PAGES) throw new Unreadable("The PDF has too many pages.");
      pages.push({ contents: node.get("Contents"), resources, annotations: node.get("Annots") });
    }
  };
  walk(document.dict(root?.get("Pages")), null, 0);
  return pages;
}

// Matrices: [a b c d e f], a point is [x y 1] times the matrix.

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

function matrixOf(values: PdfValue[]): Matrix | null {
  const numbers = values.map((value) => numberOf(value));
  return numbers.length === 6 && numbers.every((n) => n !== null) ? (numbers as Matrix) : null;
}

type State = {
  ctm: Matrix;
  font: Font | null;
  size: number;
  charSpacing: number;
  wordSpacing: number;
  scale: number;
  leading: number;
  rise: number;
};

class TextReader {
  shown = 0;
  undecoded = 0;
  pictures = 0;
  private operations = 0;
  private readonly fonts = new Map<PdfDict, Font>();
  private out: string[] = [];
  /** Where the last character ended, on the page, and how large it was. */
  private last: { x: number; y: number; size: number } | null = null;

  constructor(private readonly document: PdfDocument) {}

  async page(page: Page): Promise<string> {
    this.out = [];
    this.last = null;
    const contents = this.document.resolve(page.contents);
    const parts = Array.isArray(contents) ? contents : [page.contents];
    const streams: Uint8Array[] = [];
    for (const part of parts) {
      const stream = this.document.stream(part);
      if (stream) streams.push(await this.document.data(stream));
    }
    // A page's content streams are one stream, cut anywhere between tokens.
    const content = new Uint8Array(streams.reduce((sum, s) => sum + s.length + 1, 0));
    let at = 0;
    for (const s of streams) {
      content.set(s, at);
      content[at + s.length] = 0x0a;
      at += s.length + 1;
    }
    await this.run(content, page.resources, IDENTITY, 0);
    await this.annotations(page);
    return this.out.join("");
  }

  /**
   * What a viewer shows over the page: each annotation's appearance (a
   * FreeText note, a filled-in form field) and its text.
   */
  private async annotations(page: Page) {
    const annotations = this.document.resolve(page.annotations);
    if (!Array.isArray(annotations)) return;
    for (const value of annotations) {
      const annotation = this.document.dict(value);
      if (!annotation) continue;
      const appearances = this.document.dict(annotation.get("AP"));
      const normal = appearances?.get("N");
      const own = this.document.stream(normal);
      // One appearance, or one for each state (a checkbox's on and off).
      const states = own
        ? [own]
        : [...(this.document.dict(normal)?.values() ?? [])].flatMap((state) => {
            const stream = this.document.stream(state);
            return stream ? [stream] : [];
          });
      for (const stream of states) {
        this.lineBreak();
        await this.form(stream, page.resources, IDENTITY, 0);
      }
      const contents = bytesOf(this.document.resolve(annotation.get("Contents")));
      if (contents?.length) {
        this.lineBreak();
        this.out.push(textString(contents));
      }
    }
  }

  private lineBreak() {
    if (this.out.length > 0) this.out.push("\n");
    this.last = null;
  }

  private async run(content: Uint8Array, resources: PdfDict | null, ctm: Matrix, depth: number) {
    const document = this.document;
    const lexer = new Lexer(content);
    const stack: State[] = [];
    let state: State = {
      ctm,
      font: null,
      size: 0,
      charSpacing: 0,
      wordSpacing: 0,
      scale: 1,
      leading: 0,
      rise: 0,
    };
    let tm: Matrix = IDENTITY;
    let tlm: Matrix = IDENTITY;
    let operands: PdfValue[] = [];

    const moveLine = (tx: number, ty: number) => {
      tlm = multiply([1, 0, 0, 1, tx, ty], tlm);
      tm = tlm;
    };

    const show = (string: Uint8Array) => {
      const font = state.font;
      if (!font) return;
      for (const glyph of font.decode(string)) {
        const trm = multiply(
          [state.size * state.scale, 0, 0, state.size, 0, state.rise],
          multiply(tm, state.ctm),
        );
        this.place(glyph.text, trm);
        this.shown++;
        if (glyph.text === null) this.undecoded++;
        const advance =
          (glyph.width * state.size + state.charSpacing + (glyph.isSpace ? state.wordSpacing : 0)) *
          state.scale;
        tm = multiply([1, 0, 0, 1, advance, 0], tm);
        const end = multiply([1, 0, 0, 1, 0, state.rise], multiply(tm, state.ctm));
        this.last = { x: end[4], y: end[5], size: Math.hypot(trm[2], trm[3]) };
      }
    };

    for (;;) {
      const token = lexer.next();
      if (token === undefined) break;
      if (!(token instanceof PdfOp)) {
        operands.push(token);
        continue;
      }
      if (++this.operations > MAX_OPERATIONS) throw new Unreadable("The PDF runs too long.");
      const n = (i: number) => numberOf(operands[i]) ?? 0;
      switch (token.op) {
        case "q":
          stack.push({ ...state });
          break;
        case "Q":
          state = stack.pop() ?? state;
          break;
        case "cm": {
          const m = matrixOf(operands);
          if (m) state.ctm = multiply(m, state.ctm);
          break;
        }
        case "BT":
          tm = IDENTITY;
          tlm = IDENTITY;
          break;
        case "Tf": {
          const fonts = document.dict(resources?.get("Font"));
          const font = document.dict(fonts?.get(nameOf(operands[0]) ?? ""));
          state.font = font ? await this.font(font) : null;
          state.size = n(1);
          break;
        }
        case "Tc":
          state.charSpacing = n(0);
          break;
        case "Tw":
          state.wordSpacing = n(0);
          break;
        case "Tz":
          state.scale = n(0) / 100;
          break;
        case "TL":
          state.leading = n(0);
          break;
        case "Ts":
          state.rise = n(0);
          break;
        case "Td":
          moveLine(n(0), n(1));
          break;
        case "TD":
          state.leading = -n(1);
          moveLine(n(0), n(1));
          break;
        case "Tm": {
          const m = matrixOf(operands);
          if (m) tm = tlm = m;
          break;
        }
        case "T*":
          moveLine(0, -state.leading);
          break;
        case "Tj":
          show(bytesOf(operands[0]) ?? new Uint8Array(0));
          break;
        case "'":
          moveLine(0, -state.leading);
          show(bytesOf(operands[0]) ?? new Uint8Array(0));
          break;
        case '"':
          state.wordSpacing = n(0);
          state.charSpacing = n(1);
          moveLine(0, -state.leading);
          show(bytesOf(operands[2]) ?? new Uint8Array(0));
          break;
        case "TJ": {
          const items = Array.isArray(operands[0]) ? operands[0] : [];
          for (const item of items) {
            if (item instanceof Uint8Array) {
              show(item);
            } else if (typeof item === "number") {
              tm = multiply([1, 0, 0, 1, (-item / 1000) * state.size * state.scale, 0], tm);
            }
          }
          break;
        }
        case "Do": {
          const xobjects = document.dict(resources?.get("XObject"));
          const name = nameOf(operands[0]);
          const stream = name ? document.stream(xobjects?.get(name)) : null;
          if (stream) await this.xobject(stream, resources, state.ctm, depth);
          break;
        }
        case "ID":
          // An inline picture's data runs to "EI".
          this.pictures++;
          skipInlineImage(lexer);
          break;
      }
      operands = [];
    }
  }

  private async xobject(stream: PdfStream, resources: PdfDict | null, ctm: Matrix, depth: number) {
    const subtype = nameOf(stream.dict.get("Subtype"));
    if (subtype === "Image") {
      this.pictures++;
      return;
    }
    if (subtype === "Form") await this.form(stream, resources, ctm, depth);
  }

  private async form(stream: PdfStream, resources: PdfDict | null, ctm: Matrix, depth: number) {
    // A form drawn inside forms deeper than any real file nests is not skipped: it cannot be read.
    if (depth >= MAX_FORM_DEPTH) throw new Unreadable("Forms nest too deep.");
    const stated = this.document.resolve(stream.dict.get("Matrix"));
    const matrix = matrixOf(Array.isArray(stated) ? stated : []);
    const own = this.document.dict(stream.dict.get("Resources"));
    await this.run(
      await this.document.data(stream),
      own ?? resources,
      multiply(matrix ?? IDENTITY, ctm),
      depth + 1,
    );
  }

  /** Puts a character where it lands: after a space if it is apart from the last, on a new line if it is below. */
  private place(text: string | null, trm: Matrix) {
    const size = Math.hypot(trm[2], trm[3]) || 1;
    const last = this.last;
    if (last && this.out.length > 0) {
      const length = Math.hypot(trm[0], trm[1]) || 1;
      const [ux, uy] = [trm[0] / length, trm[1] / length];
      const dx = trm[4] - last.x;
      const dy = trm[5] - last.y;
      const along = dx * ux + dy * uy;
      const across = -dx * uy + dy * ux;
      const lineSize = Math.max(size, last.size);
      if (Math.abs(across) > lineSize * 0.5 || along < -lineSize * 2) {
        this.out.push("\n");
      } else if (along > lineSize * 0.15) {
        this.out.push(" ");
      }
    }
    if (text) this.out.push(text);
  }

  private async font(dict: PdfDict): Promise<Font> {
    let font = this.fonts.get(dict);
    if (!font) {
      font = await readFont(this.document, dict);
      this.fonts.set(dict, font);
    }
    return font;
  }
}

/** A text string: UTF-16 or UTF-8 after a byte order mark, else one byte a character. */
function textString(bytes: Uint8Array): string {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return utf16(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder().decode(bytes.subarray(3));
  }
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

/** Moves past an inline picture's data: to whitespace, "EI", and whitespace or the end. */
function skipInlineImage(lexer: Lexer) {
  const { bytes } = lexer;
  let at = lexer.at + 1; // One whitespace byte follows "ID".
  for (; at + 1 < lexer.end; at++) {
    if (
      bytes[at] === 0x45 &&
      bytes[at + 1] === 0x49 &&
      [0x20, 0x0a, 0x0d, 0x09].includes(bytes[at - 1]!) &&
      (at + 2 >= lexer.end || [0x20, 0x0a, 0x0d, 0x09].includes(bytes[at + 2]!))
    ) {
      lexer.at = at + 2;
      return;
    }
  }
  lexer.at = lexer.end;
}

// Fonts

type Glyph = { text: string | null; width: number; isSpace: boolean };

type Font = { decode(string: Uint8Array): Glyph[] };

async function readFont(document: PdfDocument, dict: PdfDict): Promise<Font> {
  const toUnicode = await readCMap(document, dict.get("ToUnicode"));
  const subtype = nameOf(dict.get("Subtype"));
  if (subtype === "Type0") return compositeFont(document, dict, toUnicode);
  return simpleFont(document, dict, subtype, toUnicode);
}

function simpleFont(
  document: PdfDocument,
  dict: PdfDict,
  subtype: string | null,
  toUnicode: CMap | null,
): Font {
  const encoding = document.resolve(dict.get("Encoding"));
  const base =
    namedEncoding(nameOf(encoding)) ??
    (isDict(encoding) ? namedEncoding(nameOf(encoding.get("BaseEncoding"))) : null) ??
    (subtype === "TrueType" ? WIN_ANSI : STANDARD);
  const codes: (string | null | undefined)[] = [...base];
  const differences = isDict(encoding) ? document.resolve(encoding.get("Differences")) : null;
  if (Array.isArray(differences)) {
    let code = 0;
    for (const item of differences) {
      if (typeof item === "number") code = item;
      else if (nameOf(item) !== null && code < 256) codes[code++] = glyphText(nameOf(item)!);
    }
  }

  const firstChar = numberOf(document.resolve(dict.get("FirstChar"))) ?? 0;
  const widths = document.resolve(dict.get("Widths"));
  const descriptor = document.dict(dict.get("FontDescriptor"));
  const missing = numberOf(document.resolve(descriptor?.get("MissingWidth"))) ?? 500;
  // A Type 3 font's widths are in its own glyph space, scaled by its matrix.
  const fontMatrix = document.resolve(dict.get("FontMatrix"));
  const unit =
    subtype === "Type3" && Array.isArray(fontMatrix) ? (numberOf(fontMatrix[0]) ?? 0.001) : 0.001;

  return {
    decode(string) {
      return Array.from(string, (code) => {
        const mapped = toUnicode?.lookup(code, 1);
        const width = Array.isArray(widths)
          ? numberOf(document.resolve(widths[code - firstChar]))
          : null;
        return {
          text: mapped ?? codes[code] ?? null,
          width: (width ?? missing) * unit,
          isSpace: code === 0x20,
        };
      });
    },
  };
}

async function compositeFont(
  document: PdfDocument,
  dict: PdfDict,
  toUnicode: CMap | null,
): Promise<Font> {
  const descendants = document.resolve(dict.get("DescendantFonts"));
  const descendant = document.dict(Array.isArray(descendants) ? descendants[0] : undefined);
  const defaultWidth = numberOf(document.resolve(descendant?.get("DW"))) ?? 1000;
  const widths = cidWidths(document, document.resolve(descendant?.get("W")));
  // Identity-H and Identity-V are two bytes a code, each code its own CID. An
  // embedded CMap says how long its codes are, and maps them to CIDs, which
  // only set widths; the text is the ToUnicode map's.
  const named = nameOf(document.resolve(dict.get("Encoding")));
  const cids = named ? null : await readCMap(document, dict.get("Encoding"));
  const codespace =
    named === "Identity-H" || named === "Identity-V"
      ? TWO_BYTES
      : cids?.codespace.length
        ? cids.codespace
        : toUnicode?.codespace.length
          ? toUnicode.codespace
          : TWO_BYTES;
  return {
    decode(string) {
      const glyphs: Glyph[] = [];
      for (let at = 0; at < string.length;) {
        const { code, length } = nextCode(string, at, codespace);
        at += length;
        const cid = cids?.cid(code, length) ?? code;
        glyphs.push({
          text: toUnicode?.lookup(code, length) ?? null,
          width: (widths.get(cid) ?? defaultWidth) / 1000,
          isSpace: length === 1 && code === 0x20,
        });
      }
      return glyphs;
    },
  };
}

/** A CIDFont's /W: `c [w1 w2 …]` gives widths from c on; `c1 c2 w` gives c1 to c2 one width. */
function cidWidths(document: PdfDocument, w: PdfValue | undefined): Map<number, number> {
  const widths = new Map<number, number>();
  if (!Array.isArray(w)) return widths;
  for (let i = 0; i < w.length;) {
    const first = numberOf(w[i]);
    const next = document.resolve(w[i + 1]);
    if (first === null) break;
    if (Array.isArray(next)) {
      next.forEach((width, j) => widths.set(first + j, numberOf(document.resolve(width)) ?? 0));
      i += 2;
    } else {
      const last = numberOf(next);
      const width = numberOf(document.resolve(w[i + 2]));
      if (last === null || width === null) break;
      for (let cid = first; cid <= Math.min(last, first + 0xffff); cid++) widths.set(cid, width);
      i += 3;
    }
  }
  return widths;
}

// CMaps: a ToUnicode CMap maps codes to text; an encoding CMap maps them to CIDs.

type Range = { low: number; high: number; length: number };
const TWO_BYTES: Range[] = [{ low: 0, high: 0xffff, length: 2 }];

type CMap = {
  codespace: Range[];
  lookup(code: number, length: number): string | null;
  cid(code: number, length: number): number | null;
};

/** The next code: the shortest whose bytes fall in a codespace range, else one byte. */
function nextCode(string: Uint8Array, at: number, codespace: Range[]) {
  let code = 0;
  for (let length = 1; length <= 4 && at + length <= string.length; length++) {
    code = code * 256 + string[at + length - 1]!;
    if (codespace.some((r) => r.length === length && code >= r.low && code <= r.high)) {
      return { code, length };
    }
  }
  return { code: string[at]!, length: 1 };
}

function numberFrom(bytes: Uint8Array): number {
  let value = 0;
  for (const byte of bytes) value = value * 256 + byte;
  return value;
}

function utf16(bytes: Uint8Array): string {
  const units: number[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) units.push(bytes[i]! * 256 + bytes[i + 1]!);
  if (bytes.length % 2) units.push(bytes.at(-1)!);
  return String.fromCharCode(...units);
}

async function readCMap(document: PdfDocument, value: PdfValue | undefined): Promise<CMap | null> {
  const stream = document.stream(value);
  if (!stream) return null;
  let data: Uint8Array;
  try {
    data = await document.data(stream);
  } catch {
    return null; // A broken map leaves its codes undecoded, which is counted.
  }
  const codespace: Range[] = [];
  const chars = new Map<string, string>();
  const ranges: { low: number; high: number; length: number; to: Uint8Array | Uint8Array[] }[] = [];
  const cidChars = new Map<string, number>();
  const cidRanges: { low: number; high: number; length: number; cid: number }[] = [];
  const lexer = new Lexer(data);
  let section: string | null = null;
  let operands: PdfValue[] = [];
  for (;;) {
    let token: PdfValue | PdfOp | undefined;
    try {
      token = lexer.next();
    } catch {
      break;
    }
    if (token === undefined) break;
    if (!(token instanceof PdfOp)) {
      operands.push(token);
      if (section === null) continue;
      const step = section === "bfrange" || section === "cidrange" ? 3 : 2;
      if (section === "codespacerange" && operands.length === 2) {
        const [low, high] = operands.map(bytesOf);
        if (low && high)
          codespace.push({ low: numberFrom(low), high: numberFrom(high), length: low.length });
        operands = [];
      } else if (operands.length === step) {
        const source = bytesOf(operands[0]);
        if (source) {
          const key = `${source.length}:${numberFrom(source)}`;
          if (section === "bfchar") {
            const to = bytesOf(operands[1]);
            if (to) chars.set(key, utf16(to));
          } else if (section === "cidchar") {
            const cid = numberOf(operands[1]);
            if (cid !== null) cidChars.set(key, cid);
          } else {
            const high = bytesOf(operands[1]);
            if (high) {
              const range = {
                low: numberFrom(source),
                high: numberFrom(high),
                length: source.length,
              };
              if (section === "bfrange") {
                const to = operands[2];
                if (to instanceof Uint8Array) ranges.push({ ...range, to });
                else if (Array.isArray(to)) {
                  ranges.push({
                    ...range,
                    to: to.filter((t): t is Uint8Array => t instanceof Uint8Array),
                  });
                }
              } else {
                const cid = numberOf(operands[2]);
                if (cid !== null) cidRanges.push({ ...range, cid });
              }
            }
          }
        }
        operands = [];
      }
      continue;
    }
    const begin = /^begin(codespacerange|bfchar|bfrange|cidchar|cidrange)$/.exec(token.op);
    section = begin ? begin[1]! : null;
    operands = [];
  }
  return {
    codespace,
    lookup(code, length) {
      const char = chars.get(`${length}:${code}`);
      if (char !== undefined) return char;
      for (const range of ranges) {
        if (range.length !== length || code < range.low || code > range.high) continue;
        const offset = code - range.low;
        if (Array.isArray(range.to)) {
          const to = range.to[offset];
          return to ? utf16(to) : null;
        }
        // The destination's last unit counts up through the range.
        const to = range.to.slice();
        const last = to.length >= 2 ? to[to.length - 2]! * 256 + to.at(-1)! + offset : offset;
        if (to.length >= 2) {
          to[to.length - 2] = (last >> 8) & 0xff;
          to[to.length - 1] = last & 0xff;
        }
        return utf16(to);
      }
      return null;
    },
    cid(code, length) {
      const cid = cidChars.get(`${length}:${code}`);
      if (cid !== undefined) return cid;
      for (const range of cidRanges) {
        if (range.length === length && code >= range.low && code <= range.high) {
          return range.cid + code - range.low;
        }
      }
      return null;
    },
  };
}
