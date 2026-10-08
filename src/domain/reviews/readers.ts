import { and, eq, exists, or, sql } from "drizzle-orm";
import { accountIdOf, type Actor } from "../actor";
import type { Context } from "../context";
import { seesJob } from "../jobs";
import { jobRow } from "../jobs/rows";
import { openableArtisan } from "../profiles";
import { invitations, jobMatches, jobs, quotes } from "../schema";
import { isShown, type reviewRow } from "./rows";

// Who reads a Review shown (#138): one of an Artisan, anyone, on its
// Profile; one of a Client, the Client, on the Job, and an Artisan holding a
// Job Match, an Invitation, or a Quote on one of that Client's Jobs.

type Review = NonNullable<Awaited<ReturnType<typeof reviewRow>>>;

/** Whether the viewer reads the Review now. Its author reads it anyway, as their own. */
export async function readsReview(ctx: Context, viewer: Actor, review: Review) {
  const accountId = accountIdOf(viewer);
  if (accountId && accountId === review.authorId) return true;
  if (!(await isShown(ctx, review.id))) return false;
  if (review.reviewedId === review.artisanId) {
    return (await openableArtisan(ctx, review.artisanId)) !== null;
  }
  if (accountId === review.clientId) return true;
  if (viewer.kind !== "artisan") return false;
  // Only the Client's Jobs the Artisan was offered, invited to, or Quoted on may be seen.
  const held = (table: typeof jobMatches | typeof invitations | typeof quotes) =>
    exists(
      ctx.db
        .select({ one: sql`1` })
        .from(table)
        .where(and(eq(table.jobId, jobs.id), eq(table.artisanId, viewer.accountId))),
    );
  const clientJobs = await ctx.db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.clientId, review.clientId),
        or(held(jobMatches), held(invitations), held(quotes)),
      ),
    );
  for (const { id } of clientJobs) {
    const job = await jobRow(ctx, id);
    if (job && (await seesJob(ctx, job, viewer))) return true;
  }
  return false;
}
