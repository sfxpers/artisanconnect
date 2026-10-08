import { createServerFn } from "@tanstack/react-start";
import { requestActor, requestDomain } from "./session";

// Reviews: thin adapters onto the domain module, which decides who writes a
// Review, when, and who reads one (ADR 0012).

/** The party writes their one Review of the other on a Completed Engagement. */
export const writeReview = createServerFn({ method: "POST" })
  .validator((input: { engagementId: string; rating: number; comment?: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.reviews.write(await requestActor(domain), data);
  });

/** A page of the Reviews shown of an Artisan, which anyone reads. */
export const getArtisanReviews = createServerFn({ method: "GET" })
  .validator((input: { artisanId: string; page: number }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.reviews.ofArtisan(await requestActor(domain), data);
  });

/** A page of the Reviews shown of a Job's Client, for an Artisan offered, invited to, or Quoting on it. */
export const getClientReviews = createServerFn({ method: "GET" })
  .validator((input: { jobId: string; page: number }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.reviews.ofClient(await requestActor(domain), data);
  });
