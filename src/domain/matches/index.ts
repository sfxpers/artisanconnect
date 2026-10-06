import { and, desc, eq, exists, isNull, sql } from "drizzle-orm";
import type { Actor } from "../actor";
import type { Context } from "../context";
import { photoView } from "../jobs/rows";
import { ok, refuse } from "../result";
import { jobMatches, jobs, regions, suburbs } from "../schema";
import { defineSection } from "../section";
import { SERVICE_CATEGORY_NAMES } from "../service-categories";
import { batchClocks } from "./batches";

// Job Matches (#122): each offer of a Job to one Artisan in a Batch. The
// Artisan holding one sees the Job as an Artisan may before Payment, and may
// Quote or pass. Passing tells nobody. The Client never sees a Batch.

export const matchesSection = defineSection({
  name: "matches",
  clocks: batchClocks,
  api: (ctx) => ({
    /** The Job Matches the Artisan holds on Open Jobs, the newest offered first. */
    async mine(viewer: Actor) {
      if (viewer.kind !== "artisan") return null;
      const rows = await ctx.db
        .select({
          jobId: jobs.id,
          title: jobs.title,
          description: jobs.description,
          category: jobs.category,
          siteType: jobs.siteType,
          regionName: regions.name,
          gasWork: jobs.gasWork,
          preferredStart: jobs.preferredStart,
          photos: jobs.photos,
          offeredAt: jobMatches.offeredAt,
        })
        .from(jobMatches)
        .innerJoin(jobs, eq(jobs.id, jobMatches.jobId))
        .leftJoin(suburbs, eq(suburbs.id, jobs.suburbId))
        .leftJoin(regions, eq(regions.id, suburbs.regionId))
        .where(
          and(
            eq(jobMatches.artisanId, viewer.accountId),
            isNull(jobMatches.passedAt),
            eq(jobs.state, "open"),
          ),
        )
        .orderBy(desc(jobMatches.offeredAt), desc(jobs.openedAt));
      return rows.map(({ photos, category, regionName, ...row }) => ({
        ...row,
        category: category && { id: category, name: SERVICE_CATEGORY_NAMES[category] },
        region: regionName,
        photo: photos[0] ? photoView(photos[0]) : null,
      }));
    },

    /** Passes on a Job Match the Artisan holds for an Open Job. Nobody is told. */
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
