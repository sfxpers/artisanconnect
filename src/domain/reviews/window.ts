import { and, eq, exists, notExists, sql, type SQL } from "drizzle-orm";
import { system } from "../shared/actor";
import type { ClockHandler } from "../clocks";
import type { Context, Write } from "../context";
import { engagementRow } from "../engagements/rows";
import { insertWhile } from "../guarded";
import { DAY_MS, formatTime } from "../shared/sa-days";
import { dueClocks, engagements, reviews } from "../schema";
import { tellWhile } from "../tells";
import { notFrozen } from "../chargebacks/frozen";

// The Review window (#138, ADR 0012): seven days from the moment an
// Engagement is Completed, by Approval or as its Dispute or Chargeback ends,
// in which each party may write one Review of the other. It is worked out
// from `completed_at`, which never changes once set. A Chargeback's freeze
// pauses it like every clock on the Engagement: once the Admin decides, it
// closes later by the time it was frozen (`review_window_closes_at`).

/** How long the window is open. */
export const REVIEW_WINDOW_MS = 7 * DAY_MS;

/** How long before it closes a side that has not written is reminded. */
const REMINDER_BEFORE_MS = 2 * DAY_MS;

const REMINDER_CLOCK = "review.reminder";
const CLOSED_CLOCK = "review.window-closed";

/** When the window of a Completed Engagement closes, unless a Chargeback freezes it now. */
export function windowClosesAt(engagement: {
  completedAt: Date;
  reviewWindowClosesAt: Date | null;
}): Date {
  return (
    engagement.reviewWindowClosesAt ?? new Date(engagement.completedAt.getTime() + REVIEW_WINDOW_MS)
  );
}

/** An Engagement as the window reads it. */
type Completing = {
  id: string;
  clientId: string;
  artisanId: string;
  jobId: string;
  jobTitle: string;
};

/**
 * The writes that open the window of an Engagement the same batch makes
 * Completed at `now`, each only if it did: both parties told to write their
 * Review. Commit them after the write that Completes it.
 */
export function windowOpensWrites(ctx: Context, engagement: Completing, now: Date): Write[] {
  const completedNow = exists(
    ctx.db
      .select({ one: sql`1` })
      .from(engagements)
      .where(
        and(
          eq(engagements.id, engagement.id),
          eq(engagements.state, "completed"),
          eq(engagements.completedAt, now),
        ),
      ),
  );
  const closesAt = windowClosesAt({ completedAt: now, reviewWindowClosesAt: null });
  const by = formatTime(closesAt);
  const link = `/jobs/${engagement.jobId}`;
  return [
    ...clocksWrites(ctx, engagement.id, closesAt, true, completedNow),
    // Each party is asked to write, the one whose act Completed it too.
    ...tellWhile(
      ctx,
      system,
      [engagement.clientId],
      {
        event: "review.window-opened",
        title: `Write a Review of the Artisan by ${by}: ${engagement.jobTitle}`,
        link,
      },
      completedNow,
    ),
    ...tellWhile(
      ctx,
      system,
      [engagement.artisanId],
      {
        event: "review.window-opened",
        title: `Write a Review of the Client by ${by}: ${engagement.jobTitle}`,
        link,
      },
      completedNow,
    ),
  ];
}

/**
 * The window's clocks for a close: the reminder, if `remind`, and the close,
 * each written only while the condition holds. Each fires on the Engagement,
 * and does nothing if the close has moved since.
 */
function clocksWrites(
  ctx: Context,
  engagementId: string,
  closesAt: Date,
  remind: boolean,
  condition: SQL,
): Write[] {
  const clock = (kind: string, dueAt: Date) =>
    insertWhile(
      ctx,
      dueClocks,
      { id: ctx.newId(), kind, subjectId: engagementId, dueAt, firedAt: null },
      condition,
    );
  return [
    ...(remind ? [clock(REMINDER_CLOCK, new Date(closesAt.getTime() - REMINDER_BEFORE_MS))] : []),
    clock(CLOSED_CLOCK, closesAt),
  ];
}

