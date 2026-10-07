import { createFileRoute } from "@tanstack/react-router";
import { requestDomain } from "@/web/session";

// The payment adapter's webhook: a thin adapter onto the domain module, which
// verifies the signature and handles the event (#126). An error answers 500,
// so the provider sends the event again.
export const Route = createFileRoute("/webhooks/payments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const received = await requestDomain().system.receivePaymentEvent({
          body: await request.text(),
          headers: Object.fromEntries(request.headers),
        });
        return new Response(null, { status: received.ok ? 204 : 401 });
      },
    },
  },
});
