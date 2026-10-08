import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Actor } from "../actor";
import { system } from "../actor";
import { firstProblem } from "../accounts/inputs";
import { startClock, type ClockHandler } from "../clocks";
import type { Context, Write } from "../context";
import { eventWrite } from "../conversations/rows";
import { heldRefundRows, settleIfNothingHeld } from "../engagements/dispute";
import { refundFields, type RefundFields } from "../engagements/inputs";
import { insertWhile } from "../guarded";
import { engagementRow, type EngagementRow } from "../engagements/rows";
import {
  engagementMoney,
  isOverdrawn,
  LEDGER_KINDS,
  ledgerWrites,
  type LedgerRow,
} from "../ledger";
import { formatRands } from "../money";
import type { PaymentEvent } from "../ports";
import { ok, refuse } from "../result";
import { formatDay, saDay } from "../sa-days";
import { ledgerEntries, payments, refunds } from "../schema";
import { raiseSupportRequest } from "../support";
import { emailTells, tellWhile, tellWithEmailWhile } from "../tells";
import {
  receiptText,
  refundIs,
  refundReference,
  refundRow,
  UNSETTLED_STATES,
  type RefundRow,
} from "./rows";

// Refunds (#132, ADR 0008): unreleased money sent back to the Client, never
// the Protection Fee, by the Artisan's choice at any time or a Cancellation
// (#133); and a Payment that Hired nobody, or arrived for an Updated Quote no
// longer proposed, sent back whole (#126, #134). An Engagement's money may
// have come in by its Hire's Payment and each Updated Quote's, so a Refund of
// it is one per Payment it takes money back from. The payment adapter takes
// one Refund at a time per collection, so a Refund waits while another of
// its Payment is with it. On the bank paying it, the Client is told with a
// Receipt. One the bank cannot take stays owed to the Client and raises a
// system Support request; the Admin pays it by hand. Nothing is retried. One
// paused while the float is low tells nobody until, after 3 days, the Client
// is told it is delayed, not lost, and a system Support request is raised.

/** The clock that tells the Client a Refund paused for 3 days is delayed, not lost. */
export const PAUSED_CLOCK = "refund.paused";

const PAUSED_FOR_MS = 3 * 24 * 60 * 60 * 1000;

const PARTS = { materials: "Materials", labour: "Labour" } as const;

/** Why a Refund was made, as the payment adapter is told. */
const ADAPTER_REASONS: Record<RefundCause, (notHiredFor: string | null) => string> = {
  artisan: () => "Refund by the Artisan",
  "not-hired": (notHiredFor) => `No Hire: ${notHiredFor}`,
  cancellation: () => "Cancellation",
  dispute: () => "Dispute decision",
};

/**
 * The Artisan refunds an amount of each unreleased line of their Engagement,
 * at any time, without the Client's agreement. It is sent to the Client's
 * bank at once, or after a Refund of the same Payment already on its way.
 */
