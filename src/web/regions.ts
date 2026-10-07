import { createServerFn } from "@tanstack/react-start";
import { requestActor, requestDomain } from "./session";

/** Every Region with its suburbs, and those the signed-in Artisan works in. */
export const getRegions = createServerFn({ method: "GET" }).handler(async () => {
  const domain = requestDomain();
  const actor = await requestActor(domain);
  const [regions, mine] = await Promise.all([
    domain.regions.all(actor),
    domain.regions.mine(actor),
  ]);
  return { regions, chosen: mine?.regions.map((region) => region.id) ?? [] };
});

/** Suburbs matching what was typed, each with its Region. */
export const searchSuburbs = createServerFn({ method: "GET" })
  .inputValidator((input: { query: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.regions.searchSuburbs(await requestActor(domain), data);
  });

/** Replaces the Regions the Artisan works in. */
export const chooseRegions = createServerFn({ method: "POST" })
  .inputValidator((input: { regionIds: string[] }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.regions.choose(await requestActor(domain), data);
  });

/**
 * What the Artisan home shows: whether Verification and Regions are still
 * waiting, the Job Matches and Invitations held, the Quotes being checked or
 * Sent, Available for Jobs, and the Regions chosen.
 */
export const getMyWork = createServerFn({ method: "GET" }).handler(async () => {
  const domain = requestDomain();
  const actor = await requestActor(domain);
  const [availability, mine, verification, matches, invitations, quotes, profile] =
    await Promise.all([
      domain.availability.mine(actor),
      domain.regions.mine(actor),
      domain.verification.mine(actor),
      domain.matches.mine(actor),
      domain.invitations.mine(actor),
      domain.quotes.mine(actor),
      domain.profiles.mine(actor),
    ]);
  return {
    availableForJobs: availability?.availableForJobs ?? false,
    regions: mine?.regions ?? [],
    verified: (verification?.verified.length ?? 0) > 0,
    matches: matches ?? [],
    invitations: invitations ?? [],
    quotes: quotes ?? [],
    profile: profile?.profile ?? null,
  };
});

/** Turns Available for Jobs on or off. */
export const setAvailableForJobs = createServerFn({ method: "POST" })
  .inputValidator((input: { available: boolean }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.availability.set(await requestActor(domain), data);
  });
