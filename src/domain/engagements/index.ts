import type { Actor } from "../actor";
import { defineSection } from "../section";
import {
  approve,
  completionClocks,
  completionFile,
  heldCompletion,
  heldFixNote,
  markComplete,
  requestFix,
  withdrawCompletion,
} from "./completion";
import { refundByArtisan, refundClocks } from "../refunds";
import { cancel, cancellationClocks } from "./cancellation";
import { artisanRecord } from "./record";
import type { RefundFields, UpdatedQuoteFields } from "./inputs";
import { openCheckout } from "./hire";
import {
  acceptUpdatedQuote,
  proposeUpdatedQuote,
  rejectUpdatedQuote,
  withdrawUpdatedQuote,
} from "./updated-quote";
import { answerNotStarted, claimStarted, markWorkStarted, workStartedClocks } from "./work-started";

// Engagements (#126 on): a Hired Quote's work and money. Hire is the
// Client's choice of a Sent Quote, made by paying for it (ADR 0004).

export const engagementsSection = defineSection({
  name: "engagements",
  clocks: { ...workStartedClocks, ...completionClocks, ...refundClocks, ...cancellationClocks },
  queueItems: [heldCompletion, heldFixNote],
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
    /**
     * The Artisan marks the work complete after Work started: Awaiting
     * approval, with seven days for the Client to answer, unless it is Held.
     */
    complete: (actor: Actor, input: Parameters<typeof markComplete>[2]) =>
      markComplete(ctx, actor, input),
    /** The Artisan withdraws their Completion being checked. */
    withdrawCompletion: (actor: Actor, input: { engagementId: string }) =>
      withdrawCompletion(ctx, actor, input),
    /** The Client approves the Completion, releasing the Labour: Completed. */
    approve: (actor: Actor, input: { engagementId: string }) => approve(ctx, actor, input),
    /** The Client asks for a fix with a note, which stops the seven days. */
    requestFix: (actor: Actor, input: { engagementId: string; note: string }) =>
      requestFix(ctx, actor, input),
    /**
     * The Artisan refunds an amount of each unreleased line, in rands, at
     * any time, without the Client's agreement. Never the Protection Fee.
     */
    refund: (actor: Actor, input: { engagementId: string } & RefundFields) =>
      refundByArtisan(ctx, actor, input),
    /**
     * Either party cancels before Approval, with an optional reason only the
     * Admin reads. Before Work started the Client is refunded at once; after
     * it the unreleased Labour is refunded in 72 hours (ADR 0007).
     */
    cancel: (actor: Actor, input: { engagementId: string; reason?: string }) =>
      cancel(ctx, actor, input),
    /**
     * The Artisan proposes new Labour and Materials before Completion, in
     * rands, neither lower (ADR 0019). The Client is told.
     */
    proposeUpdatedQuote: (actor: Actor, input: { engagementId: string } & UpdatedQuoteFields) =>
      proposeUpdatedQuote(ctx, actor, input),
    /** The Artisan withdraws their proposed Updated Quote. */
    withdrawUpdatedQuote: (actor: Actor, input: { updatedQuoteId: string }) =>
      withdrawUpdatedQuote(ctx, actor, input),
    /** The Client rejects the proposed Updated Quote, and the price stands. */
    rejectUpdatedQuote: (actor: Actor, input: { updatedQuoteId: string }) =>
      rejectUpdatedQuote(ctx, actor, input),
    /**
     * Opens a checkout for the Client to accept the proposed Updated Quote by
     * paying the difference plus its Protection Fee, once they acknowledge
     * the fee is not refunded. It applies when the money arrives.
     */
    acceptUpdatedQuote: (
      actor: Actor,
      input: { updatedQuoteId: string; feeAcknowledged: boolean },
    ) => acceptUpdatedQuote(ctx, actor, input),
    /** An Artisan's record of Cancellations, for the Admin only; null to anyone else. */
    artisanRecord: async (viewer: Actor, input: { artisanId: string }) =>
      viewer.kind === "admin" ? artisanRecord(ctx, input.artisanId) : null,
    /** A Completion's photo or document, to whoever may see it; null to anyone else. */
    completionFile: (
      viewer: Actor,
      input: { completionId: string; fileId: string; thumbnail?: boolean },
    ) => completionFile(ctx, viewer, input),
  }),
});
