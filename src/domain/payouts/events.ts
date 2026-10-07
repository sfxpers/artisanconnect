import { and, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import { system } from "../actor";
import { systemAudit } from "../audit";
import { startClock, type ClockHandler } from "../clocks";
import type { Context } from "../context";
import { LEDGER_KINDS, ledgerWrites, RELEASED_PARTS, type LedgerKind } from "../ledger";
import { formatRands } from "../money";
import type { PaymentEvent } from "../ports";
import { formatDay, saDay } from "../sa-days";
import { ledgerEntries, payouts, verificationChecks } from "../schema";
import { raiseSupportRequest } from "../support";
import { emailTells, tellWhile, tellWithEmailWhile } from "../tells";
import { currentPayoutAccount } from "../verification";
import { accountName, payoutReference, payoutRow, UNPAID_STATES, type PayoutRow } from "./rows";

// A Payout's events from the payment adapter (#128). They may repeat or
// arrive out of order, so each reads the Payout's state and changes nothing
// an event already changed. A paused Payout tells nobody and gets no Receipt
// until it is paid; after 3 days paused, the Artisan is told it is delayed,
// not lost, and a system Support request is raised. A Payout the bank
// refuses or sends back leaves its Release owed again and stops the Payout
// account it went to (#129).

/** The clock that tells the Artisan a Payout paused for 3 days is delayed, not lost. */
export const PAUSED_CLOCK = "payout.paused";

const PAUSED_FOR_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The bank paid a Payout into the Artisan's Payout account: it is paid, no
 * longer owed, and the Artisan is told with a Receipt showing the Artisan Fee.
 */
export async function payoutSucceeded(
  ctx: Context,
  event: Extract<PaymentEvent, { type: "payout.succeeded" }>,
) {
  const payout = await payoutRow(ctx, event.payoutId);
  if (payout?.state === "unsent") {
    // Settled as never sent, so its Release went again: the bank has paid it twice.
    // Harmless while launch money is fake; with a real provider, raise a system
    // Support request here, as paused money does, so the Admin recovers it.
    console.error(`Payout ${payout.id}, settled as never sent, was paid by the bank`);
  }
  if (!payout || !isUnpaid(payout.state)) return;
  const now = ctx.now();
  const paidNow = exists(
    ctx.db
      .select({ one: sql`1` })
      .from(payouts)
      .where(and(eq(payouts.id, payout.id), eq(payouts.state, "paid"), eq(payouts.paidAt, now))),
  );
  const title = `You were paid ${formatRands(payout.amountCents)}: ${payout.jobTitle}`;
  await ctx.commit([
    ctx.db
      .update(payouts)
      .set({ state: "paid", paidAt: now })
      .where(and(eq(payouts.id, payout.id), inArray(payouts.state, UNPAID_STATES))),
    ...ledgerWrites(
      ctx,
      [
        {
          kind: LEDGER_KINDS.payoutPaid,
          amountCents: payout.amountCents,
          paymentId: payout.paymentId,
          engagementId: payout.engagementId,
        },
      ],
      paidNow,
    ),
    tellWithEmailWhile(
      ctx,
      payout.artisanId,
      {
        event: "payout.paid",
        title,
        link: "/payouts",
        body: await receiptText(ctx, payout, now),
      },
      paidNow,
    ),
  ]);
  await emailTells(ctx).catch((error: unknown) => {
    console.error("Tell emails did not go", error);
  });
}

/**
 * The provider paused a Payout because the float is low. Nobody is told and
 * no Receipt goes until it is paid; a clock tells the Artisan after 3 days.
 */
export async function payoutPaused(
  ctx: Context,
  event: Extract<PaymentEvent, { type: "payout.paused" }>,
) {
  const payout = await payoutRow(ctx, event.payoutId);
  if (!payout || (payout.state !== "created" && payout.state !== "pending")) return;
  const now = ctx.now();
  await ctx.commit([
    ctx.db
      .update(payouts)
      .set({ state: "paused", pausedAt: now })
      .where(and(eq(payouts.id, payout.id), inArray(payouts.state, ["created", "pending"]))),
    // A clock whose Payout was paid meanwhile does nothing when it fires.
    startClock(ctx, {
      kind: PAUSED_CLOCK,
      subjectId: payout.id,
      dueAt: new Date(now.getTime() + PAUSED_FOR_MS),
    }),
  ]);
}

/**
 * Tells the Artisan a Payout paused for 3 days is delayed, not lost, and
 * raises a system Support request, if it is still paused since then.
 */
const pausedFor3Days: ClockHandler = async (ctx, clock) => {
  const payout = await payoutRow(ctx, clock.subjectId);
  if (
    payout?.state !== "paused" ||
    payout.pausedAt?.getTime() !== clock.dueAt.getTime() - PAUSED_FOR_MS
  ) {
    return [];
  }
  const stillPaused = exists(
    ctx.db
      .select({ one: sql`1` })
      .from(payouts)
      .where(
        and(
          eq(payouts.id, payout.id),
          eq(payouts.state, "paused"),
          eq(payouts.pausedAt, payout.pausedAt),
        ),
      ),
  );
  const amount = formatRands(payout.amountCents);
  return [
    ...tellWhile(
      ctx,
      system,
      [payout.artisanId],
      {
        event: "payout.delayed",
        title: `Your Payout of ${amount} is delayed, not lost`,
        link: "/payouts",
      },
      stillPaused,
    ),
    ...raiseSupportRequest(
      ctx,
      {
        tag: "paused-money",
        about: `a Payout of ${amount} to ${payout.artisanName}`,
        details: [
          `The Payout ${payoutReference(payout.id)} of ${amount} for ${payout.jobTitle} has been paused since ${formatDay(saDay(payout.pausedAt))}, as the float cannot cover it.`,
          "The Artisan was told it is delayed, not lost. It is paid once the float is topped up.",
        ].join("\n\n"),
        accountId: payout.artisanId,
      },
      stillPaused,
    ),
  ];
};

export const payoutClocks = { [PAUSED_CLOCK]: pausedFor3Days } satisfies Record<
  string,
  ClockHandler
>;

function isUnpaid(state: string): boolean {
  return (UNPAID_STATES as readonly string[]).includes(state);
}

const PART_NAMES = { materials: "Materials", labour: "Labour" } as const;

/**
 * The Artisan's Receipt for a Payout: the Release it pays, the Artisan Fee
 * kept from it as the Release recorded it, and what was paid. Not a tax invoice.
 */
async function receiptText(ctx: Context, payout: PayoutRow, paidAt: Date) {
  const rows = await ctx.db
    .select({ kind: ledgerEntries.kind, amountCents: ledgerEntries.amountCents })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.eventId, payout.releaseEventId));
  const released = rows.find((row) => row.kind in RELEASED_PARTS);
  const fee = rows.find((row) => row.kind === LEDGER_KINDS.artisanFee);
  return [
    "Receipt for your Payout on ArtisanConnect.",
    "",
    `Job: ${payout.jobTitle}`,
    `Paid on: ${formatDay(saDay(paidAt))}`,
    `Reference: ${payoutReference(payout.id)}`,
    `Paid to: ${accountName(payout.bankAccount)}`,
    "",
    ...(released
      ? [
          `${PART_NAMES[RELEASED_PARTS[released.kind as LedgerKind]!]} released: ${formatRands(released.amountCents)}`,
        ]
      : []),
    `Artisan Fee (${payout.artisanFeePercent}%): ${formatRands(fee?.amountCents ?? 0)}`,
    `Paid to you: ${formatRands(payout.amountCents)}`,
    "",
    "This Receipt is not a tax invoice.",
  ].join("\n");
}

