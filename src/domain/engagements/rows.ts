import { and, eq, inArray, sql, type SQLWrapper } from "drizzle-orm";
import type { Actor } from "../actor";
import type { Context } from "../context";
import { refuse } from "../result";
import { engagements, jobs, quotes } from "../schema";

// Reading an Engagement, as each step of its work reads it.

export type EngagementRow = NonNullable<Awaited<ReturnType<typeof engagementRow>>>;

/**
 * The Engagement with its Job's title, trade, and gas answer, and the Hired
 * Quote's start date; null if there is none.
 */
export async function engagementRow(ctx: Context, engagementId: string) {
  const [row] = await ctx.db
    .select({
      engagement: engagements,
      jobTitle: jobs.title,
      category: jobs.category,
      gasWork: jobs.gasWork,
      startOn: quotes.startOn,
    })
    .from(engagements)
    .innerJoin(jobs, eq(jobs.id, engagements.jobId))
    .innerJoin(quotes, eq(quotes.id, engagements.quoteId))
    .where(eq(engagements.id, engagementId));
  if (!row) return null;
  const { engagement, ...rest } = row;
  return { ...engagement, ...rest };
}

/** Which party of the Engagement the actor is; null for anyone else. */
export function partyOf(
  actor: Actor,
  engagement: { clientId: string; artisanId: string },
): "client" | "artisan" | null {
  if (actor.kind === "client" && actor.accountId === engagement.clientId) return "client";
  if (actor.kind === "artisan" && actor.accountId === engagement.artisanId) return "artisan";
  return null;
}

/** The refusal of a command on an Engagement that is not there, or not the actor's. */
export function engagementNotFound() {
  return refuse("not-found", "That Engagement does not exist.");
}

/** How many Engagements each of these Accounts has Completed, as Client or Artisan, by id. */
export async function completedCounts(
  ctx: Context,
  side: "clientId" | "artisanId",
  accountIds: string[] | SQLWrapper,
): Promise<{ get(id: string): number }> {
  const rows = await ctx.db
    .select({ accountId: engagements[side], count: sql<number>`count(*)` })
    .from(engagements)
    .where(and(inArray(engagements[side], accountIds), eq(engagements.state, "completed")))
    .groupBy(engagements[side]);
  const byId = new Map(rows.map((row) => [row.accountId, row.count]));
  return { get: (id) => byId.get(id) ?? 0 };
}
