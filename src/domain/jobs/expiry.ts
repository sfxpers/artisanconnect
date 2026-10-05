import { and, eq } from "drizzle-orm";
import type { ClockHandler } from "../clocks";
import { jobs } from "../schema";
import { tell } from "../tells";
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
  return [
    ctx.db
      .update(jobs)
      .set({ state: "expired", updatedAt: ctx.now() })
      .where(and(eq(jobs.id, job.id), eq(jobs.state, "open"), eq(jobs.expiresAt, clock.dueAt))),
    // Artisans with a Sent Quote are told too, once there are Quotes (#124).
    ...tell(ctx, { kind: "system" }, [job.clientId], {
      event: "job.expired",
      title: `Your Job expired: ${job.title}`,
      link: `/jobs/${job.id}`,
    }),
  ];
};

export const expiryClocks = {
  [EXPIRY_CLOCKS.reminder]: reminder,
  [EXPIRY_CLOCKS.expiry]: expiry,
} satisfies Record<string, ClockHandler>;
