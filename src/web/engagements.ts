import { createServerFn } from "@tanstack/react-start";
import { requestActor, requestDomain } from "./session";

// Engagements: thin adapters onto the domain module, which decides who may
// set Work started and when (ADR 0006).

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
