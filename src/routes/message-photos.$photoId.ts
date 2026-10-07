import { createFileRoute } from "@tanstack/react-router";
import { requestActor, requestDomain } from "@/web/session";

// A photo in a message, or its thumbnail with ?size=thumbnail. The domain module
// serves it only to the parties who see the message, and to the Admin for a
// Held one, so nothing caches it.
export const Route = createFileRoute("/message-photos/$photoId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const domain = requestDomain();
        const photo = await domain.conversations.photo(await requestActor(domain), {
          photoId: params.photoId,
          thumbnail: new URL(request.url).searchParams.get("size") === "thumbnail",
        });
        if (!photo) return new Response("Not found", { status: 404 });
        return new Response(photo.body, {
          headers: {
            "content-type": photo.contentType,
            "content-length": String(photo.size),
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
