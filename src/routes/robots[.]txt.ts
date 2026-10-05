import { createFileRoute } from "@tanstack/react-router";

// Points search engines at the sitemap; staff and Account pages are no use to them.
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = new URL(request.url).origin;
        return new Response(`User-agent: *\nDisallow: /admin\nSitemap: ${origin}/sitemap.xml\n`, {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      },
    },
  },
});
