import { and, asc, eq, exists, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { system, type AdminActor } from "../actor";
import type { Context, Write } from "../context";
import { conversationBlocks } from "../conversations/admin-read";
import { eventWrite } from "../conversations/rows";
import { causedBy } from "../errors";
import { jobBlocks } from "../jobs/held";
import { jobRow } from "../jobs/rows";
import {
  engagementMoney,
  isOverdrawn,
  LEDGER_KINDS,
  ledgerWrites,
  releaseRows,
  type LedgerKind,
  type LedgerRow,
} from "../ledger";
import { formatRands } from "../money";
import type { PaymentEvent } from "../ports";
import { defineQueueItemKind, type Block, type DecisionField } from "../queues";
import { accountSidebar } from "../quotes/held";
import { leftByPayment, refundWrites, sendEngagementRefunds, waitingRefund } from "../refunds";
import { insertWhile } from "../guarded";
import { ok, refuse } from "../result";
import { formatTime } from "../sa-days";
import {
  accounts,
  chargebacks,
  disputes,
  engagements,
  ledgerEntries,
  payouts,
  queueItems,
  refunds,
  updatedQuotes,
} from "../schema";
import { isSuspended, suspendWrites } from "../standing";
import { isAlreadySuspended } from "../standing/people";
import { emailTells, tellWhile } from "../tells";
import { discardFiles } from "../uploads";
import { CHARGEBACK_DECIDED, disputeItem, endsAs, openDisputeOf } from "../engagements/dispute";
import { paymentRow, type PaymentRow } from "../engagements/payments-in";
import { engagementRow, type EngagementRow } from "../engagements/rows";
import { endProposedWrite } from "../engagements/updated-quote";

// Chargebacks (#137): a card Payment the bank reverses. It freezes the
// Payment's Engagement: every clock on it does nothing, nothing more is
// released or refunded, and neither party can move it on. The Client is
// suspended and told, the Artisan is told, and the Chargebacks queue has it.
// Once the bank closes it, with what it sent back to the Client, the Admin
// decides the Engagement's unreleased money: released to the Artisan, less
// the Artisan Fee, or left to the Client, by the Chargeback as far as the
// bank sent it back, and by a Refund beyond that, so the Client is never
// paid twice and the platform keeps none of it. Money already released stays
// the Artisan's; of what the bank sent back, what the platform no longer
// held, such as a Payout already sent, is the platform's loss. The decision
// ends the Engagement: Completed once a Completion was made, otherwise
// Cancelled. Its events may repeat or arrive out of order, so each reads the
// current state and changes nothing twice.

export type ChargebackRow = typeof chargebacks.$inferSelect;

/** What the Suspended Client sees as the reason. */
const SUSPENSION_REASON =
  "Your card Payment was charged back through your bank. Send a Support request to talk to us about it.";

export { frozenRefusal, isFrozen, isFrozenError, isPaymentFrozen, notFrozen } from "./frozen";
import { isFrozenError } from "./frozen";

/**
 * The bank opened a Chargeback on a card Payment: it is recorded, its
 * Engagement frozen, the Client suspended and told, the Artisan told, and
 * the Chargebacks queue has it. A repeat, or one after its closing arrived
 * first, changes nothing; one for a Payment whose own event has not come yet
 * is left for the provider to send again.
 */
export async function chargebackOpened(
  ctx: Context,
  event: Extract<PaymentEvent, { type: "chargeback.opened" }>,
) {
  if (!(await recordOpened(ctx, event.collectionId, event.amountCents, null))) {
    // Not recorded: the provider sends it again.
    throw new Error(`Chargeback on ${event.collectionId} kept changing while it opened`);
  }
}

/**
 * The bank closed a Chargeback, with what it sent back to the Client: it is
 * recorded, in the ledger too, and the Admin may decide it now. One whose
 * opening has not arrived is opened with it; a repeat changes nothing.
 */
export async function chargebackClosed(
  ctx: Context,
  event: Extract<PaymentEvent, { type: "chargeback.closed" }>,
) {
  const closing = { outcome: event.outcome, reversedCents: event.reversedCents };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const chargeback = await chargebackOfPayment(ctx, event.collectionId);
    if (!chargeback) {
      if (await recordOpened(ctx, event.collectionId, null, closing)) return;
      continue;
    }
    if (chargeback.state !== "open") return;
    const now = ctx.now();
    const closedNow = exists(
      ctx.db
        .select({ one: sql`1` })
        .from(chargebacks)
        .where(
          and(
            eq(chargebacks.id, chargeback.id),
            eq(chargebacks.state, "closed"),
            eq(chargebacks.closedAt, now),
          ),
        ),
    );
    await ctx.commit([
      ctx.db
        .update(chargebacks)
        .set({ state: "closed", closedAt: now, ...closing })
        .where(and(eq(chargebacks.id, chargeback.id), eq(chargebacks.state, "open"))),
      ...ledgerWrites(
        ctx,
        [
          {
            kind: LEDGER_KINDS.chargebackReversed,
            amountCents: closing.reversedCents,
            paymentId: chargeback.paymentId,
            engagementId: chargeback.engagementId,
          },
        ],
        closedNow,
      ),
    ]);
    return;
  }
  throw new Error(`Chargeback on ${event.collectionId} kept changing while it closed`);
}