export async function refundByArtisan(
  ctx: Context,
  actor: Actor,
  input: { engagementId: string } & RefundFields,
) {
  const engagement = await engagementRow(ctx, input.engagementId);
  if (actor.kind !== "artisan" || !engagement || engagement.artisanId !== actor.accountId) {
    return refuse("not-found", "That Engagement does not exist.");
  }
  const parsed = refundFields.safeParse({ materials: input.materials, labour: input.labour });
  if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
  // Not while a Chargeback freezes the Engagement's money, too, once there are Chargebacks (#137).
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // An Updated Quote's extra Materials and Labour are more of each line (#134).
    const { materials, labour, heldCents } = await engagementMoney(ctx, engagement.id);
    const unreleased = { materials: materials.unreleasedCents, labour: labour.unreleasedCents };
    if (unreleased.materials + unreleased.labour === 0) {
      return refuse(
        "nothing-unreleased",
        "Nothing is unreleased on this Job, so nothing can be refunded.",
      );
    }
    for (const part of ["materials", "labour"] as const) {
      if (parsed.data[part] > unreleased[part]) {
        return refuse(
          "more-than-unreleased",
          unreleased[part] === 0
            ? `None of the ${PARTS[part]} is unreleased, so none of it can be refunded.`
            : `You can refund at most ${formatRands(unreleased[part])} of the ${PARTS[part]}.`,
        );
      }
    }
    let refundIds: string[];
    try {
      const made = await refundWrites(ctx, engagement, "artisan", parsed.data);
      await ctx.commit([
        // A Refund of Labour during a Dispute refunds what it holds first (#135), written
        // first, as the ledger checks each row as it is written.
        ...ledgerWrites(ctx, heldRefundRows(engagement, parsed.data.labour, heldCents)),
        ...made.writes,
      ]);
      refundIds = made.refundIds;
    } catch (error) {
      // A Release or another Refund took the money meanwhile: read it again.
      if (isOverdrawn(error)) continue;
      throw error;
    }
    await sendEngagementRefunds(ctx, engagement.id);
    if (heldCents > 0) {
      await settleIfNothingHeld(ctx, engagement.id);
      await emailTells(ctx).catch((error: unknown) => {
        console.error("Tell emails did not go", error);
      });
    }
    return ok({ refundIds });
  }
  throw new Error(`Engagement ${engagement.id}'s money kept changing while it was refunded`);
}

/**
 * The writes of a Refund of an Engagement's unreleased money, by the Artisan
 * or a Cancellation, in one batch: a Refund for each Payment it takes money
 * back from, waiting to be sent; what each refunds of each line, and owes the
 * Client, in the ledger; and one row in the Conversation. With a condition,
 * each is written only while it holds when the batch runs. The ledger aborts
 * the batch if a line would go below nothing unreleased. Send them with
 * `sendEngagementRefunds` once committed.
 */
export async function refundWrites(
  ctx: Context,
  engagement: Pick<EngagementRow, "id" | "clientId" | "jobId" | "artisanId">,
  cause: Exclude<RefundCause, "not-hired">,
  amounts: { materials: number; labour: number },
  condition?: SQL,
): Promise<{ writes: Write[]; refundIds: string[] }> {
  const amountCents = amounts.materials + amounts.labour;
  const split = await splitByPayment(ctx, engagement.id, amounts);
  const refundIds: string[] = [];
  const writes: Write[] = [];
  const rows: LedgerRow[] = [];
  for (const { paymentId, materials, labour } of split) {
    const of = (kind: LedgerRow["kind"], amountCents: number): LedgerRow => ({
      kind,
      amountCents,
      paymentId,
      engagementId: engagement.id,
    });
    const refund = waitingRefund(ctx, ctx.newId(), {
      paymentId,
      engagementId: engagement.id,
      clientId: engagement.clientId,
      cause,
      labourCents: labour,
      materialsCents: materials,
      protectionFeeCents: 0,
    });
    refundIds.push(refund.id);
    writes.push(
      condition
        ? insertWhile(ctx, refunds, refund, condition)
        : ctx.db.insert(refunds).values(refund),
    );
    rows.push(
      of(LEDGER_KINDS.materialsRefunded, materials),
      of(LEDGER_KINDS.labourRefunded, labour),
      of(LEDGER_KINDS.refundOwed, materials + labour),
    );
  }
  return {
    writes: [
      ...writes,
      ...ledgerWrites(ctx, rows, condition),
      eventWrite(ctx, engagement, "refund", condition ?? sql`1`, formatRands(amountCents)),
    ],
    refundIds,
  };
}

/** Which line each kind a Refund's split reads is of, and whether it adds to what is left of it. */
const LINE_OF = {
  [LEDGER_KINDS.materialsIn]: { part: "materials", sign: 1 },
  [LEDGER_KINDS.labourIn]: { part: "labour", sign: 1 },
  [LEDGER_KINDS.materialsRefunded]: { part: "materials", sign: -1 },
  [LEDGER_KINDS.labourRefunded]: { part: "labour", sign: -1 },
} as const;

