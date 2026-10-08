import { and, eq, inArray, sql, type SQLWrapper } from "drizzle-orm";
import type { Context } from "../context";
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
