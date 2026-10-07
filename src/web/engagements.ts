import { createServerFn } from "@tanstack/react-start";
import { requestActor, requestDomain } from "./session";

// Engagements: thin adapters onto the domain module, which decides who may
// set Work started, mark the work complete, approve it, and refund, and when (ADR 0006).

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
