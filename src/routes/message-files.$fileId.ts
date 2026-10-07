import { createFileRoute } from "@tanstack/react-router";
import { requestActor, requestDomain } from "@/web/session";

// A file in a message (a photo, a voice note, or a PDF), or a photo's
// thumbnail with ?size=thumbnail. The domain module serves it only to the
// parties who see the message, and to the Admin for a Held one, so nothing
// caches it. A part of it is served when asked for, as Safari plays a voice
// note only from a server that does.
export const Route = createFileRoute("/message-files/$fileId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const domain = requestDomain();
        const file = await domain.conversations.file(await requestActor(domain), {
          fileId: params.fileId,
          thumbnail: new URL(request.url).searchParams.get("size") === "thumbnail",
        });
        if (!file) return new Response("Not found", { status: 404 });
        const headers = {
          "content-type": file.contentType,
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
          "accept-ranges": "bytes",
        };
        const asked = request.headers.get("range");
        if (!asked) {
          return new Response(file.body, {
            headers: { ...headers, "content-length": String(file.size) },
          });
        }
        const part = byteRange(asked, file.size);
        if (!part) {
          await file.body.cancel();
          return new Response(null, {
            status: 416,
            headers: { ...headers, "content-range": `bytes */${file.size}` },
          });
        }
        // A file is at most 10 MB, so the part is cut from the whole.
        const bytes = await new Response(file.body).arrayBuffer();
        return new Response(bytes.slice(part.start, part.end + 1), {
          status: 206,
          headers: {
            ...headers,
            "content-length": String(part.end - part.start + 1),
            "content-range": `bytes ${part.start}-${part.end}/${file.size}`,
          },
        });
      },
    },
  },
});

/** The first byte and the last of a single range ("bytes=0-1", "bytes=100-", "bytes=-500"); null if it cannot be served. */
function byteRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    return suffix > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : null;
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start <= end ? { start, end } : null;
}
