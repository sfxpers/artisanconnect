import { createServerFn } from "@tanstack/react-start";
import { requestActor, requestDomain } from "./session";

// Invitations: thin adapters onto the domain module, which decides whom a
// Client may invite (ADR 0003).

/** Whom the Job's Client may invite, optionally only in one Region. */
export const getInviteList = createServerFn({ method: "GET" })
  .inputValidator((input: { jobId: string; regionId?: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.invitations.list(await requestActor(domain), data);
  });

/** Invites an Artisan to Quote on the Client's Open Job. */
export const inviteArtisan = createServerFn({ method: "POST" })
  .inputValidator((input: { jobId: string; artisanId: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.invitations.invite(await requestActor(domain), data);
  });
