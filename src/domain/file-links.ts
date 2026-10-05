import type { Context } from "./context";

// A stored file the Admin opens on a logged click (an identity document, a
// photo in a Conversation) is reached through a link the logged read hands
// out: signed, so nothing else makes one, and short-lived, so a link kept is
// not a way round the log. The file itself is served only to an Admin.

/** How long a link works after the read that made it. */
const LINK_MINUTES = 15;

const encoder = new TextEncoder();

/** The web app's path to a stored file, for an Admin, for a while. */
export async function fileLink(ctx: Context, key: string): Promise<string> {
  const until = ctx.now().getTime() + LINK_MINUTES * 60_000;
  const payload = base64Url(encoder.encode(JSON.stringify({ key, until })));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(ctx),
    encoder.encode(payload),
  );
  return `/admin/files/${payload}.${base64Url(new Uint8Array(signature))}`;
}

/** The stored file's key, if the link was made here and still works. */
export async function keyOfLink(ctx: Context, token: string): Promise<string | null> {
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length > 0) return null;
  try {
    const signed = await crypto.subtle.verify(
      "HMAC",
      await signingKey(ctx),
      fromBase64Url(signature),
      encoder.encode(payload),
    );
    if (!signed) return null;
    const { key, until } = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as {
      key: unknown;
      until: unknown;
    };
    if (typeof key !== "string" || typeof until !== "number") return null;
    return ctx.now().getTime() <= until ? key : null;
  } catch {
    return null;
  }
}

function signingKey(ctx: Context) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`file-links:${ctx.config.authSecret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
