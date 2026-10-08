import { createServerFn } from "@tanstack/react-start";
import { keepDevice, requestActor, requestDomain, requestSeen } from "./session";

// Engagements: thin adapters onto the domain module, which decides who may
// set Work started, mark the work complete, approve it, refund, cancel,
// propose or answer an Updated Quote, and open or settle a Dispute, and when
// (ADR 0006, ADR 0007, ADR 0019).

const byEngagement = (input: { engagementId: string }) => input;

/** The Client marks Work started, releasing the Materials. */
export const markWorkStarted = createServerFn({ method: "POST" })
  .validator(byEngagement)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.engagements.workStarted(await requestActor(domain), data);
  });

/** The Artisan says they've started; the Client has 24 hours to answer. */
export const claimStarted = createServerFn({ method: "POST" })
  .validator(byEngagement)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.engagements.claimStarted(await requestActor(domain), data);
  });

/** The Client answers the Artisan's claim "Not started". */
export const answerNotStarted = createServerFn({ method: "POST" })
  .validator(byEngagement)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.engagements.notStarted(await requestActor(domain), data);
  });

const files = (form: FormData, name: string) =>
  form.getAll(name).filter((value): value is File => value instanceof File && value.size > 0);

/**
 * The Artisan marks the work complete: "engagementId", "note", "photos",
 * "documents", and a "certificate" where the Job needs one.
 */
export const markComplete = createServerFn({ method: "POST" })
  .validator((input: FormData) => {
    if (!(input instanceof FormData)) throw new Error("Expected a form");
    const note = input.get("note");
    const [certificate] = files(input, "certificate");
    return {
      engagementId: String(input.get("engagementId") ?? ""),
      note: typeof note === "string" ? note : "",
      photos: files(input, "photos"),
      documents: files(input, "documents"),
      ...(certificate ? { certificate } : {}),
    };
  })
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.engagements.complete(await requestActor(domain), data);
  });

/** The Artisan withdraws their Completion being checked. */
export const withdrawCompletion = createServerFn({ method: "POST" })
  .validator(byEngagement)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.engagements.withdrawCompletion(await requestActor(domain), data);
  });

/** The Client approves the Completion, releasing the Labour. */
export const approveCompletion = createServerFn({ method: "POST" })
  .validator(byEngagement)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.engagements.approve(await requestActor(domain), data);
  });

/** The Client asks for a fix, with a note. */
export const requestFix = createServerFn({ method: "POST" })
  .validator((input: { engagementId: string; note: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.engagements.requestFix(await requestActor(domain), data);
  });

/** The Artisan refunds an amount of each unreleased line, in rands. */
export const refund = createServerFn({ method: "POST" })
  .validator((input: { engagementId: string; materials?: string; labour?: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.engagements.refund(await requestActor(domain), data);
  });

/** Either party cancels before Approval, with an optional reason. */
export const cancelEngagement = createServerFn({ method: "POST" })
  .validator((input: { engagementId: string; reason?: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.engagements.cancel(await requestActor(domain), data);
  });

/** The Artisan proposes new Labour and Materials, in rands, neither lower. */
export const proposeUpdatedQuote = createServerFn({ method: "POST" })
  .validator((input: { engagementId: string; labour: string; materials: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.engagements.proposeUpdatedQuote(await requestActor(domain), data);
  });

const byUpdatedQuote = (input: { updatedQuoteId: string }) => input;

/** The Artisan withdraws their proposed Updated Quote. */
export const withdrawUpdatedQuote = createServerFn({ method: "POST" })
  .validator(byUpdatedQuote)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.engagements.withdrawUpdatedQuote(await requestActor(domain), data);
  });

/** The Client rejects the proposed Updated Quote; the price stands. */
export const rejectUpdatedQuote = createServerFn({ method: "POST" })
  .validator(byUpdatedQuote)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.engagements.rejectUpdatedQuote(await requestActor(domain), data);
  });

/**
 * The Client opens a checkout to accept the proposed Updated Quote by paying
 * the difference plus the Protection Fee; it applies when the money arrives.
 */
export const acceptUpdatedQuote = createServerFn({ method: "POST" })
  .validator((input: { updatedQuoteId: string; feeAcknowledged: boolean }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    const actor = await requestActor(domain);
    const seen = requestSeen();
    keepDevice(seen.device);
    return domain.engagements.acceptUpdatedQuote(actor, { ...data, ...seen });
  });

/**
 * Either party opens a Dispute: "engagementId", "reason", "photos", and the
 * Client's "amount" of the Labour, in rands.
 */
export const openDispute = createServerFn({ method: "POST" })
  .validator((input: FormData) => {
    if (!(input instanceof FormData)) throw new Error("Expected a form");
    const reason = input.get("reason");
    const amount = input.get("amount");
    return {
      engagementId: String(input.get("engagementId") ?? ""),
      reason: typeof reason === "string" ? reason : "",
      photos: files(input, "photos"),
      ...(typeof amount === "string" ? { amount } : {}),
    };
  })
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.engagements.dispute(await requestActor(domain), data);
  });

/** The Client releases an amount, in rands, of what their Dispute holds. */
export const releaseHeld = createServerFn({ method: "POST" })
  .validator((input: { engagementId: string; amount: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.engagements.releaseHeld(await requestActor(domain), data);
  });