/**
 * Records a Chargeback on the Payment, opened, or closed already when its
 * closing came first, with everything its opening does. Whether it is
 * recorded now, by this or another event; false if the batch lost a race
 * worth reading again.
 */
async function recordOpened(
  ctx: Context,
  collectionId: string,
  amountCents: number | null,
  closing: { outcome: ChargebackRow["outcome"] & {}; reversedCents: number } | null,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const payment = await paymentRow(ctx, collectionId);
    // Not ours: nothing to freeze.
    if (!payment) return true;
    if (payment.state !== "paid" && payment.state !== "not-hired") {
      throw new Error(`Payment ${payment.id} was charged back before it arrived`);
    }
    if (await chargebackOfPayment(ctx, payment.id)) return true;
    const engagement = await engagementOfPayment(ctx, payment);
    const opened = await openedWrites(ctx, payment, engagement, amountCents, closing);
    try {
      await ctx.commit(opened.writes);
    } catch (error) {
      // Another event of it recorded it meanwhile, or another Suspension landed: read it again.
      if (causedBy(error, "UNIQUE constraint failed: chargebacks.payment_id")) return true;
      if (isAlreadySuspended(error)) continue;
      throw error;
    }
    await discardFiles(ctx, opened.discard);
    await emailTells(ctx).catch((error: unknown) => {
      console.error("Tell emails did not go", error);
    });
    return true;
  }
  return false;
}

/**
 * The writes of a Chargeback opened, in one batch: its row, which freezes the
 * Engagement, and what the bank disputes in the ledger (with what it sent
 * back, if its closing came first); the Engagement's proposed Updated Quote
 * ended, so a Payment of it arriving now is refunded whole; its row in the
 * Conversation; both parties told; the Client suspended, unless a Suspension
 * stands already; and the item in the Chargebacks queue.
 */
async function openedWrites(
  ctx: Context,
  payment: PaymentRow,
  engagement: EngagementRow | null,
  amountCents: number | null,
  closing: { outcome: ChargebackRow["outcome"] & {}; reversedCents: number } | null,
) {
  const now = ctx.now();
  const chargeback: ChargebackRow = {
    id: ctx.newId(),
    paymentId: payment.id,
    engagementId: engagement?.id ?? null,
    clientId: payment.clientId,
    amountCents: amountCents ?? payment.amountCents,
    state: closing ? "closed" : "open",
    openedAt: now,
    closedAt: closing ? now : null,
    outcome: closing?.outcome ?? null,
    reversedCents: closing?.reversedCents ?? null,
    decidedAt: null,
    releasedCents: null,
    chargedBackCents: null,
    refundedCents: null,
    lossCents: null,
  };
  const [client] = await ctx.db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.id, payment.clientId));
  const suspended =
    !client || (await isSuspended(ctx, client.id))
      ? { writes: [], discard: [] }
      : await suspendWrites(
          ctx,
          { kind: "system" },
          { ...client, kind: "client" },
          { reason: SUSPENSION_REASON, leaving: false },
        );
  const job = await jobRow(ctx, payment.jobId);
  const title = engagement?.jobTitle ?? job?.title ?? "";
  const row = (kind: LedgerKind, cents: number): LedgerRow => ({
    kind,
    amountCents: cents,
    paymentId: payment.id,
    engagementId: chargeback.engagementId,
  });
  const writes: Write[] = [
    ctx.db.insert(chargebacks).values(chargeback),
    ...ledgerWrites(ctx, [
      row(LEDGER_KINDS.chargebackOpened, chargeback.amountCents),
      ...(closing ? [row(LEDGER_KINDS.chargebackReversed, closing.reversedCents)] : []),
    ]),
    ...suspended.writes,
    chargebackItem.raise(ctx, { subjectId: chargeback.id, title: `Chargeback: ${title}` }).write,
  ];
  if (engagement) {
    writes.push(
      endProposedWrite(ctx, engagement.id, sql`1`),
      eventWrite(ctx, engagement, "chargeback.opened", sql`1`),
      ...tellWhile(
        ctx,
        system,
        [engagement.artisanId],
        {
          event: "engagement.charged-back",
          title: `The Client charged back their card Payment. Money already released to you stays yours; nothing more is released until the Admin decides the rest: ${engagement.jobTitle}`,
          link: `/jobs/${engagement.jobId}`,
        },
        sql`1`,
      ),
      // Told even when a Suspension stood already, so suspending told them nothing.
      ...tellWhile(
        ctx,
        system,
        [engagement.clientId],
        {
          event: "engagement.charged-back",
          title: `Your card Payment was charged back through your bank, so this Job is frozen until the Admin decides the money not yet released: ${engagement.jobTitle}`,
          link: `/jobs/${engagement.jobId}`,
        },
        sql`1`,
      ),
    );
  }
  return { writes, discard: suspended.discard };
}

