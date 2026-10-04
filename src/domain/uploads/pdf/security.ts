import { createDecipheriv, createCipheriv, createHash } from "node:crypto";
import { Locked } from "../bytes";
import { bytesOf, isDict, nameOf, numberOf, type PdfDict } from "./syntax";

// The standard security handler, opened with the empty user password: a PDF
// that opens without asking for one, such as a bank letter or a generated
// certificate that only forbids editing or copying. Its strings and streams
// are encrypted with RC4 (40 to 128 bits), AES-128, or AES-256. A PDF that
// needs a password to open, or uses another handler, cannot be read.

/** How the strings and streams of one PDF are decrypted. */
export type Security = {
  decryptString(data: Uint8Array, num: number, gen: number): Uint8Array;
  decryptStream(data: Uint8Array, num: number, gen: number): Uint8Array;
};

type Method = "none" | "rc4" | "aes";

/** The 32 bytes a password is padded with (Algorithm 2). */
const PADDING = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

function locked(): never {
  throw new Locked("The PDF needs a password to open.");
}

/** Opens the PDF's encryption with the empty user password. Throws Locked if that does not open it. */
export function openSecurity(encrypt: PdfDict, id: Uint8Array): Security {
  if (nameOf(encrypt.get("Filter")) !== "Standard") locked();
  const version = numberOf(encrypt.get("V")) ?? 0;
  const revision = numberOf(encrypt.get("R")) ?? 0;
  const owner = bytesOf(encrypt.get("O"));
  const user = bytesOf(encrypt.get("U"));
  const permissions = numberOf(encrypt.get("P"));
  if (!owner || !user || permissions === null) locked();

  if (version === 5) {
    if (revision !== 5 && revision !== 6) locked();
    const key = aes256FileKey(encrypt, user, revision);
    const methods = cryptFilterMethods(encrypt, "aes");
    return securityFrom(methods, () => key);
  }

  if (version !== 1 && version !== 2 && version !== 4) locked();
  if (revision < 2 || revision > 4) locked();
  const length = version === 4 ? 16 : Math.floor((numberOf(encrypt.get("Length")) ?? 40) / 8);
  if (length < 5 || length > 16) locked();
  const encryptMetadata = encrypt.get("EncryptMetadata") !== false;
  const key = rc4FileKey({ owner, permissions, id, revision, length, encryptMetadata });
  if (!opensWithEmptyPassword(key, user, id, revision)) locked();
  const methods =
    version === 4
      ? cryptFilterMethods(encrypt, "rc4")
      : ({ string: "rc4", stream: "rc4" } as const);
  return securityFrom(methods, (num, gen, method) => objectKey(key, num, gen, method));
}

function securityFrom(
  methods: { string: Method; stream: Method },
  keyFor: (num: number, gen: number, method: Method) => Uint8Array,
): Security {
  const decrypt = (method: Method, data: Uint8Array, num: number, gen: number) => {
    if (method === "none") return data;
    const key = keyFor(num, gen, method);
    return method === "rc4" ? rc4(key, data) : aesDecrypt(key, data);
  };
  return {
    decryptString: (data, num, gen) => decrypt(methods.string, data, num, gen),
    decryptStream: (data, num, gen) => decrypt(methods.stream, data, num, gen),
  };
}

/** Version 4 and 5 name crypt filters for strings and streams; each says its method. */
function cryptFilterMethods(encrypt: PdfDict, fallback: Method) {
  const filters = encrypt.get("CF");
  const methodOf = (name: string | null): Method => {
    if (name === null || name === "Identity") return "none";
    const filter = isDict(filters) ? filters.get(name) : undefined;
    if (!isDict(filter)) return fallback;
    switch (nameOf(filter.get("CFM"))) {
      case "None":
        return "none";
      case "V2":
        return "rc4";
      case "AESV2":
      case "AESV3":
        return "aes";
      default:
        return locked();
    }
  };
  return {
    string: methodOf(nameOf(encrypt.get("StrF"))),
    stream: methodOf(nameOf(encrypt.get("StmF"))),
  };
}

// RC4 and AES-128 (revisions 2 to 4)

/** Algorithm 2, with the empty password. */
function rc4FileKey(input: {
  owner: Uint8Array;
  permissions: number;
  id: Uint8Array;
  revision: number;
  length: number;
  encryptMetadata: boolean;
}): Uint8Array {
  const p = new Uint8Array(4);
  new DataView(p.buffer).setInt32(0, input.permissions | 0, true);
  const parts = [PADDING, input.owner.subarray(0, 32), p, input.id];
  if (input.revision >= 4 && !input.encryptMetadata)
    parts.push(new Uint8Array([255, 255, 255, 255]));
  let hash = md5(...parts);
  if (input.revision >= 3) {
    for (let i = 0; i < 50; i++) hash = md5(hash.subarray(0, input.length));
  }
  return hash.subarray(0, input.length);
}

