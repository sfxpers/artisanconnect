import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { fakePaymentsFromEnv } from "@/worker/ports";
import { requestDomain } from "./session";

// The fake payment adapter's checkout page, in every environment until a real
// provider replaces the adapter (#111): it stands in for the provider's, so
// whoever has the link may pay, with fake money. Paying or failing sends the
// event the provider would, to the same entry point as the webhook route,
// before the page returns to the app.

/** The collection the checkout is for: its amount and state. */
export const getFakeCheckout = createServerFn({ method: "GET" })
  .validator((input: { collectionId: string }) => input)
  .handler(async ({ data }) => {
    const checkout = await fakePaymentsFromEnv(env).checkout(data.collectionId);
    if (!checkout) throw notFound();
    return { amountCents: checkout.amountCents, state: checkout.state };
  });

/** Pays or fails the collection, as a person at the provider's checkout would; where to return. */
export const completeFakeCheckout = createServerFn({ method: "POST" })
  .validator((input: { collectionId: string; outcome: "succeed" | "fail" }) => input)
  .handler(async ({ data }) => {
    const payments = fakePaymentsFromEnv(env);
    const checkout = await payments.checkout(data.collectionId);
    if (!checkout) throw notFound();
    if (checkout.state === "pending") {
      const webhook =
        data.outcome === "succeed"
          ? await payments.succeedCollection(data.collectionId)
          : await payments.failCollection(data.collectionId, "cancelled");
      const received = await requestDomain().system.receivePaymentEvent(webhook);
      if (!received.ok) throw new Error(received.refusal.message);
    }
    return { returnUrl: checkout.returnUrl };
  });
