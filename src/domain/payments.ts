import type { Context } from "./context";
import { collectionFailed, collectionSucceeded } from "./engagements/hire";
import { payoutFailed, payoutPaused, payoutSentBack, payoutSucceeded } from "./payouts/events";
import type { Webhook } from "./ports";
import { ok, refuse } from "./result";

// Payment events (#108): the payment adapter's webhooks, which the webhook
// route hands to the module as they came. They may repeat or arrive out of
// order, so each handler reads the current state and changes nothing an
// event already changed.

/**
 * Receives one payment event, if the adapter verifies its signature. A
 * refusal changes nothing; an error leaves it for the provider to send again.
 */
export async function receivePaymentEvent(ctx: Context, webhook: Webhook) {
  const event = await ctx.ports.payments.verifyWebhook(webhook);
  if (!event) return refuse("unverified", "That payment event is not signed by the provider.");
  switch (event.type) {
    case "collection.succeeded":
      await collectionSucceeded(ctx, event);
      break;
    case "collection.failed":
      await collectionFailed(ctx, event);
      break;
    case "payout.succeeded":
      await payoutSucceeded(ctx, event);
      break;
    case "payout.paused":
      await payoutPaused(ctx, event);
      break;
    case "payout.failed":
      await payoutFailed(ctx, event);
      break;
    case "payout.reversed":
      await payoutSentBack(ctx, event);
      break;
    // Refunds and Chargebacks come with their tickets (#132, #137).
    default:
      break;
  }
  return ok({});
}
