import { createFileRoute } from "@tanstack/react-router";
import { requestActor, requestDomain } from "@/web/session";

// A stored file, by a link a logged read handed the Admin. The domain module
// serves it only to an Admin, and only while the link works.
export const Route = createFileRoute("/admin/files/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const domain = requestDomain();
        const file = await domain.queues.file(await requestActor(domain), {
          token: params.token,
        });
        if (!file) return new Response("Not found", { status: 404 });
        return new Response(file.body, {
          headers: {
            "content-type": file.contentType,
            "content-length": String(file.size),
            "content-disposition": "inline",
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
            // Nothing it holds may reach out. Uploads already refuse a PDF with a script.
            "content-security-policy":
              "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
          },
        });
      },
    },
  },
});
