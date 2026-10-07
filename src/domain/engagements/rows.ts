import { eq } from "drizzle-orm";
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