/**
 * A Refund's amounts split over the Payments the Engagement's money came in
 * by, the Hire's first, then each Updated Quote's (#134): the adapter refunds
 * a collection at most what it collected, so each takes back at most what it
 * paid in of a line, less what was refunded of it. Fewest Refunds that way.
 */
async function splitByPayment(
  ctx: Context,
  engagementId: string,
  amounts: { materials: number; labour: number },
) {
  const rows = await ctx.db
    .select({
      paymentId: ledgerEntries.paymentId,
      kind: ledgerEntries.kind,
      cents: sql<number>`sum(${ledgerEntries.amountCents})`,
      // In the order the money came in, however close together.
      first: sql<number>`min(${ledgerEntries}.rowid)`,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.engagementId, engagementId),
        inArray(ledgerEntries.kind, Object.keys(LINE_OF)),
      ),
    )
    .groupBy(ledgerEntries.paymentId, ledgerEntries.kind);
  const byPayment = new Map<string, { first: number; materials: number; labour: number }>();
  for (const row of rows) {
    if (!row.paymentId) continue;
    const left = byPayment.get(row.paymentId) ?? { first: Infinity, materials: 0, labour: 0 };
    const { part, sign } = LINE_OF[row.kind as keyof typeof LINE_OF];
    left[part] += sign * row.cents;
    if (sign > 0) left.first = Math.min(left.first, row.first);
    byPayment.set(row.paymentId, left);
  }
  const owed = { ...amounts };
  const split = [...byPayment.entries()]
    .sort(([, a], [, b]) => a.first - b.first)
    .map(([paymentId, left]) => {
      const materials = Math.min(owed.materials, left.materials);
      const labour = Math.min(owed.labour, left.labour);
      owed.materials -= materials;
      owed.labour -= labour;
      return { paymentId, materials, labour };
    })
    .filter((each) => each.materials + each.labour > 0);
  // Another Refund took the money between the caller's read and this one.
  if (owed.materials + owed.labour > 0) throw new Error("A Refund of more than is unreleased");
  return split;
}

/**
 * Sends each waiting Refund of the Engagement, one Payment at a time; one
 * not sent now is sent by the every-minute run.
 */
export async function sendEngagementRefunds(ctx: Context, engagementId: string) {
  const waiting = await ctx.db
    .select({ paymentId: refunds.paymentId })
    .from(refunds)
    .where(and(eq(refunds.engagementId, engagementId), eq(refunds.state, "waiting")))
    .groupBy(refunds.paymentId)
    .orderBy(sql`min(${refunds}.rowid)`);
  for (const { paymentId } of waiting) {
    await sendRefunds(ctx, paymentId).catch((error: unknown) => {
      console.error(
        `Refunds of Payment ${paymentId} were not sent; the every-minute run sends them`,
        error,
      );
    });
  }
}

/**
 * The write of a Refund of a whole Payment that Hired nobody, Protection Fee
 * included, waiting to be sent; commit it with the Payment's arrival.
 */
export function notHiredRefundWrite(
  ctx: Context,
  refundId: string,
  payment: {
    id: string;
    clientId: string;
    labourCents: number;
    materialsCents: number;
    protectionFeeCents: number;
    amountCents: number;
  },
): Write {
  return ctx.db.insert(refunds).values(
    waitingRefund(ctx, refundId, {
      paymentId: payment.id,
      engagementId: null,
      clientId: payment.clientId,
      cause: "not-hired",
      labourCents: payment.labourCents,
      materialsCents: payment.materialsCents,
      protectionFeeCents: payment.protectionFeeCents,
    }),
  );
}

type RefundRecord = typeof refunds.$inferSelect;
type RefundCause = RefundRecord["cause"];