/**
 * The Engagement a Payment's money is in: the Hire's, or the one whose
 * Updated Quote it accepted; none for a Payment that Hired nobody or was
 * refunded whole.
 */
async function engagementOfPayment(ctx: Context, payment: PaymentRow) {
  if (payment.state !== "paid") return null;
  if (payment.updatedQuoteId) {
    const [row] = await ctx.db
      .select({ engagementId: updatedQuotes.engagementId })
      .from(updatedQuotes)
      .where(eq(updatedQuotes.id, payment.updatedQuoteId));
    return row ? engagementRow(ctx, row.engagementId) : null;
  }
  const [row] = await ctx.db
    .select({ id: engagements.id })
    .from(engagements)
    .where(eq(engagements.paymentId, payment.id));
  return row ? engagementRow(ctx, row.id) : null;
}

/** The Payment's Chargeback, if it has one. */
async function chargebackOfPayment(ctx: Context, paymentId: string) {
  const [row] = await ctx.db.select().from(chargebacks).where(eq(chargebacks.paymentId, paymentId));
  return row ?? null;
}

async function chargebackRow(ctx: Context, chargebackId: string) {
  const [row] = await ctx.db.select().from(chargebacks).where(eq(chargebacks.id, chargebackId));
  return row ?? null;
}

/** The Engagement's Chargebacks, oldest first. */
export async function chargebacksOf(ctx: Context, engagementId: string) {
  return ctx.db
    .select()
    .from(chargebacks)
    .where(eq(chargebacks.engagementId, engagementId))
    .orderBy(asc(chargebacks.openedAt), asc(sql`${chargebacks}.rowid`));
}

/**
 * The Chargebacks the Admin's decision on this one decides: it, with every
 * other one closed on its Engagement, as one decision decides the
 * Engagement's money; or null while the bank has one of them still open.
 */
async function decidedTogether(ctx: Context, chargeback: ChargebackRow) {
  if (chargeback.state !== "closed") return null;
  if (!chargeback.engagementId) return [chargeback];
  const all = await chargebacksOf(ctx, chargeback.engagementId);
  if (all.some((each) => each.state === "open")) return null;
  return [
    chargeback,
    ...all.filter((each) => each.id !== chargeback.id && each.state === "closed"),
  ];
}

/** The decision recorded on the items of the other Chargebacks one decision decides; never offered. */
const TOGETHER = "together";

/** Each unreleased line, as the Admin's decision splits it. */
const LINES = {
  materials: {
    field: "materialsReleasedCents",
    label: "Materials released to the Artisan",
    released: LEDGER_KINDS.materialsReleased,
    chargedBack: LEDGER_KINDS.materialsChargedBack,
    paidIn: LEDGER_KINDS.materialsIn,
    refunded: LEDGER_KINDS.materialsRefunded,
  },
  labour: {
    field: "labourReleasedCents",
    label: "Labour released to the Artisan",
    released: LEDGER_KINDS.labourReleased,
    chargedBack: LEDGER_KINDS.labourChargedBack,
    paidIn: LEDGER_KINDS.labourIn,
    refunded: LEDGER_KINDS.labourRefunded,
  },
} as const;

type Line = keyof typeof LINES;

/**
 * A Chargeback in the Admin's Chargebacks queue: the Chargeback, the Job,
 * and the Conversation on a logged click, the money (what was paid out
 * already, the platform's loss, and whether the Artisan's Payouts are held),
 * and both parties. Once the bank has closed it, the Admin splits each
 * unreleased line between Release to the Artisan and the Client, with a
 * reason both read; the decision is final and ends the Engagement.
 */
