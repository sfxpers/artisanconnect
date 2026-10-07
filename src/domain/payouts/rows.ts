import { eq } from "drizzle-orm";
import type { Context } from "../context";
import { accounts, engagements, jobs, ledgerEntries, payouts, verificationChecks } from "../schema";

// What the daily run, a Payout's events, and the Payouts views share.

/** The Payouts not yet paid or stopped: the float must still cover them. */
export const UNPAID_STATES = ["created", "pending", "paused"] as const;

/** On the Artisan's bank statement: our id, shortened to at most 20 characters. */
export function payoutReference(payoutId: string): string {
  return `AC ${payoutId.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
}

/**
 * The Payout with what its Receipt names: the Job, the Artisan, the Release
 * it pays, and the Payout account; null if there is none.
 */
export async function payoutRow(ctx: Context, payoutId: string) {
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

export type PayoutRow = NonNullable<Awaited<ReturnType<typeof payoutRow>>>;

/** The account a Payout went to, as its Receipt names it: "Capitec account ending 7890". */
export function accountName(bankAccount: PayoutRow["bankAccount"]): string {
  return `${bankAccount.bank} account ending ${bankAccount.accountNumber?.slice(-4)}`;
}
