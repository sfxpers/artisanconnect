import { and, asc, eq } from "drizzle-orm";
import { publicName } from "../accounts/names";
import type { Context } from "../context";
import { engagementMoney } from "../ledger";
import { fieldsView } from "../quotes/views";
import { refundsOf, shownState } from "../refunds";
import { accounts, engagements, jobs, payments, quotes, refunds } from "../schema";
import type { ServiceCategory } from "../service-categories";
import { refusedFor } from "../content/held";
import { badgesOf } from "../verification";
import {
  approvalAt,
  completionFilePath,
  completionsOf,
  heldCompletion,
  heldFixNote,
  type CompletionRow,
} from "./completion";
import { certificateNeeded } from "./inputs";
import { canCancel, labourRefundAt } from "./cancellation";
import { answerBy, startDayCome } from "./work-started";

// An Engagement as each party sees it on the Job page (#107): the Client
// never sees the Artisan Fee, and the Artisan never sees the Protection Fee.

/** The Job's Engagement, as its Client sees it; null before Hire. */
export async function engagementAsClient(
  ctx: Context,
  job: { id: string; category: ServiceCategory | null },
) {
  const found = await engagementOf(ctx, job.id);
  if (!found) return null;
  const { engagement, quote } = found;
  const [money, [artisan], badges, completions, refunded] = await Promise.all([
    engagementMoney(ctx, engagement.id),
    ctx.db
      .select({
        name: accounts.name,
        tradingName: accounts.tradingName,
        namesShown: accounts.namesShown,
      })
      .from(accounts)
      .where(eq(accounts.id, engagement.artisanId)),
    badgesOf(ctx, engagement.artisanId),
    completionsOf(ctx, engagement.id),
    refundsOf(ctx, engagement.id),
  ]);
  const { protectionFeeCents, ...shared } = money;
  return {
    ...common(ctx, found, completions, refunded, money),
    fixRequest: await fixRequestView(ctx, found, completions, "client"),
    artisan: {
      artisanId: engagement.artisanId,
      // Names the Content check has not passed are nobody else's to see.
      publicName: artisan?.namesShown ? publicName(artisan) : null,
      badges: badges.filter((badge) => badge.category === null || badge.category === job.category),
    },
    money: { ...moneyView(shared), protectionFeeCents },
    quote: { quoteId: quote.id, ...fieldsView(quote) },
  };
}

/** The Job's Engagement, as its Hired Artisan sees it; null for any other Artisan. */
export async function engagementAsArtisan(ctx: Context, jobId: string, artisanId: string) {
  const found = await engagementOf(ctx, jobId);
  if (!found || found.engagement.artisanId !== artisanId) return null;
  const [{ protectionFeeCents: _, ...money }, completions, refunded] = await Promise.all([
    engagementMoney(ctx, found.engagement.id),
    completionsOf(ctx, found.engagement.id),
    refundsOf(ctx, found.engagement.id),
  ]);
  const { state } = found.engagement;
  const newest = completions.at(-1);
  const held = newest?.state === "held";
  return {
    ...common(ctx, found, completions, refunded, money),
    fixRequest: await fixRequestView(ctx, found, completions, "artisan"),
    money: { ...moneyView(money), artisanFeePercent: found.engagement.artisanFeePercent },
    /**
     * What the Artisan may refund now, of each line: what is unreleased of
     * it. Extra Materials an Updated Quote pays in are a line of their own,
     * once there are some (#134).
     */
    refundable: {
      materialsCents: money.materials.unreleasedCents,
      labourCents: money.labour.unreleasedCents,
    },
    /** Whether the Artisan may say they've started now. */
    canClaimStart:
      state === "paid" &&
      !found.engagement.startClaimedAt &&
      startDayCome(ctx, found.quote.startOn),
    /** Whether the Artisan may mark the work complete now. */
    canComplete: (state === "work-started" || state === "fix-requested") && !held,
    /** The certificate the Completion needs, if the Job needs one. */
    certificateNeeded: certificateNeeded(found.job),
    /** The Artisan's newest Completion while it is being checked, or after the Admin refused it. */
    completionCheck: held
      ? { state: "held" as const, sentAt: newest.sentAt }
      : newest?.state === "refused"
        ? {
            state: "refused" as const,
            sentAt: newest.sentAt,
            reason: (await refusedFor(ctx, heldCompletion.kind, newest.id)) ?? "",
          }
        : null,
  };
}

