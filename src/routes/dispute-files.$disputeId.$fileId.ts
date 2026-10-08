import { createFileRoute } from "@tanstack/react-router";
import { requestActor, requestDomain } from "@/web/session";

// A Dispute's photo, or its thumbnail with ?size=thumbnail (#135). The domain
// module serves it only to its opener, the other party once the Content check
// passed it, and the Admin, so nothing caches it.
export const Route = createFileRoute("/dispute-files/$disputeId/$fileId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const domain = requestDomain();
        const file = await domain.engagements.disputeFile(await requestActor(domain), {
          disputeId: params.disputeId,
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
