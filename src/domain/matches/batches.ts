import { and, asc, eq, exists, notExists, sql, type SQL } from "drizzle-orm";
import { system } from "../actor";
import { fireDueClock, startClock, type ClockHandler } from "../clocks";
import type { Context, Write } from "../context";
import { BATCH_CLOCK, jobRow, type JobRow } from "../jobs/rows";
import {
  accounts,
  artisanRegions,
  authUsers,
  jobMatches,
  jobs,
  verificationChecks,
} from "../schema";
import { tellWhile } from "../tells";
import { verifiedCategoriesOf } from "../verification";
import { slotOf } from "../verification/checks";

// A Batch (ADR 0003): an Open matched Job is offered to up to ten eligible
// Artisans at once, those offered any Job least recently first. The first
// goes when the Job opens, and another every 24 hours while it is Open. The
// offer time is when the Batch is sent, and nothing else moves an Artisan's
// place: not availability, nothing paid, no rating, no badge.

/** The most Artisans one Batch offers a Job to. */
export const BATCH_SIZE = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sends the Job's next Batch, if it is still the one due: a clock from before
 * the Job closed, Expired, or was Renewed does nothing. A Batch goes only if
 * someone eligible is left, but the next is due 24 hours on either way, as
 * someone may become eligible meanwhile.
 */
const nextBatch: ClockHandler = async (ctx, clock) => {
  const job = await jobRow(ctx, clock.subjectId);
  if (job?.state !== "open" || job.nextBatchAt?.getTime() !== clock.dueAt.getTime()) return [];
  const now = ctx.now();
  // A Job whose Expiry is due fires it in this run, if it has not yet: it
  // offers nobody a Job about to Expire.
  if (job.expiresAt && job.expiresAt <= now) return [];
  const nextAt = new Date(now.getTime() + DAY_MS);
  // Each write is guarded on the Batch still being due, as a command may
  // close the Job between this read and the batch.
  const stillDue = and(
    eq(jobs.id, job.id),
    eq(jobs.state, "open"),
    eq(jobs.nextBatchAt, clock.dueAt),
  )!;
  // No Batch once the Job has five Quotes, once there are Quotes (#124).
  const artisanIds = await batchFor(ctx, job);
  return [
    ...artisanIds.flatMap((artisanId) => offerWrites(ctx, job, artisanId, stillDue)),
    // Last, as the writes above read the time it moves on from.
    ctx.db.update(jobs).set({ nextBatchAt: nextAt }).where(stillDue),
    startClock(ctx, { kind: BATCH_CLOCK, subjectId: job.id, dueAt: nextAt }),
  ];
};

export const batchClocks = { [BATCH_CLOCK]: nextBatch } satisfies Record<string, ClockHandler>;

/**
 * Sends the Job's Batch now if one is due, as the clocks would within the
 * minute: so a Job is offered the moment it is posted or Renewed. A Batch
 * that does not go now waits for the clocks.
 */
export async function sendDueBatch(ctx: Context, jobId: string): Promise<void> {
  await fireDueClock(ctx, BATCH_CLOCK, jobId, nextBatch).catch((error: unknown) => {
    console.error(`The Batch of Job ${jobId} waits for the clocks`, error);
  });
}

/**
 * The up to ten Artisans the Job's next Batch goes to, in the offer order:
 * those never offered a Job first, then the one offered least recently, ties
 * to the older Account. Eligible: verified for the Job's category (and for
 * gas work on a gas Job), working in its Region, Available for Jobs, and not
 * yet offered this Job. Not Suspended, once there are Suspensions (#136);
 * not invited or Quoted on it, once there are Invitations and Quotes (#123, #124).
 */
async function batchFor(ctx: Context, job: JobRow): Promise<string[]> {
  const { category, regionId } = job;
  if (!category || !regionId) return [];
  const lastOffered = sql`(select max(${jobMatches.offeredAt}) from ${jobMatches} where ${jobMatches.artisanId} = ${accounts.id})`;
  // Only an Artisan holding an accepted check of the category's work photos
  // can be verified for it; whether it is now is worked out from its checks.
  // A fresh query each time it is used, as a builder is changed by ordering it.
  const candidates = () =>
    ctx.db
      .select({ id: accounts.id })
      .from(accounts)
      .innerJoin(authUsers, eq(authUsers.id, accounts.id))
      .where(
        and(
          eq(accounts.kind, "artisan"),
          eq(authUsers.emailVerified, true),
          eq(accounts.availableForJobs, true),
          exists(
            ctx.db
              .select({ one: sql`1` })
              .from(artisanRegions)
              .where(
                and(
                  eq(artisanRegions.artisanId, accounts.id),
                  eq(artisanRegions.regionId, regionId),
                ),
              ),
          ),
          exists(
            ctx.db
              .select({ one: sql`1` })
              .from(verificationChecks)
              .where(
                and(
                  eq(verificationChecks.artisanId, accounts.id),
                  eq(verificationChecks.slot, slotOf("work-photos", category)),
                  eq(verificationChecks.state, "accepted"),
                ),
              ),
          ),
          notExists(
            ctx.db
              .select({ one: sql`1` })
              .from(jobMatches)
              .where(and(eq(jobMatches.jobId, job.id), eq(jobMatches.artisanId, accounts.id))),
          ),
        ),
      );
  // By subquery, not by id: D1 binds at most 100 values to a query.
  const [inOrder, verified] = await Promise.all([
    candidates().orderBy(
      sql`${lastOffered} is not null`,
      asc(lastOffered),
      asc(accounts.signedUpAt),
      asc(accounts.id),
    ),
    verifiedCategoriesOf(ctx, candidates()),
  ]);
  return inOrder
    .filter(({ id }) => {
      const status = verified.get(id)?.find((each) => each.category === category);
      return !!status && (!job.gasWork || status.gasWork);
    })
    .slice(0, BATCH_SIZE)
    .map(({ id }) => id);
}

/**
 * The writes that offer the Job to one Artisan, a Job Match and its Tell,
 * each written only while the Batch is still due.
 */
function offerWrites(ctx: Context, job: JobRow, artisanId: string, stillDue: SQL): Write[] {
  return [
    ctx.db.insert(jobMatches).select(
      ctx.db
        .select({
          id: sql<string>`${ctx.newId()}`.as("id"),
          jobId: jobs.id,
          artisanId: sql<string>`${artisanId}`.as("artisan_id"),
          offeredAt: sql<number>`${ctx.now().getTime()}`.as("offered_at"),
          passedAt: sql<null>`null`.as("passed_at"),
        })
        .from(jobs)
        .where(stillDue),
    ),
    ...tellWhile(
      ctx,
      system,
      [artisanId],
      { event: "job.matched", title: `A Job for you: ${job.title}`, link: `/jobs/${job.id}` },
      exists(
        ctx.db
          .select({ one: sql`1` })
          .from(jobs)
          .where(stillDue),
      ),
    ),
  ];
}
