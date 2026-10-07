import { createFileRoute } from "@tanstack/react-router";
import { requestActor, requestDomain } from "@/web/session";

// A Completion's photo or document, or a photo's thumbnail with ?size=thumbnail.
// The domain module serves it only to the Engagement's parties, and to the
// Admin for a Completion that was Held, so nothing caches it.
export const Route = createFileRoute("/completion-files/$fileId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const domain = requestDomain();
        const file = await domain.engagements.completionFile(await requestActor(domain), {
          fileId: params.fileId,
          thumbnail: new URL(request.url).searchParams.get("size") === "thumbnail",
        });
        if (!file) return new Response("Not found", { status: 404 });
        return new Response(file.body, {
          headers: {
            "content-type": file.contentType,
            "content-length": String(file.size),
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