export const chargebackItem = defineQueueItemKind("chargeback", {
  queue: "chargebacks",
  decisions: {
    decide: {
      label: "Decide the unreleased money",
      told: "The Client, and the Artisan if Hired, with the reason",
      reason: "required",
      reasonLabel: "Reason, for both parties",
    },
    // Recorded on the others when one decision decides several, never offered to the Admin.
    [TOGETHER]: {
      label: "Decided with the Engagement's other Chargeback",
      told: "Nobody",
      reason: "none",
    },
  },
  async allowed(ctx, item) {
    const chargeback = await chargebackRow(ctx, item.subjectId);
    return chargeback && (await decidedTogether(ctx, chargeback)) ? ["decide"] : [];
  },
  async fields(ctx, item): Promise<Record<string, DecisionField[]>> {
    const chargeback = await chargebackRow(ctx, item.subjectId);
    if (!chargeback?.engagementId) return { decide: [] };
    const money = await engagementMoney(ctx, chargeback.engagementId);
    return {
      decide: (Object.keys(LINES) as Line[])
        .filter((line) => money[line].unreleasedCents > 0)
        .map((line) => ({
          key: LINES[line].field,
          label: LINES[line].label,
          // Nothing more paid out unless the Admin says so.
          value: "0",
          type: "split" as const,
          required: true,
          totalCents: money[line].unreleasedCents,
          restLabel: "Back to the Client",
          wholeLabel: "not yet released",
        })),
    };
  },
  async decide(ctx, admin, item, choice) {
    const chargeback = await chargebackRow(ctx, item.subjectId);
    const deciding = chargeback && (await decidedTogether(ctx, chargeback));
    if (!chargeback || !deciding) {
      return refuse("not-closed", "The bank has not closed this Chargeback yet.");
    }
    const engagement = chargeback.engagementId
      ? await engagementRow(ctx, chargeback.engagementId)
      : null;
    const money = engagement ? await engagementMoney(ctx, engagement.id) : null;
    const released = { materials: 0, labour: 0 };
    for (const line of Object.keys(LINES) as Line[]) {
      const whole = money?.[line].unreleasedCents ?? 0;
      if (whole === 0) continue;
      const given = choice.fields[LINES[line].field] ?? "";
      const cents = Number(given);
      if (!/^\d+$/.test(given) || cents > whole) {
        return refuse(
          "invalid",
          `Release between ${formatRands(0)} and ${formatRands(whole)} of the ${line === "labour" ? "Labour" : "Materials"}, what is unreleased.`,
        );
      }
      released[line] = cents;
    }
    const writes = await decisionWrites(ctx, admin, {
      chargeback,
      deciding,
      engagement,
      money,
      released,
    });
    return ok(writes);
  },
  refusalOf(error) {
    return isOverdrawn(error) ||
      isFrozenError(error) ||
      causedBy(error, "a Chargeback cannot change that way")
      ? refuse("changed", "The money or the Chargebacks changed meanwhile. Look again.")
      : null;
  },
  async after(ctx, item) {
    const chargeback = await chargebackRow(ctx, item.subjectId);
    if (chargeback?.engagementId) await sendEngagementRefunds(ctx, chargeback.engagementId);
  },
  async view(ctx, item) {
    const chargeback = await chargebackRow(ctx, item.subjectId);
    const payment = chargeback && (await paymentRow(ctx, chargeback.paymentId));
    const job = payment && (await jobRow(ctx, payment.jobId));
    if (!chargeback || !payment || !job) return { tabs: [], sidebar: [] };
    const engagement = chargeback.engagementId
      ? await engagementRow(ctx, chargeback.engagementId)
      : null;
    const others = engagement
      ? (await chargebacksOf(ctx, engagement.id)).filter((each) => each.id !== chargeback.id)
      : [];
    return {
      tabs: [
        {
          key: "chargeback",
          label: "The Chargeback",
          blocks: chargebackBlocks(chargeback, payment, engagement, others),
        },
        ...(engagement
          ? [{ key: "conversation", label: "The Conversation", read: "conversation" }]
          : []),
        { key: "job", label: "The Job", blocks: jobBlocks(job) },
      ],
      sidebar: [
        ...(engagement ? [{ title: "Money", blocks: await moneyBlocks(ctx, engagement) }] : []),
        ...(await accountSidebar(ctx, payment.clientId, "Client")),
        ...(engagement ? await accountSidebar(ctx, engagement.artisanId, "Artisan") : []),
      ],
      timeline: [
        ...(engagement ? [{ at: engagement.hiredAt, text: "Hired" }] : []),
        ...(engagement?.workStartedAt
          ? [{ at: engagement.workStartedAt, text: "Work started" }]
          : []),
        { at: chargeback.openedAt, text: "Charged back" },
        ...(chargeback.closedAt ? [{ at: chargeback.closedAt, text: "Closed by the bank" }] : []),
      ],
    };
  },
  reads: {
    conversation: {
      label: "the Conversation",
      async open(ctx, item) {
        const chargeback = await chargebackRow(ctx, item.subjectId);
        const engagement =
          chargeback?.engagementId && (await engagementRow(ctx, chargeback.engagementId));
        return engagement ? conversationBlocks(ctx, engagement) : [];
      },
    },
  },
});

/** How the bank closed a Chargeback, said for the Admin. */
const OUTCOMES: Record<ChargebackRow["outcome"] & {}, string> = {
  won: "won by the platform",
  lost: "lost by the platform",
  accepted: "accepted by the platform",
  partially_accepted: "partly accepted by the platform",
};

