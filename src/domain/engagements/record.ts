import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import type { Context } from "../context";
import { formatRands } from "../money";
import type { Block } from "../queues";
import { formatTime } from "../sa-days";
import { disputes, engagements, jobs } from "../schema";

// The Artisan record (#133): the Admin's view of an Artisan's Cancellations,
// who made each and why, the Cancellations by Clients before Work started,
// and the Disputes decided against the Artisan: those whose decision
// refunded the Client some of what was held (#135). No Account sees it.

export type ArtisanRecord = Awaited<ReturnType<typeof artisanRecord>>;

/**
 * The Artisan's record: each Cancellation and each Dispute decided against
 * them, newest first, and the counts the Admin weighs.
 */
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
    // Cancelled once, whatever came after, such as a Dispute (#135); by a party, not by the
    // Admin's decision of a Chargeback (#137).
    .where(
      and(
        eq(engagements.artisanId, artisanId),
        isNotNull(engagements.cancelledAt),
        isNotNull(engagements.cancelledBy),
      ),
    )
    .orderBy(desc(engagements.cancelledAt), desc(sql.raw(`"engagements"."rowid"`)));
  const cancellations = rows.map((row) => ({
    jobId: row.jobId,
    jobTitle: row.jobTitle,
    cancelledAt: row.cancelledAt!,
    by: row.cancelledBy!,
    afterWorkStarted: row.workStartedAt !== null,
    reason: row.reason,
  }));
  const decided = await ctx.db
    .select({
      jobId: engagements.jobId,
      jobTitle: jobs.title,
      decidedAt: disputes.closedAt,
      releasedCents: disputes.releasedCents,
      refundedCents: disputes.refundedCents,
    })
    .from(disputes)
    .innerJoin(engagements, eq(engagements.id, disputes.engagementId))
    .innerJoin(jobs, eq(jobs.id, engagements.jobId))
    .where(
      and(
        eq(engagements.artisanId, artisanId),
        eq(disputes.state, "decided"),
        gt(disputes.refundedCents, 0),
      ),
    )
    .orderBy(desc(disputes.closedAt), desc(sql.raw(`"disputes"."rowid"`)));
  return {
    cancelledByArtisan: cancellations.filter((each) => each.by === "artisan").length,
    cancelledByClientsBeforeWorkStarted: cancellations.filter(
      (each) => each.by === "client" && !each.afterWorkStarted,
    ).length,
    cancellations,
    disputesDecidedAgainst: decided.length,
    disputes: decided.map((row) => ({
      jobId: row.jobId,
      jobTitle: row.jobTitle,
      decidedAt: row.decidedAt!,
      /** What the Dispute held when the Admin split it. */
      heldCents: row.releasedCents! + row.refundedCents!,
      refundedCents: row.refundedCents!,
    })),
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
        {
          label: "Disputes decided against the Artisan",
          value: String(record.disputesDecidedAgainst),
        },
      ],
    },
    ...record.cancellations.map((each): Block => ({
      kind: "text",
      text: `${formatTime(each.cancelledAt)} · ${each.jobTitle}: cancelled by the ${each.by === "client" ? "Client" : "Artisan"} ${each.afterWorkStarted ? "after" : "before"} Work started.${each.reason ? ` “${each.reason}”` : ""}`,
    })),
    ...record.disputes.map((each): Block => ({
      kind: "text",
      text: `${formatTime(each.decidedAt)} · ${each.jobTitle}: Dispute decided, ${formatRands(each.refundedCents)} of the ${formatRands(each.heldCents)} held refunded to the Client.`,
    })),
  ];
}
