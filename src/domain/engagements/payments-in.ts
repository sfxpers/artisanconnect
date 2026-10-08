import { eq } from "drizzle-orm";
import { system } from "../actor";
import type { Context, Write } from "../context";
import { ledgerWrites, LEDGER_KINDS, paymentInRows } from "../ledger";
import type { PaymentMethod } from "../ports";
import { notHiredRefundWrite, sendRefunds } from "../refunds";
import { bankReference, shortId } from "../references";
import { payments, type NOT_HIRED_REASONS } from "../schema";
import { emailTells, tell } from "../tells";

// What a Hire's Payment (#126) and an Updated Quote's (#134) share: the
// checkout, and a Payment that arrives once what it paid for can no longer
// happen, which is refunded whole, Protection Fee included.

export type PaymentRow = typeof payments.$inferSelect;
export type NotHiredReason = (typeof NOT_HIRED_REASONS)[number];

/** Card, or Instant EFT. */
const METHODS: PaymentMethod[] = ["card", "pay_by_bank"];

/** Why a Payment is refunded whole, as its Client is told. */
const NOT_HIRED_TITLES: Record<NotHiredReason, string> = {
  "quote-ended": "Your Payment will be refunded, as no Hire happened",
  "quote-changed": "Your Payment will be refunded, as no Hire happened",
  "not-verified": "Your Payment will be refunded, as no Hire happened",
  "updated-quote-ended":
    "Your Payment will be refunded in full, as the Updated Quote was no longer proposed",
};

/**
 * Opens the payment adapter's checkout for a Payment just written, which
 * returns to its Job's page: the checkout's URL. Our id is its reference.
 */
export async function openCollection(
  ctx: Context,
  payment: { id: string; jobId: string; amountCents: number },
) {
  const { checkoutUrl } = await ctx.ports.payments.createCollection({
    id: payment.id,
    amountCents: payment.amountCents,
    methods: METHODS,
    payerReference: bankReference(payment.id),
    beneficiaryReference: `ArtisanConnect ${shortId(payment.id)}`.slice(0, 20),
    returnUrl: new URL(`/jobs/${payment.jobId}`, ctx.config.appUrl).href,
  });
  return checkoutUrl;
}

/** The Payment by our id; null if there is none. */
export async function paymentRow(ctx: Context, paymentId: string) {
  const [row] = await ctx.db.select().from(payments).where(eq(payments.id, paymentId));
  return row ?? null;
}

/**
 * The writes of a Payment that arrived but pays for nothing now: it and its
 * Protection Fee in the ledger, owed back whole, and the Client told why.
 * The Refund itself is asked of the adapter once they are written.
 */
export function notHiredWrites(
  ctx: Context,
  payment: PaymentRow,
  job: { id: string; title: string },
  reason: NotHiredReason,
): Write[] {
  const refundId = ctx.newId();
  return [
    // Unguarded on purpose: on a Payment no longer open or failed a trigger aborts the batch.
    ctx.db
      .update(payments)
      .set({ state: "not-hired", notHiredFor: reason, refundId, settledAt: ctx.now() })
      .where(eq(payments.id, payment.id)),
    notHiredRefundWrite(ctx, refundId, payment),
    ...ledgerWrites(ctx, [
      ...paymentInRows(payment, null),
      {
        kind: LEDGER_KINDS.refundOwed,
        amountCents: payment.amountCents,
        paymentId: payment.id,
        engagementId: null,
      },
    ]),
    ...tell(ctx, system, [payment.clientId], {
      event: "payment.not-hired",
      title: `${NOT_HIRED_TITLES[reason]}: ${job.title}`,
      link: `/jobs/${job.id}`,
    }),
  ];
}

/**
 * Sends the Refund of a Payment refunded whole if the adapter does not have
 * it yet: a repeated event sends it if the first send never reached the
 * adapter. Its events are a Refund's as any other (#132).
 */
export async function refundWhole(ctx: Context, payment: PaymentRow) {
  await sendRefunds(ctx, payment.id);
  await emailTells(ctx).catch((error: unknown) => {
    console.error("Tell emails did not go", error);
  });
}
