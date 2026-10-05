import { createFileRoute } from "@tanstack/react-router";
import { SERVICE_CATEGORIES } from "@/domain/service-categories";
import { requestActor, requestDomain } from "@/web/session";

// What search engines may find: the landing page, Browse for each trade, and
// every Profile anyone may open, so an Artisan's link is their marketing.
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const domain = requestDomain();
        const profiles = await domain.profiles.listed(await requestActor(domain));
        const origin = new URL(request.url).origin;
        const paths = [
          "/",
          "/artisans",
          ...SERVICE_CATEGORIES.map((category) => `/artisans?category=${category}`),
          ...profiles.map((profile) => `/artisans/${encodeURIComponent(profile.artisanId)}`),
        ];
        const urls = paths
          .map((path) => `  <url><loc>${escapeXml(new URL(path, origin).href)}</loc></url>`)
          .join("\n");
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
          {
            headers: {
              "content-type": "application/xml; charset=utf-8",
              "cache-control": "public, max-age=3600",
            },
          },
        );
      },
    },
  },
});

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
