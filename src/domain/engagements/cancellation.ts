import { and, eq, exists, sql } from "drizzle-orm";
import { system, type Actor } from "../actor";
import { frozenRefusal, isFrozen, notFrozen } from "../chargebacks";
import { startClock, type ClockHandler } from "../clocks";
import type { Context, Write } from "../context";
import { eventWrite } from "../conversations/rows";
import { engagementMoney, isOverdrawn, paidInIs } from "../ledger";
import { formatRands } from "../money";
import { refundWrites, sendEngagementRefunds } from "../refunds";
import { ok, refuse, type Result } from "../result";
import { formatTime } from "../sa-days";
import { engagements, type CANCELLED_BY, type ENGAGEMENT_STATES } from "../schema";
import { emailTells, tellWhile } from "../tells";
import { CANCELLATION_REASON_MAX } from "./inputs";
import { engagementRow, type EngagementRow } from "./rows";
import { endProposedWrite } from "./updated-quote";

// Cancellation (#133, ADR 0007): either party ends an Engagement before
// Approval, with an optional reason that only the Admin reads, on the Artisan
// record. Before Work started, whatever of the Hired Quote is unreleased is
// refunded to the Client at once, never the Protection Fee (ADR 0008). After
// it the Materials stay with the Artisan, and the unreleased Labour is
// refunded 72 hours later, the Artisan reminded 24 hours before; the Artisan
// may refund sooner. An Updated Quote's extra Materials and Labour are more
// of each line (#134), and one still proposed ends. The clocks refund and
// remind only while the Engagement is still Cancelled, so a Dispute the
// Artisan opens within the 72 hours, which makes it Disputed, stops the
// refund (#135).

/** The clock that refunds a Cancellation's unreleased Labour. Its subject is the Engagement. */
export const CANCELLATION_REFUND_CLOCK = "engagement.cancellation-refund";
/** The clock that reminds the Artisan 24 hours before that refund. */
export const CANCELLATION_REMINDER_CLOCK = "engagement.cancellation-reminder";

const HOUR_MS = 60 * 60 * 1000;
/** How long after a Cancellation after Work started its unreleased Labour is refunded. */
const REFUND_AFTER_MS = 72 * HOUR_MS;
const REMIND_BEFORE_MS = 24 * HOUR_MS;

/** The states an Engagement may be cancelled from: before Approval, and not Disputed. */
const CANCELLABLE = ["paid", "work-started", "awaiting-approval", "fix-requested"] as const;

type EngagementState = (typeof ENGAGEMENT_STATES)[number];
type CancelledBy = (typeof CANCELLED_BY)[number];

/** When the unreleased Labour of an Engagement cancelled after Work started at this time is refunded. */
export function labourRefundAt(cancelledAt: Date): Date {
  return new Date(cancelledAt.getTime() + REFUND_AFTER_MS);
}

/**
 * Either party cancels their Engagement before Approval, with an optional
 * reason. The other party is told. Before Work started the Client is refunded
 * at once; after it the unreleased Labour is refunded in 72 hours.
 */
export async function cancel(
  ctx: Context,
  actor: Actor,
  input: { engagementId: string; reason?: string },
) {
  const engagement = await engagementRow(ctx, input.engagementId);
  const by = engagement && partyOf(actor, engagement);
  if (!engagement || !by) return refuse("not-found", "That Engagement does not exist.");
  const reason = input.reason?.trim() || null;
  if (reason && reason.length > CANCELLATION_REASON_MAX) {
    return refuse("invalid", `A reason is at most ${CANCELLATION_REASON_MAX} characters.`);
  }
  let current: EngagementRow | null = engagement;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!current) break;
    const cancellable = canCancel(current);
    if (!cancellable.ok) return cancellable;
    // Not while a Chargeback freezes it (#137): the Admin decides its money.
    if (await isFrozen(ctx, current.id)) return frozenRefusal();
    const now = ctx.now();
    try {
      await ctx.commit(await cancelWrites(ctx, actor, current, { by, reason, now }));
    } catch (error) {
      // A Release or a Refund took the money meanwhile: read it again.
      if (!isOverdrawn(error)) throw error;
    }
    const after = await engagementRow(ctx, engagement.id);
    if (after?.state === "cancelled" && after.cancelledAt?.getTime() === now.getTime()) {
      if (!after.workStartedAt) await sendEngagementRefunds(ctx, after.id);
      await emailTells(ctx).catch((error: unknown) => {
        console.error("Tell emails did not go", error);
      });
      return ok(null);
    }
    // It moved on between the read and the batch, which then changed nothing, as to Work started,
    // or an Updated Quote's Payment arrived: read it again.
    current = after;
  }
  throw new Error(`Engagement ${engagement.id} kept changing while it was cancelled`);
}

