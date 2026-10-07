import { and, eq, exists, inArray, sql } from "drizzle-orm";
import { system } from "../actor";
import { startClock, type ClockHandler } from "../clocks";
import type { Context } from "../context";
import { LEDGER_KINDS, ledgerWrites, RELEASED_PARTS, type LedgerKind } from "../ledger";
import { formatRands } from "../money";
import type { PaymentEvent } from "../ports";
import { formatDay, saDay } from "../sa-days";
import { accounts, engagements, jobs, ledgerEntries, payouts, verificationChecks } from "../schema";
import { raiseSupportRequest } from "../support";
import { emailTells, tellWhile, tellWithEmailWhile } from "../tells";
import { payoutReference, UNPAID_STATES } from "./run";

// A Payout's events from the payment adapter (#128). They may repeat or
// arrive out of order, so each reads the Payout's state and changes nothing
// an event already changed. A paused Payout tells nobody and gets no Receipt
// until it is paid; after 3 days paused, the Artisan is told it is delayed,
// not lost, and a system Support request is raised.

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

/**
 * The Payout with what its Receipt names: the Job, the Artisan, the Release
 * it pays, and the Payout account; null if there is none.
 */
async function payoutRow(ctx: Context, payoutId: string) {
  const [row] = await ctx.db
    .select({
      payout: payouts,
      paymentId: engagements.paymentId,
      artisanFeePercent: engagements.artisanFeePercent,
      jobTitle: jobs.title,
      artisanName: accounts.name,
      releaseEventId: ledgerEntries.eventId,
      bankAccount: verificationChecks.details,
    })
    .from(payouts)
    .innerJoin(engagements, eq(engagements.id, payouts.engagementId))
    .innerJoin(jobs, eq(jobs.id, engagements.jobId))
    .innerJoin(accounts, eq(accounts.id, payouts.artisanId))
    .innerJoin(ledgerEntries, eq(ledgerEntries.id, payouts.owedEntryId))
    .innerJoin(verificationChecks, eq(verificationChecks.id, payouts.payoutAccountId))
    .where(eq(payouts.id, payoutId));
  if (!row) return null;
  const { payout, ...about } = row;
  return { ...payout, ...about };
}

type PayoutRow = NonNullable<Awaited<ReturnType<typeof payoutRow>>>;

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
  const { bank, accountNumber } = payout.bankAccount;
  return [
    "Receipt for your Payout on ArtisanConnect.",
    "",
    `Job: ${payout.jobTitle}`,
    `Paid on: ${formatDay(saDay(paidAt))}`,
    `Reference: ${payoutReference(payout.id)}`,
    `Paid to: ${bank} account ending ${accountNumber?.slice(-4)}`,
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