/** What the Admin reads of the Chargeback itself. */
function chargebackBlocks(
  chargeback: ChargebackRow,
  payment: PaymentRow,
  engagement: EngagementRow | null,
  others: ChargebackRow[],
): Block[] {
  const of = payment.updatedQuoteId ? "an Updated Quote's Payment" : "the Hire's Payment";
  return [
    {
      kind: "text",
      text: `The bank charged back ${of}, ${formatRands(payment.amountCents)} by card, ${formatTime(chargeback.openedAt)}, disputing ${formatRands(chargeback.amountCents)}.`,
    },
    {
      kind: "text",
      text:
        chargeback.state === "open"
          ? "The bank has not closed it yet. Once it does, with what it sent back to the Client, decide the unreleased money."
          : `The bank closed it ${formatTime(chargeback.closedAt!)}, ${OUTCOMES[chargeback.outcome!]}, sending ${formatRands(chargeback.reversedCents!)} back to the Client.`,
    },
    {
      kind: "text",
      text: engagement
        ? "Money left to the Client goes back by the Chargeback as far as the bank sent it back, and by a Refund beyond that. A Refund of the charged-back Payment not yet sent, or owed and paid by hand, is never sent or paid as far as the bank sent its money back too; any rest of it is sent as a Refund of its own. The decision ends the Engagement: Completed once a Completion was made, otherwise Cancelled."
        : "This Payment Hired nobody and was refunded whole, so nothing is unreleased. Its Refund, if not yet sent, is never sent as far as the bank sent the money back; deciding records the rest of what the bank sent back as the platform's loss.",
    },
    ...(others.length > 0
      ? [
          {
            kind: "text" as const,
            text: `The Engagement has ${others.length === 1 ? "another Chargeback" : `${others.length} other Chargebacks`}; one decision decides its money once the bank has closed each.`,
          },
        ]
      : []),
    ...(chargeback.state === "decided"
      ? [
          {
            kind: "facts" as const,
            facts: [
              { label: "Released to the Artisan", value: formatRands(chargeback.releasedCents!) },
              {
                label: "Left with the Chargeback",
                value: formatRands(chargeback.chargedBackCents!),
              },
              { label: "Refunded to the Client", value: formatRands(chargeback.refundedCents!) },
              { label: "The platform's loss", value: formatRands(chargeback.lossCents!) },
            ],
          },
        ]
      : []),
  ];
}

/**
 * The Engagement's money, as the Admin decides it: what is unreleased of each
 * line and held in a Dispute; what was released, and of it what Payouts sent
 * already, which stays the Artisan's; and whether the Artisan's Payouts are
 * held, which the People page changes.
 */
async function moneyBlocks(ctx: Context, engagement: EngagementRow): Promise<Block[]> {
  const [money, [paidOut], [owed], [artisan], [waiting]] = await Promise.all([
    engagementMoney(ctx, engagement.id),
    ctx.db
      .select({ cents: sql<number>`coalesce(sum(${payouts.amountCents}), 0)` })
      .from(payouts)
      .where(and(eq(payouts.engagementId, engagement.id), eq(payouts.state, "paid"))),
    ctx.db
      .select({ cents: sql<number>`coalesce(sum(${ledgerEntries.amountCents}), 0)` })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.engagementId, engagement.id),
          eq(ledgerEntries.kind, LEDGER_KINDS.payoutOwed),
        ),
      ),
    ctx.db
      .select({ heldAt: accounts.payoutsHeldAt })
      .from(accounts)
      .where(eq(accounts.id, engagement.artisanId)),
    // Of the charged-back Payments only: the decision may find the bank sent them back already.
    ctx.db
      .select({ cents: sql<number>`coalesce(sum(${refunds.amountCents}), 0)` })
      .from(refunds)
      .where(
        and(
          eq(refunds.engagementId, engagement.id),
          inArray(refunds.state, ["waiting", "failed"]),
          inArray(
            refunds.paymentId,
            ctx.db
              .select({ paymentId: chargebacks.paymentId })
              .from(chargebacks)
              .where(eq(chargebacks.engagementId, engagement.id)),
          ),
        ),
      ),
  ]);
  return [
    {
      kind: "facts",
      facts: [
        {
          label: "Materials not yet released",
          value: formatRands(money.materials.unreleasedCents),
        },
        { label: "Labour not yet released", value: formatRands(money.labour.unreleasedCents) },
        ...(money.heldCents > 0
          ? [{ label: "Of it, held in Dispute", value: formatRands(money.heldCents) }]
          : []),
        { label: "Paid in", value: formatRands(money.paidInCents) },
        { label: "Released", value: formatRands(money.releasedCents) },
        { label: "Paid out to the Artisan", value: formatRands(paidOut?.cents ?? 0) },
        {
          label: "Released, not yet paid out",
          value: formatRands(Math.max(0, (owed?.cents ?? 0) - (paidOut?.cents ?? 0))),
        },
        { label: "Refunded", value: formatRands(money.refundedCents) },
        ...(waiting?.cents
          ? [
              {
                label: "Of it, not yet sent of the charged-back Payments",
                value: formatRands(waiting.cents),
              },
            ]
          : []),
        { label: "Left with a Chargeback", value: formatRands(money.chargedBackCents) },
        { label: "Artisan Fee", value: `${engagement.artisanFeePercent}%` },
        {
          label: "The Artisan's Payouts",
          value: artisan?.heldAt
            ? `Held since ${formatTime(artisan.heldAt)}`
            : "Not held. Hold them on the People page.",
        },
      ],
    },
  ];
}