/** A Refund just made, waiting to be sent: its amount is what it refunds of each part. */
function waitingRefund(
  ctx: Context,
  id: string,
  of: Pick<
    RefundRecord,
    | "paymentId"
    | "engagementId"
    | "clientId"
    | "cause"
    | "labourCents"
    | "materialsCents"
    | "protectionFeeCents"
  >,
): RefundRecord {
  return {
    id,
    ...of,
    amountCents: of.labourCents + of.materialsCents + of.protectionFeeCents,
    state: "waiting",
    madeAt: ctx.now(),
    sentAt: null,
    pausedAt: null,
    paidAt: null,
    failedAt: null,
    failedFor: null,
  };
}

/**
 * Sends the Payment's oldest waiting Refund to the payment adapter, unless
 * another of its Refunds is still with it: one at a time per collection. Our
 * id makes asking again harmless, so one the adapter took though its answer
 * was lost is asked again first.
 */
export async function sendRefunds(ctx: Context, paymentId: string) {
  const rows = await ctx.db
    .select({ refund: refunds, notHiredFor: payments.notHiredFor })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .where(eq(refunds.paymentId, paymentId))
    // In the order they were made, however close together.
    .orderBy(asc(refunds.madeAt), sql`${refunds}.rowid`);
  if (rows.some(({ refund }) => refund.state === "sent" || refund.state === "paused")) return;
  const next = rows.find(({ refund }) => refund.state === "waiting");
  if (!next) return;
  const { refund, notHiredFor } = next;
  // A throw leaves it waiting, asked again every minute, as for a provider that
  // is down. The fake never refuses a Refund for good; a real adapter must
  // answer one it will never take as a refund.failed event instead, so it
  // stays owed and the Admin pays it by hand, rather than holding back every
  // later Refund of this Payment.
  await ctx.ports.payments.refund({
    id: refund.id,
    collectionId: paymentId,
    amountCents: refund.amountCents,
    reason: ADAPTER_REASONS[refund.cause](notHiredFor),
  });
  const now = ctx.now();
  await ctx.commit([
    ctx.db
      .update(refunds)
      .set({ state: "sent", sentAt: now })
      .where(and(eq(refunds.id, refund.id), eq(refunds.state, "waiting"))),
    ...ledgerWrites(
      ctx,
      [
        {
          kind: LEDGER_KINDS.refundSent,
          amountCents: refund.amountCents,
          paymentId,
          engagementId: refund.engagementId,
        },
      ],
      refundIs(ctx, refund.id, "sent", { column: "sentAt", is: now }),
    ),
  ]);
}

/**
 * Sends every Payment's waiting Refund that a command could not send, as
 * when the adapter was down. Called every minute.
 */
export async function sendWaitingRefunds(ctx: Context) {
  const waiting = await ctx.db
    .select({ paymentId: refunds.paymentId })
    .from(refunds)
    .where(eq(refunds.state, "waiting"))
    .groupBy(refunds.paymentId)
    // In the order they were made, however close together.
    .orderBy(sql`min(${refunds}.rowid)`);
  const failures: unknown[] = [];
  for (const { paymentId } of waiting) {
    await sendRefunds(ctx, paymentId).catch((error: unknown) => failures.push(error));
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `${failures.length} Refunds were not sent`);
  }
}

/**
 * The bank paid a Refund to the Client: no longer owed, and the Client is
 * told with a Receipt. The Payment's next waiting Refund goes.
 */
export async function refundSucceeded(
  ctx: Context,
  event: Extract<PaymentEvent, { type: "refund.succeeded" }>,
) {
  const refund = await refundRow(ctx, event.refundId);
  if (!refund) return;
  if (isUnsettled(refund)) {
    const now = ctx.now();
    const paidNow = refundIs(ctx, refund.id, "paid", { column: "paidAt", is: now });
    await ctx.commit([
      ctx.db
        .update(refunds)
        .set({ state: "paid", paidAt: now })
        .where(and(eq(refunds.id, refund.id), inArray(refunds.state, UNSETTLED_STATES))),
      ...ledgerWrites(ctx, answeredRows(refund, LEDGER_KINDS.refundPaid), paidNow),
      tellWithEmailWhile(
        ctx,
        refund.clientId,
        {
          event: "refund.paid",
          title: `Your Refund of ${formatRands(refund.amountCents)} was paid: ${refund.jobTitle}`,
          link: `/jobs/${refund.jobId}`,
          body: receiptText(refund, now),
        },
        paidNow,
      ),
    ]);
  }
  await settled(ctx, refund);
}