/**
 * The writes of a Cancellation, in one batch: the Engagement Cancelled, from
 * the state it was read in, with who cancelled, when, and why; its row in the
 * Conversation; its proposed Updated Quote ended; before Work started, the
 * Refund of what is unreleased, and after it the clocks of the Labour's
 * refund and its reminder; and the other party told. Everything after the
 * first is written only if the first landed, which it does only while the
 * money paid in is as read: an Updated Quote's Payment arriving meanwhile
 * would otherwise go unrefunded.
 */
async function cancelWrites(
  ctx: Context,
  actor: Actor,
  engagement: EngagementRow,
  { by, reason, now }: { by: CancelledBy; reason: string | null; now: Date },
): Promise<Write[]> {
  const beforeWorkStarted = engagement.state === "paid";
  const { materials, labour } = await engagementMoney(ctx, engagement.id);
  const refund = beforeWorkStarted
    ? { materials: materials.unreleasedCents, labour: labour.unreleasedCents }
    : null;
  const refundCents = refund ? refund.materials + refund.labour : 0;
  const cancelledNow = exists(
    ctx.db
      .select({ one: sql`1` })
      .from(engagements)
      .where(
        and(
          eq(engagements.id, engagement.id),
          eq(engagements.state, "cancelled"),
          eq(engagements.cancelledAt, now),
          eq(engagements.cancelledBy, by),
        ),
      ),
  );
  const refundAt = labourRefundAt(now);
  return [
    ctx.db
      .update(engagements)
      .set({
        state: "cancelled",
        cancelledAt: now,
        cancelledBy: by,
        cancellationReason: reason,
        // An Artisan's claim to have started ends with it; its clock then does nothing.
        startClaimedAt: null,
      })
      .where(
        and(
          eq(engagements.id, engagement.id),
          eq(engagements.state, engagement.state),
          paidInIs(ctx, engagement.id, materials.paidInCents + labour.paidInCents),
          notFrozen(ctx, engagement.id),
        ),
      ),
    eventWrite(ctx, engagement, "cancelled", cancelledNow),
    endProposedWrite(ctx, engagement.id, cancelledNow),
    ...(refund && refundCents > 0
      ? (await refundWrites(ctx, engagement, "cancellation", refund, cancelledNow)).writes
      : []),
    // Clocks whose Cancellation did not land do nothing when they fire.
    ...(beforeWorkStarted
      ? []
      : [
          startClock(ctx, {
            kind: CANCELLATION_REFUND_CLOCK,
            subjectId: engagement.id,
            dueAt: refundAt,
          }),
          startClock(ctx, {
            kind: CANCELLATION_REMINDER_CLOCK,
            subjectId: engagement.id,
            dueAt: new Date(refundAt.getTime() - REMIND_BEFORE_MS),
          }),
        ]),
    ...tellWhile(
      ctx,
      actor,
      [by === "client" ? engagement.artisanId : engagement.clientId],
      {
        event: "engagement.cancelled",
        title: `${cancelledTitle(by, {
          beforeWorkStarted,
          refundCents,
          labourCents: labour.unreleasedCents,
          refundAt,
        })}: ${engagement.jobTitle}`,
        link: `/jobs/${engagement.jobId}`,
      },
      cancelledNow,
    ),
  ];
}

/** What the other party is told of a Cancellation by this party. */
function cancelledTitle(
  by: CancelledBy,
  of: { beforeWorkStarted: boolean; refundCents: number; labourCents: number; refundAt: Date },
): string {
  if (of.beforeWorkStarted) {
    if (of.refundCents === 0) {
      return `The ${by === "client" ? "Client" : "Artisan"} cancelled before Work started`;
    }
    return by === "client"
      ? "The Client cancelled before Work started, and was refunded"
      : `The Artisan cancelled before Work started, and ${formatRands(of.refundCents)} is refunded to you`;
  }
  const labour = `the Labour not yet released, ${formatRands(of.labourCents)}`;
  const at = formatTime(of.refundAt);
  if (by === "client") {
    return of.labourCents > 0
      ? `The Client cancelled. The Materials stay with you, and ${labour}, is refunded to them at ${at}, unless you open a Dispute for work already done before then`
      : "The Client cancelled. The Materials stay with you";
  }
  return of.labourCents > 0
    ? `The Artisan cancelled. The Materials stay with them, and ${labour}, is refunded to you at ${at}`
    : "The Artisan cancelled. The Materials stay with them";
}