/**
 * The Payments on the Client's Job that arrived but Hired nobody, refunded
 * whole, and where each one's Refund stands.
 */
export async function notHiredPayments(ctx: Context, jobId: string) {
  const rows = await ctx.db
    .select({
      paymentId: payments.id,
      amountCents: payments.amountCents,
      reason: payments.notHiredFor,
      at: payments.settledAt,
      refundState: refunds.state,
    })
    .from(payments)
    .innerJoin(refunds, eq(refunds.id, payments.refundId))
    .where(and(eq(payments.jobId, jobId), eq(payments.state, "not-hired")))
    .orderBy(asc(payments.settledAt));
  return rows.map(({ refundState, ...row }) => ({ ...row, refund: shownState(refundState) }));
}

async function engagementOf(ctx: Context, jobId: string) {
  const [row] = await ctx.db
    .select({
      engagement: engagements,
      quote: quotes,
      job: { title: jobs.title, category: jobs.category, gasWork: jobs.gasWork },
    })
    .from(engagements)
    .innerJoin(quotes, eq(quotes.id, engagements.quoteId))
    .innerJoin(jobs, eq(jobs.id, engagements.jobId))
    .where(eq(engagements.jobId, jobId));
  return row ?? null;
}

type Found = NonNullable<Awaited<ReturnType<typeof engagementOf>>>;
type Refunded = Awaited<ReturnType<typeof refundsOf>>;
type Money = Omit<Awaited<ReturnType<typeof engagementMoney>>, "protectionFeeCents">;

/**
 * What both parties see alike: its state, the Hired Quote's dates, the
 * Artisan's claim to have started while it waits for the Client, the newest
 * Completion the Client could see and the bar to its Approval by silence,
 * whether it may be cancelled and its Cancellation, its Refunds, and its
 * Activity.
 */
