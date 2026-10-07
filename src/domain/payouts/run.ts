import { and, asc, desc, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import type { Context } from "../context";
import { causedBy } from "../errors";
import { insertWhile } from "../guarded";
import { LEDGER_KINDS, ledgerWrites } from "../ledger";
import { formatRands } from "../money";
import { saDay, saDayStart } from "../sa-days";
import {
  accounts,
  admins,
  engagements,
  ledgerEntries,
  payoutRuns,
  payouts,
  verificationChecks,
} from "../schema";
import { emailAddress } from "../tells";
import { currentPayoutAccount } from "../verification";

// The daily Payout run (#128, ADR 0005): once a day, at one South African
// time, every Release owed to an Artisan with a current Payout account and
// no Payout hold is sent as a Payout. Before it, the float's balance is
// checked; if it cannot cover the run, every Admin is emailed (the one thing
// an Admin is emailed about) and the Admin home shows a banner until it can.
// The Payouts go all the same: the provider pauses what it cannot pay.

type PayoutAccount = typeof verificationChecks.$inferSelect;

/** The Payouts not yet paid or refused: the float must still cover them. */
export const UNPAID_STATES = ["created", "pending", "paused"] as const;

/**
 * Runs today's Payouts once its time of day has come in South Africa, if
 * they have not run today. Called every minute, so a run missed at its time
 * goes the first minute after. Its emails go after it, with the Tells'.
 */
export async function runPayouts(ctx: Context) {
  const now = ctx.now();
  const day = saDay(now);
  if (now < runTimeOn(day, ctx.config.payoutRunTime) || (await ranOn(ctx, day))) {
    return { ran: false as const };
  }

  const owed = await releasesToSend(ctx);
  const neededCents = (await unpaidCents(ctx)) + owed.reduce((sum, r) => sum + r.amountCents, 0);
  const { cents: floatCents } = await ctx.ports.payments.getFloatBalance();
  const floatShort = floatCents < neededCents;
  // Claims the day, so two runs at once send nothing twice.
  const claimed = await ctx.db
    .insert(payoutRuns)
    .values({ day, ranAt: now, floatCents, neededCents })
    .onConflictDoNothing()
    .returning({ day: payoutRuns.day });
  if (claimed.length === 0) return { ran: false as const };
  if (floatShort) await ctx.commit(await floatShortEmails(ctx, floatCents, neededCents));

  const failures: unknown[] = [];
  let sent = 0;
  // A Payout an earlier run created but never heard back on is asked again, by the same id.
  for (const payout of await unanswered(ctx)) {
    await ask(ctx, payout).catch((error: unknown) => failures.push(error));
  }
  for (const release of owed) {
    try {
      if (await send(ctx, release)) sent += 1;
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `${failures.length} Payouts did not go`);
  }
  return { ran: true as const, sent, floatShort };
}

/** The instant a South African time of day ("10:00") falls on a day. */
function runTimeOn(day: string, time: string): Date {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error(`The Payout run time "${time}" is not a time of day like 10:00`);
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return new Date(saDayStart(day).getTime() + minutes * 60_000);
}

async function ranOn(ctx: Context, day: string) {
  const [run] = await ctx.db
    .select({ day: payoutRuns.day })
    .from(payoutRuns)
    .where(eq(payoutRuns.day, day));
  return !!run;
}

/** The latest run's float check, if any run has gone. */
export async function latestRun(ctx: Context) {
  const [run] = await ctx.db.select().from(payoutRuns).orderBy(desc(payoutRuns.day)).limit(1);
  return run ?? null;
}

/** What the Payouts sent and not yet paid come to. */
export async function unpaidCents(ctx: Context): Promise<number> {
  const [row] = await ctx.db
    .select({ cents: sql<number>`coalesce(sum(${payouts.amountCents}), 0)` })
    .from(payouts)
    .where(inArray(payouts.state, UNPAID_STATES));
  return row?.cents ?? 0;
}

/**
 * Every Release owed with no Payout yet, to an Artisan whose Payouts are not
 * held and who has a current Payout account, oldest first, with that account.
 */
async function releasesToSend(ctx: Context) {
  const rows = await ctx.db
    .select({
      owedEntryId: ledgerEntries.id,
      amountCents: ledgerEntries.amountCents,
      paymentId: ledgerEntries.paymentId,
      engagementId: engagements.id,
      artisanId: engagements.artisanId,
    })
    .from(ledgerEntries)
    .innerJoin(engagements, eq(engagements.id, ledgerEntries.engagementId))
    .innerJoin(accounts, eq(accounts.id, engagements.artisanId))
    .leftJoin(payouts, eq(payouts.owedEntryId, ledgerEntries.id))
    .where(
      and(
        eq(ledgerEntries.kind, LEDGER_KINDS.payoutOwed),
        isNull(payouts.id),
        // Suspension holds nothing by itself; the Admin holds Payouts (#136).
        isNull(accounts.payoutsHeldAt),
      ),
    )
    .orderBy(asc(ledgerEntries.recordedAt), asc(ledgerEntries.id));
  const accountOf = new Map<string, PayoutAccount | null>();
  const toSend = [];
  for (const row of rows) {
    if (!accountOf.has(row.artisanId)) {
      accountOf.set(row.artisanId, await currentPayoutAccount(ctx, row.artisanId));
    }
    const account = accountOf.get(row.artisanId);
    if (account) toSend.push({ ...row, account });
  }
  return toSend;
}

type Release = Awaited<ReturnType<typeof releasesToSend>>[number];

/**
 * Creates the Payout of one Release owed, with its ledger row, then asks the
 * adapter to send it. False if another run created it first, or the Admin
 * held the Artisan's Payouts since they were read.
 */
async function send(ctx: Context, release: Release): Promise<boolean> {
  if (!release.paymentId) throw new Error(`Release ${release.owedEntryId} has no Payment`);
  const payout = {
    id: ctx.newId(),
    owedEntryId: release.owedEntryId,
    artisanId: release.artisanId,
    engagementId: release.engagementId,
    payoutAccountId: release.account.id,
    amountCents: release.amountCents,
    state: "created" as const,
    refusedFor: null,
    createdAt: ctx.now(),
    pausedAt: null,
    paidAt: null,
  };
  try {
    // Written before the adapter is asked, so its events always find it.
    await ctx.commit([
      insertWhile(ctx, payouts, payout, notHeld(ctx, release.artisanId)),
      ...ledgerWrites(
        ctx,
        [
          {
            kind: LEDGER_KINDS.payoutCreated,
            amountCents: payout.amountCents,
            paymentId: release.paymentId,
            engagementId: release.engagementId,
          },
        ],
        exists(
          ctx.db
            .select({ one: sql`1` })
            .from(payouts)
            .where(eq(payouts.id, payout.id)),
        ),
      ),
    ]);
  } catch (error) {
    if (causedBy(error, "UNIQUE constraint failed: payouts.owed_entry_id")) return false;
    throw error;
  }
  const [written] = await ctx.db
    .select({ id: payouts.id })
    .from(payouts)
    .where(eq(payouts.id, payout.id));
  if (!written) return false;
  await ask(ctx, { ...payout, account: release.account });
  return true;
}

/**
 * The Payouts created but never answered by the adapter, with the account
 * each goes to, while their Artisan's Payouts are not held and that account
 * is still current. One whose account stopped being current waits; what
 * becomes of it comes with #129.
 */
async function unanswered(ctx: Context) {
  const rows = await ctx.db
    .select({ payout: payouts, account: verificationChecks })
    .from(payouts)
    .innerJoin(verificationChecks, eq(verificationChecks.id, payouts.payoutAccountId))
    .innerJoin(accounts, eq(accounts.id, payouts.artisanId))
    .where(and(eq(payouts.state, "created"), isNull(accounts.payoutsHeldAt)))
    .orderBy(asc(payouts.createdAt), asc(payouts.id));
  const asked = [];
  for (const row of rows) {
    const current = await currentPayoutAccount(ctx, row.payout.artisanId);
    if (current?.id === row.account.id) asked.push({ ...row.payout, account: row.account });
  }
  return asked;
}

/** The SQL that is true while the Artisan's Payouts are not held. */
function notHeld(ctx: Context, artisanId: string) {
  return exists(
    ctx.db
      .select({ one: sql`1` })
      .from(accounts)
      .where(and(eq(accounts.id, artisanId), isNull(accounts.payoutsHeldAt))),
  );
}

/**
 * Asks the adapter to send a Payout. Our id is the idempotency key, so asking
 * again is harmless. A bank that refuses it at once leaves it refused; what
 * becomes of a refused Payout's money comes with #129.
 */
async function ask(
  ctx: Context,
  payout: { id: string; amountCents: number; account: PayoutAccount },
) {
  const { accountHolder, accountNumber, branchCode } = payout.account.details;
  if (!accountHolder || !accountNumber || !branchCode) {
    throw new Error(`Payout account ${payout.account.id} has no bank details`);
  }
  const answer = await ctx.ports.payments.createPayout({
    id: payout.id,
    amountCents: payout.amountCents,
    bankAccount: { accountHolder, accountNumber, branchCode },
    beneficiaryReference: payoutReference(payout.id),
  });
  // Only from created: its event may have arrived first.
  await ctx.db
    .update(payouts)
    .set(
      answer.state === "refused"
        ? { state: "refused", refusedFor: answer.reason }
        : { state: "pending" },
    )
    .where(and(eq(payouts.id, payout.id), eq(payouts.state, "created")));
}

/** On the Artisan's bank statement: our id, shortened to at most 20 characters. */
export function payoutReference(payoutId: string): string {
  return `AC ${payoutId.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
}

/** The emails telling every Admin the float cannot cover the run. */
async function floatShortEmails(ctx: Context, floatCents: number, neededCents: number) {
  const current = await ctx.db
    .select({ email: admins.email })
    .from(admins)
    .where(isNull(admins.removedAt));
  return current.map(({ email }) =>
    emailAddress(ctx, email, {
      event: "payouts.float-short",
      title: "The float cannot cover today's Payouts",
      link: "/admin",
      body: [
        `The float holds ${formatRands(floatCents)}, and today's Payouts need ${formatRands(neededCents)}.`,
        "The Payouts were sent all the same. The provider pauses what it cannot pay until the float is topped up; nobody is told meanwhile.",
        "The Admin home shows a banner until the float can cover them.",
      ].join("\n\n"),
    }),
  );
}