/**
 * Refunds the Labour still unreleased 72 hours after a Cancellation after
 * Work started, while the Engagement is still Cancelled: nothing if the
 * Artisan refunded it all sooner. The every-minute run then sends it.
 */
const labourRefund: ClockHandler = async (ctx, clock) => {
  const due = await labourDue(ctx, clock.subjectId, clock.dueAt, 0);
  if (!due) return [];
  const { writes } = await refundWrites(
    ctx,
    due.engagement,
    "cancellation",
    { materials: 0, labour: due.labourCents },
    due.stillCancelled,
  );
  return writes;
};

/** Reminds the Artisan 24 hours before a Cancellation refunds the unreleased Labour. */
const refundReminder: ClockHandler = async (ctx, clock) => {
  const due = await labourDue(ctx, clock.subjectId, clock.dueAt, REMIND_BEFORE_MS);
  if (!due) return [];
  const { engagement, labourCents, refundAt } = due;
  return tellWhile(
    ctx,
    system,
    [engagement.artisanId],
    {
      event: "engagement.cancellation-reminder",
      title: `The Labour not yet released, ${formatRands(labourCents)}, is refunded to the Client in 24 hours, at ${formatTime(refundAt)}. Open a Dispute before then for work already done: ${engagement.jobTitle}`,
      link: `/jobs/${engagement.jobId}`,
    },
    due.stillCancelled,
  );
};

export const cancellationClocks = {
  [CANCELLATION_REFUND_CLOCK]: labourRefund,
  [CANCELLATION_REMINDER_CLOCK]: refundReminder,
} satisfies Record<string, ClockHandler>;

/**
 * The Engagement whose Cancellation's Labour refund the clock is for, with
 * the Labour unreleased, while it is still Cancelled after Work started by
 * that Cancellation and some Labour is unreleased, and no Chargeback freezes
 * it (#137), whose decision then decides that Labour; null otherwise.
 */
async function labourDue(ctx: Context, engagementId: string, dueAt: Date, beforeMs: number) {
  const engagement = await engagementRow(ctx, engagementId);
  if (
    engagement?.state !== "cancelled" ||
    !engagement.workStartedAt ||
    !engagement.cancelledAt ||
    labourRefundAt(engagement.cancelledAt).getTime() - beforeMs !== dueAt.getTime()
  ) {
    return null;
  }
  const { labour } = await engagementMoney(ctx, engagement.id);
  if (labour.unreleasedCents === 0) return null;
  return {
    engagement,
    labourCents: labour.unreleasedCents,
    refundAt: labourRefundAt(engagement.cancelledAt),
    stillCancelled: exists(
      ctx.db
        .select({ one: sql`1` })
        .from(engagements)
        .where(
          and(
            eq(engagements.id, engagement.id),
            eq(engagements.state, "cancelled"),
            eq(engagements.cancelledAt, engagement.cancelledAt),
            notFrozen(ctx, engagement.id),
          ),
        ),
    ),
  };
}

/** Whether the Engagement may be cancelled now, by its state. */
export function canCancel(engagement: { state: EngagementState }): Result<null> {
  if ((CANCELLABLE as readonly EngagementState[]).includes(engagement.state)) return ok(null);
  switch (engagement.state) {
    case "completed":
      return refuse(
        "not-cancellable",
        "This Engagement is Completed, so it can no longer be cancelled.",
      );
    case "cancelled":
      return refuse("not-cancellable", "This Engagement is already Cancelled.");
    default:
      return refuse("not-cancellable", "This Engagement is Disputed: the Admin decides it.");
  }
}

/** Which party of the Engagement the actor is; null for anyone else. */
function partyOf(actor: Actor, engagement: EngagementRow): CancelledBy | null {
  if (actor.kind === "client" && actor.accountId === engagement.clientId) return "client";
  if (actor.kind === "artisan" && actor.accountId === engagement.artisanId) return "artisan";
  return null;
}