/**
 * The writes of the Admin's decision, in one batch with it: every Chargeback
 * it decides, decided first, as the ledger refuses moving the money while one
 * waits; and on an Engagement, what a Dispute holds taken out of it and the
 * Dispute closed; what is left to the Client taken back by the Chargebacks,
 * up to what the bank sent back, then refunded; what is released, less the
 * Artisan Fee; the Engagement ended; its row in the Conversation; the items
 * of the others closed; and the parties told. Of what the bank sent back,
 * what was not left with it pays the Refunds still waiting on its Payment,
 * which are then never sent, and the rest is the platform's loss, in the
 * ledger too.
 */
async function decisionWrites(
  ctx: Context,
  admin: AdminActor,
  of: {
    chargeback: ChargebackRow;
    deciding: ChargebackRow[];
    engagement: EngagementRow | null;
    /** The Engagement's money, as the decision was worked out from it. */
    money: Awaited<ReturnType<typeof engagementMoney>> | null;
    released: Record<Line, number>;
  },
): Promise<Write[]> {
  const { chargeback, deciding, engagement, money, released } = of;
  const now = ctx.now();
  const left: Record<Line, number> = {
    materials: (money?.materials.unreleasedCents ?? 0) - released.materials,
    labour: (money?.labour.unreleasedCents ?? 0) - released.labour,
  };
  // What is left to the Client goes back by each Chargeback, as far as the bank sent it back and
  // the Chargeback's Payment paid in of the line, then by a Refund.
  const available = new Map(
    (engagement ? await leftByPayment(ctx, engagement.id) : []).map(({ paymentId, ...left }) => [
      paymentId,
      left,
    ]),
  );
  // The Refunds of the charged-back Payments not with the payment adapter: waiting, or failed and
  // owed by hand.
  const unsent = await ctx.db
    .select()
    .from(refunds)
    .where(
      and(
        inArray(
          refunds.paymentId,
          deciding.map((each) => each.paymentId),
        ),
        inArray(refunds.state, ["waiting", "failed"]),
      ),
    )
    // In the order they were made, however close together.
    .orderBy(asc(refunds.madeAt), sql`${refunds}.rowid`);
  const toTakeBack = { ...left };
  const shares = deciding.map((each) => {
    let reversed = each.reversedCents ?? 0;
    const taken = { materials: 0, labour: 0 };
    for (const line of Object.keys(LINES) as Line[]) {
      const cents = Math.min(
        toTakeBack[line],
        reversed,
        available.get(each.paymentId)?.[line] ?? 0,
      );
      taken[line] = cents;
      toTakeBack[line] -= cents;
      reversed -= cents;
    }
    // What of a Refund not yet sent the bank sent back already is never sent: the Client has it.
    const sentBack = [];
    for (const refund of unsent) {
      if (refund.paymentId !== each.paymentId || reversed === 0) continue;
      const cents = Math.min(refund.amountCents, reversed);
      sentBack.push({ refund, cents });
      reversed -= cents;
    }
    return { chargeback: each, taken, sentBack, lossCents: reversed };
  });
  const sentBack = shares.flatMap((share) => share.sentBack);
  const sentBackCents = sentBack.reduce((sum, each) => sum + each.cents, 0);
  const refunded = toTakeBack;
  const releasedCents = released.materials + released.labour;
  const refundedCents = refunded.materials + refunded.labour;
  const chargedBackCents = left.materials + left.labour - refundedCents;

  const decidedNow = exists(
    ctx.db
      .select({ one: sql`1` })
      .from(chargebacks)
      .where(
        and(
          eq(chargebacks.id, chargeback.id),
          eq(chargebacks.state, "decided"),
          eq(chargebacks.decidedAt, now),
        ),
      ),
  );
  const writes: Write[] = shares.map((share) =>
    ctx.db
      .update(chargebacks)
      .set({
        state: "decided",
        decidedAt: now,
        releasedCents: share.chargeback.id === chargeback.id ? releasedCents : 0,
        chargedBackCents: share.taken.materials + share.taken.labour,
        refundedCents: share.chargeback.id === chargeback.id ? refundedCents : 0,
        lossCents: share.lossCents,
      })
      .where(and(eq(chargebacks.id, share.chargeback.id), eq(chargebacks.state, "closed"))),
  );
  // The loss, on each Chargeback's own Payment.
  writes.push(
    ...ledgerWrites(
      ctx,
      shares.map((share) => ({
        kind: LEDGER_KINDS.chargebackLoss,
        amountCents: share.lossCents,
        paymentId: share.chargeback.paymentId,
        engagementId: share.chargeback.engagementId,
      })),
      decidedNow,
    ),
  );
  // What of each Refund the bank sent back, no longer owed; the rest, a waiting Refund of its own.
  for (const { refund, cents } of sentBack) {
    const chargedBackNow = exists(
      ctx.db
        .select({ one: sql`1` })
        .from(refunds)
        .where(and(eq(refunds.id, refund.id), eq(refunds.state, "charged-back"))),
    );
    writes.push(
      ctx.db
        .update(refunds)
        .set({ state: "charged-back", chargedBackCents: cents })
        .where(and(eq(refunds.id, refund.id), eq(refunds.state, refund.state), decidedNow)),
      ...ledgerWrites(
        ctx,
        [
          {
            kind: LEDGER_KINDS.refundChargedBack,
            amountCents: cents,
            paymentId: refund.paymentId,
            engagementId: refund.engagementId,
          },
        ],
        chargedBackNow,
      ),
    );
    if (cents < refund.amountCents) {
      writes.push(
        insertWhile(ctx, refunds, restOf(ctx, refund, refund.amountCents - cents), chargedBackNow),
      );
    }
  }
  // The others' items, closed with this one's.
  for (const share of shares) {
    if (share.chargeback.id === chargeback.id) continue;
    writes.push(
      ctx.db
        .update(queueItems)
        .set({ decision: TOGETHER, decidedBy: admin.adminId, decidedAt: now })
        .where(
          and(
            eq(queueItems.kind, chargebackItem.kind),
            eq(queueItems.subjectId, share.chargeback.id),
            isNull(queueItems.decidedAt),
            decidedNow,
          ),
        ),
    );
  }
  // A Payment that Hired nobody has no money left to decide, nor anyone to tell but of its Refund.
  if (!engagement || !money) {
    const payment = sentBackCents > 0 ? await paymentRow(ctx, chargeback.paymentId) : null;
    const job = payment && (await jobRow(ctx, payment.jobId));
    if (job) {
      writes.push(
        ...tellWhile(
          ctx,
          admin,
          [chargeback.clientId],
          {
            event: "payment.chargeback-decided",
            title: `${formatRands(sentBackCents)} of your Refund is not sent, as your bank sent it back by your Chargeback: ${job.title}`,
            link: `/jobs/${job.id}`,
          },
          decidedNow,
        ),
      );
    }
    return writes;
  }

  const dispute = await openDisputeOf(ctx, engagement.id);
  const heldReleased = Math.min(money.heldCents, released.labour);
  const heldLeft = money.heldCents - heldReleased;
  const row = (kind: LedgerKind, amountCents: number, paymentId = engagement.paymentId) => ({
    kind,
    amountCents,
    paymentId,
    engagementId: engagement.id,
  });
  const chargedBack = shares.flatMap((share) =>
    (Object.keys(LINES) as Line[]).map((line) =>
      row(LINES[line].chargedBack, share.taken[line], share.chargeback.paymentId),
    ),
  );
  writes.push(
    ...ledgerWrites(
      ctx,
      [
        // What it takes of a Dispute first, as the ledger checks each row as it is written.
        row(LEDGER_KINDS.disputeReleased, heldReleased),
        row(LEDGER_KINDS.disputeRefunded, heldLeft),
        // Then what is left to the Client, before the Releases, as a Release of Materials must
        // leave none unreleased.
        ...chargedBack,
      ],
      decidedNow,
    ),
  );
  if (refundedCents > 0) {
    writes.push(
      // From what each Payment has left once the Chargebacks took theirs back.
      ...(await refundWrites(ctx, engagement, "chargeback", refunded, decidedNow, chargedBack))
        .writes,
    );
  }
  writes.push(
    ...ledgerWrites(
      ctx,
      [
        ...releaseRows(engagement, LEDGER_KINDS.materialsReleased, released.materials),
        ...releaseRows(engagement, LEDGER_KINDS.labourReleased, released.labour),
      ],
      decidedNow,
    ),
  );
  if (dispute) {
    writes.push(
      ctx.db
        .update(disputes)
        .set({
          state: "decided",
          closedAt: now,
          releasedCents: heldReleased,
          refundedCents: heldLeft,
        })
        .where(and(eq(disputes.id, dispute.id), eq(disputes.state, "open"), decidedNow)),
      // Unguarded on decided_at's trigger: the Dispute's item is closed with the Chargeback's.
      ctx.db
        .update(queueItems)
        .set({ decision: CHARGEBACK_DECIDED, decidedBy: admin.adminId, decidedAt: now })
        .where(
          and(
            eq(queueItems.kind, disputeItem.kind),
            eq(queueItems.subjectId, dispute.id),
            isNull(queueItems.decidedAt),
            decidedNow,
          ),
        ),
    );
  }
  writes.push(...endWrites(ctx, engagement, dispute ? endsAs(dispute) : null, decidedNow));
  writes.push(eventWrite(ctx, engagement, "chargeback.decided", decidedNow));
  const link = `/jobs/${engagement.jobId}`;
  const parts = [
    `${formatRands(releasedCents)} is released to the Artisan`,
    ...(chargedBackCents > 0
      ? [`${formatRands(chargedBackCents)} stays with your bank's Chargeback`]
      : []),
    ...(refundedCents > 0 ? [`${formatRands(refundedCents)} is refunded to you`] : []),
    ...(sentBackCents > 0
      ? [`${formatRands(sentBackCents)} of your Refunds is not sent, as your bank sent it back`]
      : []),
  ];
  writes.push(
    ...tellWhile(
      ctx,
      admin,
      [engagement.clientId],
      {
        event: "engagement.chargeback-decided",
        title: `The Admin decided the money your Chargeback froze: ${parts.join(", ")}: ${engagement.jobTitle}`,
        link,
      },
      decidedNow,
    ),
    ...tellWhile(
      ctx,
      admin,
      [engagement.artisanId],
      {
        event: "engagement.chargeback-decided",
        title: `The Admin decided the money the Chargeback froze: ${formatRands(releasedCents)} is released to you, and ${formatRands(chargedBackCents + refundedCents)} goes back to the Client: ${engagement.jobTitle}`,
        link,
      },
      decidedNow,
    ),
  );
  return writes;
}

