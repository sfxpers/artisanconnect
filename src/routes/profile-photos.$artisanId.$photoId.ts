import { createFileRoute } from "@tanstack/react-router";
import { requestActor, requestDomain } from "@/web/session";

// A Profile photo, or its thumbnail with ?size=thumbnail. The domain module
// serves it to anyone once it is on a Profile anyone may open, and before
// that only to its Artisan and the Admin.
export const Route = createFileRoute("/profile-photos/$artisanId/$photoId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const domain = requestDomain();
        const photo = await domain.profiles.photo(await requestActor(domain), {
          artisanId: params.artisanId,
          photoId: params.photoId,
          thumbnail: new URL(request.url).searchParams.get("size") === "thumbnail",
        });
        if (!photo) return new Response("Not found", { status: 404 });
        return new Response(photo.body, {
          headers: {
            "content-type": photo.contentType,
            "content-length": String(photo.size),
            // A photo not yet shown is its Artisan's and the Admin's only.
            "cache-control": photo.shown ? "public, max-age=300" : "private, no-store",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
