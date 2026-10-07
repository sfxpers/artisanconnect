import type { Actor } from "../actor";
import { defineSection } from "../section";
import { openCheckout } from "./hire";

// Engagements (#126 on): a Hired Quote's work and money. Hire is the
// Client's choice of a Sent Quote, made by paying for it (ADR 0004).

export const engagementsSection = defineSection({
  name: "engagements",
  api: (ctx) => ({
    /**
     * Opens a checkout for the Client to Hire a Sent Quote on their Job, by
     * card or Instant EFT, once they acknowledge the Protection Fee is not
     * refunded. The Hire happens when the money arrives, as a payment event.
     */
    hire: (actor: Actor, input: { quoteId: string; feeAcknowledged: boolean }) =>
      openCheckout(ctx, actor, input),
  }),
});
