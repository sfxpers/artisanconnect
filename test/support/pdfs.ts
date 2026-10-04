import { createCipheriv, createHash, randomBytes } from "node:crypto";

// PDFs built byte by byte, for what the fixtures saved by macOS's PDF writer
// (RC4 and AES-128) do not cover: AES-256 encryption, a composite font whose
// text is only known through its ToUnicode map, a script packed into an
// encrypted object stream, and a page that is only a picture.

export type TextPdfOptions = {
  /** Each line of text, one under another. */
  lines?: string[];
  /** A simple font with WinAnsiEncoding, or a composite one (Identity-H) with a ToUnicode map. */
  font?: "simple" | "composite";
  /** AES-256 (revision 6), opening without a password unless one is given. */
  aes256?: { userPassword?: string };
  /** A JavaScript action, packed into an object stream. */
  script?: boolean;
  /** The page is a picture and has no text, as a scan is. */
  scanned?: boolean;
  /** Operators the page runs before its text, as a damaged or hostile file may hold. */
  before?: string;
  /** A FreeText annotation over the page, whose appearance shows this text. */
  note?: string;
};

export async function textPdf({
  lines = [],
  font = "simple",
  aes256,
  script = false,
  scanned = false,
  before = "",
  note,
}: TextPdfOptions = {}): Promise<Uint8Array<ArrayBuffer>> {
  const objects = new Map<number, { dict: string; stream?: Uint8Array }>();
  const catalog = `<< /Type /Catalog /Pages 2 0 R${script ? " /OpenAction 6 0 R" : ""} >>`;
  objects.set(1, { dict: catalog });
  objects.set(2, { dict: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" });
  objects.set(3, {
    dict: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 7 0 R >> >> /Contents 5 0 R${note ? " /Annots [13 0 R]" : ""} >>`,
  });

  const codes = new Map<string, number>();
  const show = (line: string) => {
    if (font === "simple") return `(${line.replace(/[\\()]/g, (c) => `\\${c}`)}) Tj`;
    const hex = [...line]
      .map((char) => {
        if (!codes.has(char)) codes.set(char, codes.size + 3);
        return codes.get(char)!.toString(16).padStart(4, "0");
      })
      .join("");
    return `<${hex}> Tj`;
  };
  const content = scanned
    ? "q 595 0 0 842 0 0 cm /Im1 Do Q"
    : `${before} BT /F1 12 Tf 72 760 Td 14 TL ${lines.map((line) => `${show(line)} T*`).join(" ")} ET`;
  objects.set(5, { dict: "<< /Filter /FlateDecode >>", stream: await deflate(ascii(content)) });
  objects.set(7, {
    dict: "<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 >>",
    stream: new Uint8Array([0xff]),
  });

  if (font === "simple") {
    objects.set(4, {
      dict: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    });
  } else {
    objects.set(4, {
      dict: "<< /Type /Font /Subtype /Type0 /BaseFont /ABCDEF+Sans /Encoding /Identity-H /DescendantFonts [8 0 R] /ToUnicode 9 0 R >>",
    });
    objects.set(8, {
      dict: "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /ABCDEF+Sans /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 556 >>",
    });
    const chars = [...codes]
      .map(([char, code]) => {
        const utf16 = [...char].flatMap((c) => {
          const units = c.length === 2 ? [c.charCodeAt(0), c.charCodeAt(1)] : [c.charCodeAt(0)];
          return units.map((unit) => unit.toString(16).padStart(4, "0"));
        });
        return `<${code.toString(16).padStart(4, "0")}> <${utf16.join("")}>`;
      })
      .join("\n");
    const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap
/CMapName /Adobe-Identity-UCS def /CMapType 2 def
1 begincodespacerange <0000> <FFFF> endcodespacerange
${codes.size} beginbfchar
${chars}
endbfchar
endcmap CMapName currentdict /CMap defineresource pop end end`;
    objects.set(9, { dict: "<< /Filter /FlateDecode >>", stream: await deflate(ascii(cmap)) });
  }

  if (script) {
    // Object 6, the action, is packed into object stream 10, so it is only seen once unpacked.
    const offsets = "6 0 ";
    const packed = `${offsets}<< /S /JavaScript /JS (app.alert\\(1\\)) >>`;
    objects.set(10, {
      dict: `<< /Type /ObjStm /N 1 /First ${offsets.length} /Filter /FlateDecode >>`,
      stream: await deflate(ascii(packed)),
    });
  }
  objects.set(11, { dict: "<< /Title (Confirmation of banking details) >>" });
  if (note) {
    objects.set(13, {
      dict: "<< /Type /Annot /Subtype /FreeText /Rect [300 700 560 730] /DA (/F1 10 Tf 0 g) /AP << /N 14 0 R >> >>",
    });
    objects.set(14, {
      dict: "<< /Type /XObject /Subtype /Form /BBox [0 0 260 30] /Resources << /Font << /F1 4 0 R >> >> >>",
      stream: ascii(`BT /F1 10 Tf 2 10 Td (${note}) Tj ET`),
    });
  }

  const id = randomBytes(16);
  let encryption: Encryption | null = null;
  if (aes256) {
    encryption = aes256Encryption(aes256.userPassword ?? "");
    objects.set(12, { dict: encryption.dict });
  }

  const parts: Uint8Array[] = [ascii("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")];
  for (const [num, object] of [...objects].sort(([a], [b]) => a - b)) {
    let dict = object.dict;
    let stream = object.stream;
    if (encryption && num !== 12) {
      // Every string and stream but the encryption dictionary's own.
      const key = encryption.key;
      dict = dict.replace(/\(((?:\\.|[^\\)])*)\)/g, (_, raw: string) => {
        const plain = ascii(raw.replace(/\\(.)/g, "$1"));
        return `<${hex(aesEncrypt(key, plain))}>`;
      });
      if (stream) stream = aesEncrypt(key, stream);
    }
    if (stream) {
      dict = dict.replace(/>>$/, ` /Length ${stream.length} >>`);
      parts.push(ascii(`${num} 0 obj\n${dict}\nstream\n`), stream, ascii("\nendstream\nendobj\n"));
    } else {
      parts.push(ascii(`${num} 0 obj\n${dict}\nendobj\n`));
    }
  }
  const trailer = `<< /Root 1 0 R /Info 11 0 R /Size 15${encryption ? " /Encrypt 12 0 R" : ""} /ID [<${hex(id)}> <${hex(id)}>] >>`;
  parts.push(ascii(`trailer\n${trailer}\n%%EOF\n`));
  return concat(...parts);
}

// AES-256, the standard security handler's revision 6

type Encryption = { key: Uint8Array; dict: string };

function aes256Encryption(userPassword: string): Encryption {
  const key = randomBytes(32);
  const password = new TextEncoder().encode(userPassword);
  const validationSalt = randomBytes(8);
  const keySalt = randomBytes(8);
  const empty = new Uint8Array(0);
  const u = concat(revision6Hash(password, validationSalt, empty), validationSalt, keySalt);
  const ue = aesNoPadding(revision6Hash(password, keySalt, empty), key);
  // The owner password is never used to open the file; any value will do.
  const owner = new TextEncoder().encode("owner");
  const ownerValidation = randomBytes(8);
  const ownerKeySalt = randomBytes(8);
  const o = concat(revision6Hash(owner, ownerValidation, u), ownerValidation, ownerKeySalt);
  const oe = aesNoPadding(revision6Hash(owner, ownerKeySalt, u), key);
  return {
    key,
    dict: `<< /Filter /Standard /V 5 /R 6 /Length 256 /CF << /StdCF << /AuthEvent /DocOpen /CFM /AESV3 /Length 32 >> >> /StmF /StdCF /StrF /StdCF /O <${hex(o)}> /U <${hex(u)}> /OE <${hex(oe)}> /UE <${hex(ue)}> /Perms <${hex(randomBytes(16))}> /P -1028 >>`,
  };
}

/** Algorithm 2.B of ISO 32000-2. */
function revision6Hash(password: Uint8Array, salt: Uint8Array, userData: Uint8Array) {
  let k = sha("sha256", concat(password, salt, userData));
  let e: Uint8Array = new Uint8Array(0);
  for (let round = 0; round < 64 || e.at(-1)! > round - 32; round++) {
    const block = concat(password, k, userData);
    const k1 = concat(...Array.from({ length: 64 }, () => block));
    const cipher = createCipheriv("aes-128-cbc", k.subarray(0, 16), k.subarray(16, 32));
    cipher.setAutoPadding(false);
    e = concat(cipher.update(k1), cipher.final());
    const remainder = e.subarray(0, 16).reduce((sum, byte) => sum + byte, 0) % 3;
    k = sha((["sha256", "sha384", "sha512"] as const)[remainder]!, e);
  }
  return k.subarray(0, 32);
}

function aesNoPadding(key: Uint8Array, data: Uint8Array): Uint8Array {
  const cipher = createCipheriv("aes-256-cbc", key, new Uint8Array(16));
  cipher.setAutoPadding(false);
  return concat(cipher.update(data), cipher.final());
}

/** A random IV, then the data with PKCS#7 padding. */
function aesEncrypt(key: Uint8Array, data: Uint8Array): Uint8Array {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  return concat(iv, cipher.update(data), cipher.final());
}

function sha(algorithm: "sha256" | "sha384" | "sha512", data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash(algorithm).update(data).digest());
}

// Bytes

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One byte per character, as PDF syntax is written. */
function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