/**
 * The bank could not take a Refund: it stays owed to the Client, who is
 * told, and a system Support request is raised for the Admin to pay it by
 * hand. It is not retried. The Payment's next waiting Refund goes.
 */
export async function refundFailed(
  ctx: Context,
  event: Extract<PaymentEvent, { type: "refund.failed" }>,
) {
  const refund = await refundRow(ctx, event.refundId);
  if (!refund) return;
  if (isUnsettled(refund)) {
    const now = ctx.now();
    const failedNow = refundIs(ctx, refund.id, "failed", { column: "failedAt", is: now });
    const amount = formatRands(refund.amountCents);
    await ctx.commit([
      ctx.db
        .update(refunds)
        .set({ state: "failed", failedAt: now, failedFor: event.reason })
        .where(and(eq(refunds.id, refund.id), inArray(refunds.state, UNSETTLED_STATES))),
      ...ledgerWrites(ctx, answeredRows(refund, LEDGER_KINDS.refundFailed), failedNow),
      ...tellWhile(
        ctx,
        system,
        [refund.clientId],
        {
          event: "refund.failed",
          title: `Your bank could not take your Refund of ${amount}. It is still owed to you, and we will pay it by bank transfer: ${refund.jobTitle}`,
          link: `/jobs/${refund.jobId}`,
        },
        failedNow,
      ),
      ...raiseSupportRequest(
        ctx,
        {
          tag: "failed-refund",
          about: `a Refund of ${amount} to ${refund.clientName}`,
          details: [
            `The bank could not take the Refund ${refundReference(refund.id)} of ${amount} for ${refund.jobTitle}, made on ${formatDay(saDay(refund.madeAt))}: ${event.reason}.`,
            "It is still owed to the Client, who was told it will be paid by bank transfer. Ask the Client for their bank account, pay it, and record the transfer here. It is not retried.",
          ].join("\n\n"),
          accountId: refund.clientId,
          refundId: refund.id,
        },
        failedNow,
      ),
    ]);
  }
  await settled(ctx, refund);
}

/**
 * The provider paused a Refund because the float is low. Nobody is told and
 * no Receipt goes until it is paid; a clock tells the Client after 3 days.
 */
export async function refundPaused(
  ctx: Context,
  event: Extract<PaymentEvent, { type: "refund.paused" }>,
) {
  const refund = await refundRow(ctx, event.refundId);
  if (!refund || (refund.state !== "waiting" && refund.state !== "sent")) return;
  const now = ctx.now();
  await ctx.commit([
    ctx.db
      .update(refunds)
      .set({ state: "paused", pausedAt: now })
      .where(and(eq(refunds.id, refund.id), inArray(refunds.state, ["waiting", "sent"]))),
    // Taken by the adapter though its answer was lost: it was sent.
    ...(refund.state === "waiting"
      ? ledgerWrites(
          ctx,
          [ledgerRowOf(refund, LEDGER_KINDS.refundSent)],
          refundIs(ctx, refund.id, "paused", { column: "pausedAt", is: now }),
        )
      : []),
    // A clock whose Refund was paid meanwhile does nothing when it fires.
    startClock(ctx, {
      kind: PAUSED_CLOCK,
      subjectId: refund.id,
      dueAt: new Date(now.getTime() + PAUSED_FOR_MS),
    }),
  ]);
}

/**
 * Tells the Client a Refund paused for 3 days is delayed, not lost, and
 * raises a system Support request, if it is still paused since then.
 */
