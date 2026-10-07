import { and, eq, exists, gt, sql } from "drizzle-orm";
import type { ClockHandler } from "../clocks";
import type { Context } from "../context";
import { jobs, quotes } from "../schema";
import { tell, tellWhile } from "../tells";
import { EXPIRY_CLOCKS, jobRow, REMINDER_LEAD_MS } from "./rows";

// A Job Expires 14 days after it opens without a Hire, and its Client is
// reminded 24 hours before. Renew opens it again with new clocks, so a clock
// from an earlier 14 days, or one for a Job closed since, does nothing.

const reminder: ClockHandler = async (ctx, clock) => {
  const job = await jobRow(ctx, clock.subjectId);
  if (
    job?.state !== "open" ||
    job.expiresAt?.getTime() !== clock.dueAt.getTime() + REMINDER_LEAD_MS
  ) {
    return [];
  }
  return tell(ctx, { kind: "system" }, [job.clientId], {
    event: "job.expiring",
    title: `Your Job expires in 24 hours: ${job.title}`,
    link: `/jobs/${job.id}`,
  });
};

const expiry: ClockHandler = async (ctx, clock) => {
  const job = await jobRow(ctx, clock.subjectId);
  if (job?.state !== "open" || job.expiresAt?.getTime() !== clock.dueAt.getTime()) return [];
  const now = ctx.now();
  const expiredNow = exists(
    ctx.db
      .select({ one: sql`1` })
      .from(jobs)
      .where(and(eq(jobs.id, job.id), eq(jobs.state, "expired"), eq(jobs.updatedAt, now))),
  );
  return [
    ctx.db
      .update(jobs)
      .set({ state: "expired", updatedAt: now })
      .where(and(eq(jobs.id, job.id), eq(jobs.state, "open"), eq(jobs.expiresAt, clock.dueAt))),
    ...tell(ctx, { kind: "system" }, [job.clientId], {
      event: "job.expired",
      title: `Your Job expired: ${job.title}`,
      link: `/jobs/${job.id}`,
    }),
    // Its Sent Quotes stay Sent, for a Renew. One Expiring by now is told that instead.
    ...tellWhile(
      ctx,
      { kind: "system" },
      await sentQuotersOf(ctx, job.id, clock.dueAt),
      {
        event: "job.expired-quoted",
        title: `A Job you Quoted on expired: ${job.title}`,
        link: `/jobs/${job.id}`,
      },
      expiredNow,
    ),
  ];
};

/** The Artisans with a Quote on the Job still Sent after this time. */
async function sentQuotersOf(ctx: Context, jobId: string, after: Date) {
  const rows = await ctx.db
    .select({ artisanId: quotes.artisanId })
    .from(quotes)
    .where(and(eq(quotes.jobId, jobId), eq(quotes.state, "sent"), gt(quotes.expiresAt, after)));
  return rows.map((row) => row.artisanId);
}

export const expiryClocks = {
  [EXPIRY_CLOCKS.reminder]: reminder,
  [EXPIRY_CLOCKS.expiry]: expiry,
} satisfies Record<string, ClockHandler>;
