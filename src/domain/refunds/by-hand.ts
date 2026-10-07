import { and, eq } from "drizzle-orm";
import type { Context, Write } from "../context";
import { LEDGER_KINDS, ledgerWrites } from "../ledger";
import { formatRands } from "../money";
import { ok, refuse } from "../result";
import { refunds } from "../schema";
import { tellWithEmailWhile } from "../tells";
import { receiptText, refundIs, refundRow } from "./rows";

// A failed Refund paid by hand (#132): the Admin pays the Client by bank
// transfer and records it here, from the system Support request the failure
// raised. Apart from the Refunds module so the Support request can reach it.

/** Whether the Refund is still owed and waiting for the Admin's bank transfer. */
export async function owedByHand(ctx: Context, refundId: string) {
  const [row] = await ctx.db
    .select({ state: refunds.state })
    .from(refunds)
    .where(eq(refunds.id, refundId));
  return row?.state === "failed";
}

/**
 * The writes that record a failed Refund paid by the Admin's bank transfer:
 * no longer owed, in the ledger, and the Client told with a Receipt naming
 * the transfer's reference.
 */
export async function paidByHandWrites(ctx: Context, refundId: string, reference: string) {
  const refund = await refundRow(ctx, refundId);
  if (refund?.state !== "failed") {
    return refuse("not-owed", "That Refund is not waiting to be paid by hand.");
  }
  const now = ctx.now();
  const paidNow = refundIs(ctx, refund.id, "paid-by-hand", { column: "paidAt", is: now });
  const writes: Write[] = [
    ctx.db
      .update(refunds)
      .set({ state: "paid-by-hand", paidAt: now })
      .where(and(eq(refunds.id, refund.id), eq(refunds.state, "failed"))),
    ...ledgerWrites(
      ctx,
      [
        {
          kind: LEDGER_KINDS.refundPaidByHand,
          amountCents: refund.amountCents,
          paymentId: refund.paymentId,
          engagementId: refund.engagementId,
        },
      ],
      paidNow,
    ),
    tellWithEmailWhile(
      ctx,
      refund.clientId,
      {
        event: "refund.paid",
        title: `Your Refund of ${formatRands(refund.amountCents)} was paid by bank transfer: ${refund.jobTitle}`,
        link: `/jobs/${refund.jobId}`,
        body: receiptText(refund, now, { reference }),
      },
      paidNow,
    ),
  ];
  return ok(writes);
}