/**
 * The rest of a Refund the bank sent back only part of, as a waiting Refund
 * of its own: what the bank sent back is taken off its Protection Fee first,
 * then its Materials, then its Labour. Its money is in the ledger already,
 * as the Refund's, so it has no rows of its own until it is sent.
 */
function restOf(ctx: Context, refund: typeof refunds.$inferSelect, restCents: number) {
  let sentBack = refund.amountCents - restCents;
  const less = (cents: number) => {
    const taken = Math.min(cents, sentBack);
    sentBack -= taken;
    return cents - taken;
  };
  const protectionFeeCents = less(refund.protectionFeeCents);
  const materialsCents = less(refund.materialsCents);
  const labourCents = less(refund.labourCents);
  return waitingRefund(ctx, ctx.newId(), {
    paymentId: refund.paymentId,
    engagementId: refund.engagementId,
    clientId: refund.clientId,
    cause: refund.cause,
    labourCents,
    materialsCents,
    protectionFeeCents,
  });
}

/**
 * The writes that end the Engagement once the Admin decided its money:
 * Completed once a Completion was made, or as its Dispute ends; otherwise
 * Cancelled, by neither party; nothing if it had ended already.
 */
function endWrites(
  ctx: Context,
  engagement: EngagementRow,
  disputeEnds: "completed" | "cancelled" | null,
  decidedNow: SQL,
): Write[] {
  const now = ctx.now();
  const from = and(
    eq(engagements.id, engagement.id),
    eq(engagements.state, engagement.state),
    decidedNow,
  );
  switch (engagement.state) {
    case "completed":
    case "cancelled":
      return [];
    case "disputed":
      return [
        disputeEnds === "cancelled"
          ? ctx.db.update(engagements).set({ state: "cancelled" }).where(from)
          : ctx.db.update(engagements).set({ state: "completed", completedAt: now }).where(from),
      ];
    case "awaiting-approval":
    case "fix-requested":
      return [ctx.db.update(engagements).set({ state: "completed", completedAt: now }).where(from)];
    case "paid":
    case "work-started":
      return [
        ctx.db
          .update(engagements)
          .set({ state: "cancelled", cancelledAt: now, cancelledBy: null })
          .where(from),
      ];
  }
}

