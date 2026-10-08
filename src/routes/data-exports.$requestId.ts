import { createFileRoute } from "@tanstack/react-router";
import { requestActor, requestDomain } from "@/web/session";

// A copy of an Account's data, which the Admin sent from its Data request
// (#141). The domain module serves it only to that Account, so nothing caches it.
export const Route = createFileRoute("/data-exports/$requestId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const domain = requestDomain();
        const file = await domain.dataRequests.exportFile(await requestActor(domain), {
          requestId: params.requestId,
        });
        if (!file) return new Response("Not found", { status: 404 });
        return new Response(file.body, {
          headers: {
            "content-type": file.contentType,
            "content-length": String(file.size),
            "content-disposition": 'attachment; filename="artisanconnect-data.json"',
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
