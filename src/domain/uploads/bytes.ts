/** The file is damaged, or not what its first bytes say it is. */
export class Unreadable extends Error {}

/** A PDF locked with a password, whose contents cannot be read. */
export class Locked extends Unreadable {}

export function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function ascii(bytes: Uint8Array, start: number, length: number): string {
  return latin1(bytes.subarray(start, start + length));
}

/** One character per byte, so offsets in the text are offsets in the bytes. */
export function latin1(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return text;
}

export function startsWith(bytes: Uint8Array, prefix: readonly number[] | string, at = 0): boolean {
  const expected = typeof prefix === "string" ? [...prefix].map((c) => c.charCodeAt(0)) : prefix;
  return expected.every((byte, i) => bytes[at + i] === byte);
}

/** Throws Unreadable if `length` bytes from `start` are not all in the file. */
export function need(bytes: Uint8Array, start: number, length: number): void {
  if (start < 0 || length < 0 || start + length > bytes.length) {
    throw new Unreadable("The file ends too soon.");
  }
}
