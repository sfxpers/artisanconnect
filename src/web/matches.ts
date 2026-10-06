import { createServerFn } from "@tanstack/react-start";
import { requestActor, requestDomain } from "./session";

// Job Matches: thin adapters onto the domain module, which decides who is
// offered what (ADR 0003).

/** Passes on a Job Match the Artisan holds. Nobody is told. */
export const passMatch = createServerFn({ method: "POST" })
  .inputValidator((input: { jobId: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.matches.pass(await requestActor(domain), data);
  });