/** Algorithms 4 and 5: whether the key from the empty password makes the stored user value. */
function opensWithEmptyPassword(
  key: Uint8Array,
  user: Uint8Array,
  id: Uint8Array,
  revision: number,
): boolean {
  if (revision === 2) return equal(rc4(key, PADDING), user.subarray(0, 32));
  let value = md5(PADDING, id);
  for (let i = 0; i < 20; i++)
    value = rc4(
      key.map((byte) => byte ^ i),
      value,
    );
  return equal(value, user.subarray(0, 16));
}

/** Algorithm 1: each object's key, from the file's key and the object's number. */
function objectKey(key: Uint8Array, num: number, gen: number, method: Method): Uint8Array {
  const object = new Uint8Array([num, num >> 8, num >> 16, gen, gen >> 8]);
  const salt = method === "aes" ? [new Uint8Array([0x73, 0x41, 0x6c, 0x54])] : []; // "sAlT"
  return md5(key, object, ...salt).subarray(0, Math.min(key.length + 5, 16));
}

// AES-256 (revisions 5 and 6)

function aes256FileKey(encrypt: PdfDict, user: Uint8Array, revision: number): Uint8Array {
  const userKey = bytesOf(encrypt.get("UE"));
  if (user.length < 48 || !userKey || userKey.length < 32) locked();
  const empty = new Uint8Array(0);
  const hash = (salt: Uint8Array) =>
    revision === 5 ? sha("sha256", salt) : revision6Hash(empty, salt, empty);
  if (!equal(hash(user.subarray(32, 40)), user.subarray(0, 32))) locked();
  const decipher = createDecipheriv("aes-256-cbc", hash(user.subarray(40, 48)), new Uint8Array(16));
  decipher.setAutoPadding(false);
  return concat(decipher.update(userKey.subarray(0, 32)), decipher.final());
}

/** Algorithm 2.B, for a password, a salt, and (for the owner) the user value. */
function revision6Hash(password: Uint8Array, salt: Uint8Array, userData: Uint8Array): Uint8Array {
  let k = sha("sha256", password, salt, userData);
  let e: Uint8Array = new Uint8Array(0);
  for (let round = 0; round < 64 || e.at(-1)! > round - 32; round++) {
    const block = concat(password, k, userData);
    const k1 = new Uint8Array(block.length * 64);
    for (let i = 0; i < 64; i++) k1.set(block, i * block.length);
    const cipher = createCipheriv("aes-128-cbc", k.subarray(0, 16), k.subarray(16, 32));
    cipher.setAutoPadding(false);
    e = concat(cipher.update(k1), cipher.final());
    // The first 16 bytes as a number, modulo 3, is their sum modulo 3, as 256 is 1 modulo 3.
    let sum = 0;
    for (let i = 0; i < 16; i++) sum += e[i]!;
    k = sha((["sha256", "sha384", "sha512"] as const)[sum % 3]!, e);
  }
  return k.subarray(0, 32);
}

// Ciphers

export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i]! + key[i % key.length]!) & 0xff;
    [s[i], s[j]] = [s[j]!, s[i]!];
  }
  const out = new Uint8Array(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]!) & 0xff;
    [s[i], s[j]] = [s[j]!, s[i]!];
    out[n] = data[n]! ^ s[(s[i]! + s[j]!) & 0xff]!;
  }
  return out;
}

/** AES in CBC mode, with the IV first; the padding is removed if it is good, as some writers get it wrong. */
function aesDecrypt(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length < 32) return new Uint8Array(0); // Only an IV, or less: empty.
  const body = data.subarray(16, 16 + Math.floor((data.length - 16) / 16) * 16);
  const decipher = createDecipheriv(`aes-${key.length * 8}-cbc`, key, data.subarray(0, 16));
  decipher.setAutoPadding(false);
  const plain = concat(decipher.update(body), decipher.final());
  const pad = plain.at(-1)!;
  const padded = pad >= 1 && pad <= 16 && plain.subarray(-pad).every((byte) => byte === pad);
  return padded ? plain.subarray(0, plain.length - pad) : plain;
}

function md5(...parts: Uint8Array[]): Uint8Array {
  const hash = createHash("md5");
  for (const part of parts) hash.update(part);
  return new Uint8Array(hash.digest());
}

function sha(algorithm: "sha256" | "sha384" | "sha512", ...parts: Uint8Array[]): Uint8Array {
  const hash = createHash(algorithm);
  for (const part of parts) hash.update(part);
  return new Uint8Array(hash.digest());
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}
