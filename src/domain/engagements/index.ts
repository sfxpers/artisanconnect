import type { Actor } from "../actor";
import { defineSection } from "../section";
import { openCheckout } from "./hire";
import { answerNotStarted, claimStarted, markWorkStarted, workStartedClocks } from "./work-started";

// Engagements (#126 on): a Hired Quote's work and money. Hire is the
// Client's choice of a Sent Quote, made by paying for it (ADR 0004).

export const engagementsSection = defineSection({
  name: "engagements",
  clocks: workStartedClocks,
  api: (ctx) => ({
    /**
     * Opens a checkout for the Client to Hire a Sent Quote on their Job, by
     * card or Instant EFT, once they acknowledge the Protection Fee is not
     * refunded. The Hire happens when the money arrives, as a payment event.
     */
    hire: (actor: Actor, input: { quoteId: string; feeAcknowledged: boolean }) =>
      openCheckout(ctx, actor, input),
    /** The Client marks Work started, which releases the Materials (ADR 0006). */
    workStarted: (actor: Actor, input: { engagementId: string }) =>
      markWorkStarted(ctx, actor, input),
    /**
     * The Artisan says they've started: Work started in 24 hours unless the
     * Client answers "Not started".
     */
    claimStarted: (actor: Actor, input: { engagementId: string }) =>
      claimStarted(ctx, actor, input),
    /** The Client answers the Artisan's claim "Not started"; the Engagement stays Paid. */
    notStarted: (actor: Actor, input: { engagementId: string }) =>
      answerNotStarted(ctx, actor, input),
  }),
});
