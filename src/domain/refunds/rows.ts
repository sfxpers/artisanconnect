import { and, eq, exists, sql } from "drizzle-orm";
import type { Context } from "../context";
import { formatRands } from "../money";
import { bankReference } from "../references";
import { formatDay, saDay } from "../sa-days";
import { accounts, jobs, payments, refunds } from "../schema";

// Reading a Refund, and the Receipt its Client gets once it is paid.

export type RefundRow = NonNullable<Awaited<ReturnType<typeof refundRow>>>;

/** The states of a Refund the bank has not yet answered for good. */
export const UNSETTLED_STATES = ["waiting", "sent", "paused"] as const;

/** The Refund by our id, with its Job and its Client's name; null if there is none. */
export async function refundRow(ctx: Context, refundId: string) {
  const [row] = await ctx.db
    .select({
      refund: refunds,
      jobId: jobs.id,
      jobTitle: jobs.title,
      clientName: accounts.name,
      notHiredFor: payments.notHiredFor,
    })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .innerJoin(jobs, eq(jobs.id, payments.jobId))
    .innerJoin(accounts, eq(accounts.id, refunds.clientId))
    .where(eq(refunds.id, refundId));
  if (!row) return null;
  const { refund, ...rest } = row;
  return { ...refund, ...rest };
}

/** The SQL that is true while the Refund is in this state since this time. */
export function refundIs(
  ctx: Context,
  refundId: string,
  state: (typeof refunds.$inferSelect)["state"],
  at: { column: "sentAt" | "pausedAt" | "paidAt" | "failedAt"; is: Date },
) {
  return exists(
    ctx.db
      .select({ one: sql`1` })
      .from(refunds)
      .where(
        and(eq(refunds.id, refundId), eq(refunds.state, state), eq(refunds[at.column], at.is)),
      ),
  );
}

/** On the Client's bank statement, and in their Receipt: at most 12 characters. */
export function refundReference(refundId: string) {
  return bankReference(refundId);
}

/**
 * The Client's Receipt for a Refund paid, by the bank or by the Admin's bank
 * transfer: what it refunds of each line and in all. Not a tax invoice.
 */
export function receiptText(refund: RefundRow, paidAt: Date, byHand?: { reference: string }) {
  return [
    "Receipt for your Refund on ArtisanConnect.",
    "",
    `Job: ${refund.jobTitle}`,
    `Refunded on: ${formatDay(saDay(paidAt))}`,
    `Reference: ${refundReference(refund.id)}`,
    ...(byHand ? [`Paid by bank transfer, reference ${byHand.reference}`] : []),
    "",
    ...(refund.cause === "not-hired"
      ? [
          "Your whole Payment, Protection Fee included, as no Hire happened:",
          `Quote: ${formatRands(refund.labourCents + refund.materialsCents)}`,
          `Protection Fee: ${formatRands(refund.protectionFeeCents)}`,
        ]
      : [
          ...(refund.materialsCents > 0
            ? [`Materials refunded: ${formatRands(refund.materialsCents)}`]
            : []),
          ...(refund.labourCents > 0
            ? [`Labour refunded: ${formatRands(refund.labourCents)}`]
            : []),
        ]),
    `Total refunded: ${formatRands(refund.amountCents)}`,
    ...(refund.cause === "not-hired" ? [] : ["The Protection Fee is not refunded."]),
    "",
    "This Receipt is not a tax invoice.",
  ].join("\n");
}