/** The bank refused a Payout it had taken: as if refused at sending. */
export async function payoutFailed(
  ctx: Context,
  event: Extract<PaymentEvent, { type: "payout.failed" }>,
) {
  await payoutStopped(ctx, event.payoutId, { to: "refused", reason: event.reason });
}

/** The bank sent back a Payout, even days after it was paid. */
export async function payoutSentBack(
  ctx: Context,
  event: Extract<PaymentEvent, { type: "payout.reversed" }>,
) {
  await payoutStopped(ctx, event.payoutId, { to: "sent-back", reason: event.reason });
}

/** The states a Payout may be refused from, or sent back from. */
const STOPPED_FROM = {
  refused: UNPAID_STATES,
  // A send-back may arrive before the event that paid it.
  "sent-back": [...UNPAID_STATES, "paid"],
} as const;

/**
 * A Payout the bank refused, at sending or later, or sent back (#129, from
 * #110). The Release stands and its money is owed to the Artisan again: the
 * next Payout pays the same amount, so the Artisan Fee is not charged twice.
 * The Payout account it went to stops being current, whatever the bank's
 * reason, so nothing more goes to it. The Artisan is told, naming the
 * Receipt, which stands; the Admin sees it in the log, with no queue item.
 */
export async function payoutStopped(
  ctx: Context,
  payoutId: string,
  stop: { to: "refused" | "sent-back"; reason: string },
) {
  // A paid Payout's send-back adds back what its payment took off the unpaid
  // total, so the state it is stopped from must be the state it was read in.
  for (let attempt = 0; attempt < 3; attempt++) {
    const payout = await payoutRow(ctx, payoutId);
    if (!payout || !(STOPPED_FROM[stop.to] as readonly string[]).includes(payout.state)) return;
    const now = ctx.now();
    const stoppedNow = exists(
      ctx.db
        .select({ one: sql`1` })
        .from(payouts)
        .where(
          and(eq(payouts.id, payout.id), eq(payouts.state, stop.to), eq(payouts.stoppedAt, now)),
        ),
    );
    const current = await currentPayoutAccount(ctx, payout.artisanId);
    const wasPaid = payout.state === "paid";
    const verb = stop.to === "refused" ? "refused" : "sent back";
    const amount = formatRands(payout.amountCents);
    const stopsAccount = current?.id === payout.payoutAccountId;
    await ctx.commit([
      ctx.db
        .update(payouts)
        .set({ state: stop.to, refusedFor: stop.reason, stoppedAt: now })
        .where(and(eq(payouts.id, payout.id), eq(payouts.state, payout.state))),
      ctx.db
        .update(verificationChecks)
        .set({ payoutsStoppedAt: now })
        .where(
          and(
            eq(verificationChecks.id, payout.payoutAccountId),
            isNull(verificationChecks.payoutsStoppedAt),
            stoppedNow,
          ),
        ),
      // Only a paid one's money comes back to the unpaid total; one never paid is still in it.
      ...ledgerWrites(
        ctx,
        [
          {
            kind: wasPaid ? LEDGER_KINDS.payoutSentBack : LEDGER_KINDS.payoutRefused,
            amountCents: payout.amountCents,
            paymentId: payout.paymentId,
            engagementId: payout.engagementId,
          },
        ],
        stoppedNow,
      ),
      tellWithEmailWhile(
        ctx,
        payout.artisanId,
        {
          event: `payout.${stop.to}`,
          title: `Your bank ${verb} a Payout of ${amount}: ${payout.jobTitle}`,
          link: "/payouts",
          body: stoppedText(payout, { verb, wasPaid, stopsAccount, hasCurrent: !!current }),
        },
        stoppedNow,
      ),
      systemAudit(
        ctx,
        {
          action: `payout.${stop.to}`,
          summary: `The bank ${verb} the Payout ${payoutReference(payout.id)} of ${amount} to ${payout.artisanName}${stopsAccount ? "; their Payout account is no longer current" : ""}`,
          subjectId: payout.artisanId,
        },
        stoppedNow,
      ),
      // A second send-back within 90 days raises a Signal once there are Signals (#140).
    ]);
    const [moved] = await ctx.db
      .select({ one: sql`1` })
      .from(payouts)
      .where(
        and(eq(payouts.id, payout.id), eq(payouts.state, stop.to), eq(payouts.stoppedAt, now)),
      );
    if (moved) {
      await emailTells(ctx).catch((error: unknown) => {
        console.error("Tell emails did not go", error);
      });
      return;
    }
  }
  throw new Error(`Payout ${payoutId} kept changing while it was being ${stop.to}`);
}

