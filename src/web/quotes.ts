import { createServerFn } from "@tanstack/react-start";
import type { QuoteFields } from "@/domain/quotes/inputs";
import { requestActor, requestDomain } from "./session";

// Quotes: thin adapters onto the domain module, which decides who may send,
// revise, withdraw, or decline one, and who sees what of it (ADR 0002).

type QuoteInput = QuoteFields & { jobId: string };

const byJob = (input: { jobId: string }) => input;

/** The Quotes on the signed-in Client's Job, in the order sent. */
export const getJobQuotes = createServerFn({ method: "GET" })
  .inputValidator(byJob)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.quotes.forJob(await requestActor(domain), data);
  });

/** Sends the Artisan's Quote on a Job they hold. */
export const sendQuote = createServerFn({ method: "POST" })
  .inputValidator((input: QuoteInput) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.quotes.send(await requestActor(domain), data);
  });

/** Revises the Artisan's Sent Quote. */
export const reviseQuote = createServerFn({ method: "POST" })
  .inputValidator((input: QuoteInput) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.quotes.revise(await requestActor(domain), data);
  });

/** Withdraws the Artisan's Sent Quote, telling the Client. */
export const withdrawQuote = createServerFn({ method: "POST" })
  .inputValidator(byJob)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.quotes.withdraw(await requestActor(domain), data);
  });

/** Withdraws what of the Artisan's Quote is being checked. */
export const withdrawQuoteBeingChecked = createServerFn({ method: "POST" })
  .inputValidator(byJob)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.quotes.withdrawHeld(await requestActor(domain), data);
  });

/** Declines a Sent Quote on the Client's Job, telling its Artisan. */
export const declineQuote = createServerFn({ method: "POST" })
  .inputValidator((input: { quoteId: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.quotes.decline(await requestActor(domain), data);
  });

/**
 * Opens a checkout to Hire a Sent Quote on the Client's Job; where to send
 * the Client to pay. The Hire happens when the money arrives.
 */
export const hireQuote = createServerFn({ method: "POST" })
  .inputValidator((input: { quoteId: string; feeAcknowledged: boolean }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.engagements.hire(await requestActor(domain), data);
  });
