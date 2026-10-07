import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Context } from "../context";
import type { Block } from "../queues";
import { formatTime } from "../sa-days";
import { engagements, jobs } from "../schema";

// The Artisan record (#133): the Admin's view of an Artisan's Cancellations,
// who made each and why, and the Cancellations by Clients before Work
// started. No Account sees it. Disputes decided against the Artisan join it,
// once there are Disputes (#135).

export type ArtisanRecord = Awaited<ReturnType<typeof artisanRecord>>;

/** The Artisan's record: each Cancellation, newest first, and the counts the Admin weighs. */
export async function artisanRecord(ctx: Context, artisanId: string) {
  const rows = await ctx.db
    .select({
      jobId: engagements.jobId,
      jobTitle: jobs.title,
      cancelledAt: engagements.cancelledAt,
      cancelledBy: engagements.cancelledBy,
      workStartedAt: engagements.workStartedAt,
      reason: engagements.cancellationReason,
    })
    .from(engagements)
    .innerJoin(jobs, eq(jobs.id, engagements.jobId))
    // Cancelled once, whatever came after, such as a Dispute (#135).
    .where(and(eq(engagements.artisanId, artisanId), isNotNull(engagements.cancelledAt)))
    .orderBy(desc(engagements.cancelledAt), desc(sql.raw(`"engagements"."rowid"`)));
  const cancellations = rows.map((row) => ({
    jobId: row.jobId,
    jobTitle: row.jobTitle,
    cancelledAt: row.cancelledAt!,
    by: row.cancelledBy!,
    afterWorkStarted: row.workStartedAt !== null,
    reason: row.reason,
  }));
  return {
    cancelledByArtisan: cancellations.filter((each) => each.by === "artisan").length,
    cancelledByClientsBeforeWorkStarted: cancellations.filter(
      (each) => each.by === "client" && !each.afterWorkStarted,
    ).length,
    cancellations,
  };
}

/** The Artisan record as a block of an Admin item's sidebar. */
export async function artisanRecordBlocks(ctx: Context, artisanId: string): Promise<Block[]> {
  const record = await artisanRecord(ctx, artisanId);
  return [
    {
      kind: "facts",
      facts: [
        { label: "Cancelled by the Artisan", value: String(record.cancelledByArtisan) },
        {
          label: "Cancelled by Clients before Work started",
          value: String(record.cancelledByClientsBeforeWorkStarted),
        },
      ],
    },
    ...record.cancellations.map((each): Block => ({
      kind: "text",
      text: `${formatTime(each.cancelledAt)} · ${each.jobTitle}: cancelled by the ${each.by === "client" ? "Client" : "Artisan"} ${each.afterWorkStarted ? "after" : "before"} Work started.${each.reason ? ` “${each.reason}”` : ""}`,
    })),
  ];
}