/**
 * What the Artisan is told of a Payout refused or sent back: the Receipt it
 * had, which stands, or that it had none; that the money is owed again; and
 * where it goes next.
 */
function stoppedText(
  payout: PayoutRow,
  how: { verb: string; wasPaid: boolean; stopsAccount: boolean; hasCurrent: boolean },
) {
  const amount = formatRands(payout.amountCents);
  const reference = payoutReference(payout.id);
  const account = accountName(payout.bankAccount);
  return [
    how.wasPaid && payout.paidAt
      ? `Your bank ${how.verb} the Payout of ${amount} for ${payout.jobTitle}, which your Receipt ${reference} of ${formatDay(saDay(payout.paidAt))} showed as paid. That Receipt stands; a Payout that lands later gets its own.`
      : `Your bank ${how.verb} the Payout ${reference} of ${amount} for ${payout.jobTitle}, so it was not paid and no Receipt was sent for it.`,
    "The money is owed to you again, and the Artisan Fee is not charged again.",
    how.stopsAccount || !how.hasCurrent
      ? `Your Payout account, ${account}, is no longer current, so nothing more is sent to it. You may still Quote and be Hired. Send a bank letter for another account in Verification: everything waiting for you goes in the first daily Payout run after the Admin accepts it.`
      : `Nothing more is sent to ${account}. It goes to your current Payout account in the next daily Payout run.`,
  ].join("\n\n");
}