const pausedFor3Days: ClockHandler = async (ctx, clock) => {
  const refund = await refundRow(ctx, clock.subjectId);
  if (
    refund?.state !== "paused" ||
    refund.pausedAt?.getTime() !== clock.dueAt.getTime() - PAUSED_FOR_MS
  ) {
    return [];
  }
  const stillPaused = refundIs(ctx, refund.id, "paused", {
    column: "pausedAt",
    is: refund.pausedAt,
  });
  const amount = formatRands(refund.amountCents);
  return [
    ...tellWhile(
      ctx,
      system,
      [refund.clientId],
      {
        event: "refund.delayed",
        title: `Your Refund of ${amount} is delayed, not lost: ${refund.jobTitle}`,
        link: `/jobs/${refund.jobId}`,
      },
      stillPaused,
    ),
    ...raiseSupportRequest(
      ctx,
      {
        tag: "paused-money",
        about: `a Refund of ${amount} to ${refund.clientName}`,
        details: [
          `The Refund ${refundReference(refund.id)} of ${amount} for ${refund.jobTitle} has been paused since ${formatDay(saDay(refund.pausedAt))}, as the float cannot cover it.`,
          "The Client was told it is delayed, not lost. It is paid once the float is topped up.",
        ].join("\n\n"),
        accountId: refund.clientId,
      },
      stillPaused,
    ),
  ];
};

export const refundClocks = { [PAUSED_CLOCK]: pausedFor3Days } satisfies Record<
  string,
  ClockHandler
>;

/** After a Refund's answer: the Payment's next waiting Refund goes, and the Tells' emails. */
async function settled(ctx: Context, refund: RefundRow) {
  await sendRefunds(ctx, refund.paymentId).catch((error: unknown) => {
    console.error(`Refunds of Payment ${refund.paymentId} were not sent`, error);
  });
  await emailTells(ctx).catch((error: unknown) => {
    console.error("Tell emails did not go", error);
  });
}

function isUnsettled(refund: RefundRow) {
  return (UNSETTLED_STATES as readonly string[]).includes(refund.state);
}

function ledgerRowOf(refund: RefundRow, kind: LedgerRow["kind"]): LedgerRow {
  return {
    kind,
    amountCents: refund.amountCents,
    paymentId: refund.paymentId,
    engagementId: refund.engagementId,
  };
}

/**
 * The rows of the bank's answer to a Refund. One still waiting in our rows
 * was taken by the adapter though its answer was lost, so it is recorded
 * sent too.
 */
function answeredRows(refund: RefundRow, kind: LedgerRow["kind"]): LedgerRow[] {
  return [
    ...(refund.state === "waiting" ? [ledgerRowOf(refund, LEDGER_KINDS.refundSent)] : []),
    ledgerRowOf(refund, kind),
  ];
}

/** An Engagement's Refunds, oldest first, as both parties see them. */
export async function refundsOf(ctx: Context, engagementId: string) {
  const rows = await ctx.db
    .select()
    .from(refunds)
    .where(eq(refunds.engagementId, engagementId))
    .orderBy(asc(refunds.madeAt), sql`${refunds}.rowid`);
  return rows.map((refund) => ({
    refundId: refund.id,
    amountCents: refund.amountCents,
    materialsCents: refund.materialsCents,
    labourCents: refund.labourCents,
    madeAt: refund.madeAt,
    state: shownState(refund.state),
  }));
}

/**
 * Where a Refund stands, as its parties see it: on its way (a paused one too,
 * as a pause tells nobody), paid, or owed and being paid by hand.
 */
export function shownState(state: (typeof refunds.$inferSelect)["state"]) {
  switch (state) {
    case "waiting":
    case "sent":
    case "paused":
      return "on-its-way" as const;
    case "paid":
    case "paid-by-hand":
      return "paid" as const;
    case "failed":
      return "owed" as const;
  }
}