/**
 * The Engagement's Chargebacks as a party sees them: frozen while one waits
 * for the Admin, and once all are decided, what went where and the Admin's
 * reason. Null if it has none.
 */
export async function chargebackView(ctx: Context, engagementId: string) {
  const all = await chargebacksOf(ctx, engagementId);
  if (all.length === 0) return null;
  const frozen = all.some((each) => each.state !== "decided");
  const sum = (cents: (each: ChargebackRow) => number | null) =>
    all.reduce((total, each) => total + (cents(each) ?? 0), 0);
  return {
    frozen,
    openedAt: all[0]!.openedAt,
    decision: frozen
      ? null
      : {
          decidedAt: new Date(Math.max(...all.map((each) => each.decidedAt!.getTime()))),
          releasedCents: sum((each) => each.releasedCents),
          chargedBackCents: sum((each) => each.chargedBackCents),
          refundedCents: sum((each) => each.refundedCents),
          reason: await decisionReason(
            ctx,
            all.map((each) => each.id),
          ),
        },
  };
}

/** The reason the Admin gave for deciding one of these Chargebacks. */
async function decisionReason(ctx: Context, chargebackIds: string[]) {
  const [row] = await ctx.db
    .select({ reason: queueItems.reason })
    .from(queueItems)
    .where(
      and(
        eq(queueItems.kind, chargebackItem.kind),
        inArray(queueItems.subjectId, chargebackIds),
        eq(queueItems.decision, "decide"),
      ),
    );
  return row?.reason ?? "";
}
