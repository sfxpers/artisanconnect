import { createFileRoute } from "@tanstack/react-router";
import { requestActor, requestDomain } from "@/web/session";

// A Job photo, or its thumbnail with ?size=thumbnail. The domain module
// serves it only to the Job's Client and the Admin, so nothing caches it.
export const Route = createFileRoute("/job-photos/$jobId/$photoId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const domain = requestDomain();
        const photo = await domain.jobs.photo(await requestActor(domain), {
          jobId: params.jobId,
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
