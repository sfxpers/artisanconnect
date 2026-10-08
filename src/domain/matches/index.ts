import { and, desc, eq, exists, isNull, notExists, sql } from "drizzle-orm";
import type { Actor } from "../actor";
import type { Context } from "../context";
import { invitationOf } from "../invitations";
import { inView, JOB_AS_ARTISAN_COLUMNS, jobAsArtisanView } from "../jobs/rows";
import { liveQuoteOf } from "../quotes/rows";
import { ok, refuse } from "../result";
import { jobMatches, jobs, regions, suburbs } from "../schema";
import { defineSection } from "../section";
import { batchClocks } from "./batches";

// Job Matches (#122): each offer of a Job to one Artisan in a Batch. The
// Artisan holding one sees the Job as an Artisan may before Payment, and may
// Quote or pass. Passing tells nobody. The Client never sees a Batch.

export const matchesSection = defineSection({
  name: "matches",
  clocks: batchClocks,
  api: (ctx) => ({
    /**
     * The Job Matches the Artisan holds on Open Jobs, the newest offered
     * first. One the Client has since invited the Artisan to is an
     * Invitation, and one they have Quoted on is among their Quotes.
     */
    async mine(viewer: Actor) {
      if (viewer.kind !== "artisan") return null;
      const rows = await ctx.db
        .select({ ...JOB_AS_ARTISAN_COLUMNS, offeredAt: jobMatches.offeredAt })
        .from(jobMatches)
        .innerJoin(jobs, eq(jobs.id, jobMatches.jobId))
        .leftJoin(suburbs, eq(suburbs.id, jobs.suburbId))
        .leftJoin(regions, eq(regions.id, suburbs.regionId))
        .where(
          and(
            eq(jobMatches.artisanId, viewer.accountId),
            isNull(jobMatches.passedAt),
            eq(jobs.state, "open"),
            inView(),
            notInvited(ctx),
            notQuoted(ctx),
          ),
        )
        .orderBy(desc(jobMatches.offeredAt), desc(jobs.openedAt));
      return rows.map(jobAsArtisanView);
    },

    /**
     * Passes on a Job Match the Artisan holds for an Open Job, and not one
     * that is an Invitation now or that they have Quoted on. Nobody is told.
     */
    async pass(actor: Actor, input: { jobId: string }) {
      if (actor.kind !== "artisan") return noMatch();
      const passed = await ctx.db
        .update(jobMatches)
        .set({ passedAt: ctx.now() })
        .where(
          and(
            eq(jobMatches.jobId, input.jobId),
            eq(jobMatches.artisanId, actor.accountId),
            isNull(jobMatches.passedAt),
            notInvited(ctx),
            notQuoted(ctx),
            // One on a Job no longer Open is not shown, and Renew shows it again.
            exists(
              ctx.db
                .select({ one: sql`1` })
                .from(jobs)
                .where(and(eq(jobs.id, input.jobId), eq(jobs.state, "open"))),
            ),
          ),
        )
        .returning({ id: jobMatches.id });
      if (passed.length === 0) return noMatch();
      return ok({});
    },
  }),
});

/**
 * That the Client has not invited the Artisan holding the Job Match: once
 * they do, it is an Invitation, and its row stays to keep the offer time.
 */
function notInvited(ctx: Context) {
  return notExists(invitationOf(ctx, jobMatches.jobId, jobMatches.artisanId));
}

/** That the Artisan holding the Job Match has not Quoted on the Job: once they have, it is answered. */
function notQuoted(ctx: Context) {
  return notExists(liveQuoteOf(ctx, jobMatches.jobId, jobMatches.artisanId));
}

function noMatch() {
  return refuse("not-found", "You hold no Job Match for that Job.");
}

/** The Job Match the Artisan holds for the Job, offered and not passed; null if none. */
export async function heldMatch(ctx: Context, jobId: string, artisanId: string) {
  const [row] = await ctx.db
    .select({ offeredAt: jobMatches.offeredAt })
    .from(jobMatches)
    .where(
      and(
        eq(jobMatches.jobId, jobId),
        eq(jobMatches.artisanId, artisanId),
        isNull(jobMatches.passedAt),
      ),
    );
  return row ?? null;
}
