import { and, eq, exists, notExists, sql } from "drizzle-orm";
import type { Context } from "../context";
import type { engagementMoney } from "../ledger";
import { updatedQuotes, type ENGAGEMENT_STATES } from "../schema";

// Reading an Updated Quote (#134), as the steps of an Engagement that wait on
// one read it.

export type UpdatedQuoteRow = typeof updatedQuotes.$inferSelect;

type EngagementState = (typeof ENGAGEMENT_STATES)[number];

/** The states an Updated Quote may be proposed and accepted in: before Completion. */
const BEFORE_COMPLETION = ["paid", "work-started", "fix-requested"] as const;

export function isBeforeCompletion(state: EngagementState) {
  return (BEFORE_COMPLETION as readonly EngagementState[]).includes(state);
}

/**
 * The Engagement's price now, each line paid in less what was refunded of it:
 * what an Updated Quote raises from, neither line lower.
 */
export function priceNow({
  labour,
  materials,
}: Pick<Awaited<ReturnType<typeof engagementMoney>>, "labour" | "materials">) {
  return {
    labourCents: labour.paidInCents - labour.refundedCents,
    materialsCents: materials.paidInCents - materials.refundedCents,
  };
}

/** The Updated Quote by our id; null if there is none. */
export async function updatedQuoteRow(ctx: Context, updatedQuoteId: string) {
  const [row] = await ctx.db
    .select()
    .from(updatedQuotes)
    .where(eq(updatedQuotes.id, updatedQuoteId));
  return row ?? null;
}

/** The Engagement's Updated Quote waiting for the Client, if there is one. */
export async function proposedOf(ctx: Context, engagementId: string) {
  const [row] = await ctx.db
    .select()
    .from(updatedQuotes)
    .where(and(eq(updatedQuotes.engagementId, engagementId), eq(updatedQuotes.state, "proposed")));
  return row ?? null;
}

/** The SQL that is true while the Engagement has no Updated Quote waiting for the Client. */
export function noneProposed(ctx: Context, engagementId: string) {
  return notExists(proposedSelect(ctx, engagementId));
}

/** The SQL that is true while the Updated Quote is proposed. */
export function stillProposed(ctx: Context, updatedQuoteId: string) {
  return exists(
    ctx.db
      .select({ one: sql`1` })
      .from(updatedQuotes)
      .where(and(eq(updatedQuotes.id, updatedQuoteId), eq(updatedQuotes.state, "proposed"))),
  );
}

function proposedSelect(ctx: Context, engagementId: string) {
  return ctx.db
    .select({ one: sql`1` })
    .from(updatedQuotes)
    .where(and(eq(updatedQuotes.engagementId, engagementId), eq(updatedQuotes.state, "proposed")));
}

/** Why the Artisan may not mark the work complete while their Updated Quote is proposed. */
export const WAITING_FOR_CLIENT =
  "Your Updated Quote is waiting for the Client. Withdraw it, or wait for their answer, to mark the work complete.";