/**
 * The writes that resume the window of a Completed Engagement once the Admin
 * decides the Chargebacks that froze it since `frozenSince`: it closes later
 * by the time it was frozen, with its clocks set again, the reminder only if
 * it had not come due when the freeze began. Nothing if the window had closed
 * before, or the Engagement was not Completed. Written only while the
 * condition holds.
 */
export function windowResumesWrites(
  ctx: Context,
  engagement: {
    id: string;
    state: string;
    completedAt: Date | null;
    reviewWindowClosesAt: Date | null;
  },
  frozenSince: Date,
  condition: SQL,
): Write[] {
  if (engagement.state !== "completed" || !engagement.completedAt) return [];
  const closesAt = windowClosesAt({ ...engagement, completedAt: engagement.completedAt });
  if (frozenSince.getTime() >= closesAt.getTime()) return [];
  const resumed = new Date(closesAt.getTime() + ctx.now().getTime() - frozenSince.getTime());
  const reminded = frozenSince.getTime() >= closesAt.getTime() - REMINDER_BEFORE_MS;
  return [
    ctx.db
      .update(engagements)
      .set({ reviewWindowClosesAt: resumed })
      .where(and(eq(engagements.id, engagement.id), condition)),
    ...clocksWrites(ctx, engagement.id, resumed, !reminded, condition),
  ];
}

/**
 * The Engagement the clock fired on, with its window's close, if the clock
 * is the one its Completion set, due that long before the close.
 */
async function windowOf(ctx: Context, engagementId: string, dueAt: Date, beforeCloseMs: number) {
  const engagement = await engagementRow(ctx, engagementId);
  if (engagement?.state !== "completed" || !engagement.completedAt) return null;
  const closesAt = windowClosesAt({ ...engagement, completedAt: engagement.completedAt });
  return closesAt.getTime() - beforeCloseMs === dueAt.getTime() ? { engagement, closesAt } : null;
}

/**
 * Reminds each side that has not written its Review 48 hours before the
 * window closes. Not while a Chargeback freezes the Engagement (#137), as
 * every clock on it does nothing then.
 */
const reminder: ClockHandler = async (ctx, clock) => {
  const found = await windowOf(ctx, clock.subjectId, clock.dueAt, REMINDER_BEFORE_MS);
  if (!found) return [];
  const { engagement, closesAt } = found;
  const sides = [
    { accountId: engagement.clientId, other: "the Artisan" },
    { accountId: engagement.artisanId, other: "the Client" },
  ];
  return sides.flatMap(({ accountId, other }) =>
    tellWhile(
      ctx,
      system,
      [accountId],
      {
        event: "review.reminder",
        title: `48 hours left to write your Review of ${other}, until ${formatTime(closesAt)}: ${engagement.jobTitle}`,
        link: `/jobs/${engagement.jobId}`,
      },
      and(
        notExists(
          ctx.db
            .select({ one: sql`1` })
            .from(reviews)
            .where(and(eq(reviews.engagementId, engagement.id), eq(reviews.authorId, accountId))),
        ),
        notFrozen(ctx, engagement.id),
      )!,
    ),
  );
};

/**
 * Tells both parties the window has closed: no Review may be written after
 * it. Not while a Chargeback freezes the Engagement.
 */
const closed: ClockHandler = async (ctx, clock) => {
  const found = await windowOf(ctx, clock.subjectId, clock.dueAt, 0);
  if (!found) return [];
  const { engagement } = found;
  return tellWhile(
    ctx,
    system,
    [engagement.clientId, engagement.artisanId],
    {
      event: "review.window-closed",
      title: `The seven days to write Reviews are over: ${engagement.jobTitle}`,
      link: `/jobs/${engagement.jobId}`,
    },
    notFrozen(ctx, engagement.id),
  );
};

export const reviewClocks = {
  [REMINDER_CLOCK]: reminder,
  [CLOSED_CLOCK]: closed,
} satisfies Record<string, ClockHandler>;