function common(
  ctx: Context,
  { engagement, quote }: Found,
  completions: CompletionRow[],
  refunded: Refunded,
  money: Money,
) {
  const { startClaimedAt, workStartedAt, completedAt, cancelledAt } = engagement;
  const made = completions.filter((completion) => completion.state === "made");
  const newest = made.at(-1);
  return {
    engagementId: engagement.id,
    state: engagement.state,
    hiredAt: engagement.hiredAt,
    startOn: quote.startOn,
    durationDays: quote.durationDays,
    warranty: quote.warranty,
    startClaim:
      engagement.state === "paid" && startClaimedAt
        ? { claimedAt: startClaimedAt, answerBy: answerBy(startClaimedAt) }
        : null,
    workStartedAt,
    completion: newest ? completionView(newest) : null,
    /** How far the seven days to Approval by silence have run, while the Client may answer. */
    approval:
      engagement.state === "awaiting-approval" && newest?.madeAt
        ? approvalBar(ctx, newest.madeAt)
        : null,
    completedAt,
    /** Whether either party may cancel now: before Approval (#133). */
    canCancel: canCancel(engagement).ok,
    cancellation: cancellationView(engagement, money.labour.unreleasedCents),
    refunds: refunded,
    /** What happened, oldest first. Each later step adds its own. */
    activity: [
      { event: "quote.sent" as const, at: quote.sentAt! },
      { event: "hired" as const, at: engagement.hiredAt },
      ...(workStartedAt ? [{ event: "work.started" as const, at: workStartedAt }] : []),
      ...made.flatMap((completion) => [
        { event: "completion.made" as const, at: completion.madeAt! },
        ...(completion.answer && completion.answeredAt
          ? [
              {
                event:
                  completion.answer === "fix-requested"
                    ? ("fix.requested" as const)
                    : ("approved" as const),
                at: completion.answeredAt,
              },
            ]
          : []),
      ]),
      ...(cancelledAt ? [{ event: "cancelled" as const, at: cancelledAt }] : []),
      ...refunded.map((refund) => ({ event: "refunded" as const, at: refund.madeAt })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime()),
  };
}

/**
 * The Cancellation, once Cancelled: by which party, when, whether after Work
 * started, and then the unreleased Labour still to be refunded, and when.
 * The reason is the Admin's to read, on the Artisan record.
 */
function cancellationView(engagement: Found["engagement"], labourUnreleasedCents: number) {
  const { state, cancelledAt, cancelledBy, workStartedAt } = engagement;
  if (state !== "cancelled" || !cancelledAt || !cancelledBy) return null;
  const afterWorkStarted = workStartedAt !== null;
  return {
    by: cancelledBy,
    cancelledAt,
    afterWorkStarted,
    labourRefund:
      afterWorkStarted && labourUnreleasedCents > 0
        ? { dueAt: labourRefundAt(cancelledAt), amountCents: labourUnreleasedCents }
        : null,
  };
}

/** A made Completion as the parties see it: its note, its photos, and its documents. */
function completionView(completion: CompletionRow) {
  return {
    completionId: completion.id,
    note: completion.note,
    photos: completion.photos.map((photo) => ({
      id: photo.id,
      width: photo.width,
      height: photo.height,
      href: completionFilePath(completion.id, photo),
      thumbnailHref: completionFilePath(completion.id, photo, true),
    })),
    documents: completion.documents.map((document) => ({
      id: document.id,
      kind: document.kind,
      certificate: document.certificate,
      href: completionFilePath(completion.id, document),
    })),
    madeAt: completion.madeAt!,
    /** When the Client's silence is Approval. */
    approvalAt: approvalAt(completion.madeAt!),
  };
}

/** The seven days from a Completion to Approval by silence, and how much of them has run, 0 to 1. */
function approvalBar(ctx: Context, madeAt: Date) {
  const dueAt = approvalAt(madeAt);
  const span = dueAt.getTime() - madeAt.getTime();
  const elapsed = Math.min(1, Math.max(0, (ctx.now().getTime() - madeAt.getTime()) / span));
  return { startedAt: madeAt, dueAt, elapsed };
}

/**
 * The Client's Fix request, while the Engagement is Fix requested: when, and
 * its note. A note being checked or refused is its Client's to see, never
 * the Artisan's.
 */
async function fixRequestView(
  ctx: Context,
  { engagement }: Found,
  completions: CompletionRow[],
  party: "client" | "artisan",
) {
  if (engagement.state !== "fix-requested") return null;
  const asked = completions.filter((completion) => completion.answer === "fix-requested").at(-1);
  if (!asked?.answeredAt || !asked.fixNoteState) return null;
  const shown = asked.fixNoteState === "shown" || party === "client";
  return {
    requestedAt: asked.answeredAt,
    note: shown ? asked.fixNote : null,
    noteState: asked.fixNoteState,
    /** Why the Admin refused the note, for its Client. */
    refusedFor:
      party === "client" && asked.fixNoteState === "refused"
        ? ((await refusedFor(ctx, heldFixNote.kind, asked.id)) ?? "")
        : null,
  };
}

/**
 * The money of the Hired Quote: paid in, released, not yet released, and
 * refunded, and its two numbered payments, the Materials released at Work
 * started and the Labour at Approval.
 */
function moneyView({ labour, materials, ...totals }: Money) {
  const part = (of: typeof labour) => ({
    amountCents: of.paidInCents,
    /** What a Release of it would release now: what is neither released nor refunded. */
    unreleasedCents: of.unreleasedCents,
    state:
      of.paidInCents > 0 && of.refundedCents === of.paidInCents
        ? ("refunded" as const)
        : of.paidInCents > 0 && of.releasedCents + of.refundedCents === of.paidInCents
          ? ("released" as const)
          : ("unreleased" as const),
  });
  return {
    ...totals,
    payments: [
      { part: "materials" as const, ...part(materials) },
      { part: "labour" as const, ...part(labour) },
    ],
  };
}
