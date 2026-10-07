import { eq, sql, type SQL } from "drizzle-orm";
import type { Context, Write } from "./context";
import { insertWhile } from "./guarded";
import { artisanFeeCents } from "./money";
import { ledgerEntries } from "./schema";

// The money ledger (ADR 0017): append-only rows, every event's written in its
// one atomic batch, and each balance derived from them, never stored.

/** What a ledger row records. Each later ticket adds the kinds it writes. */
export const LEDGER_KINDS = {
  /** The Hired Quote's Labour, paid in. */
  labourIn: "payment.labour",
  /** The Hired Quote's Materials, paid in. */
  materialsIn: "payment.materials",
  /** The Protection Fee on a Payment, kept whatever happens next (ADR 0008). */
  protectionFeeIn: "payment.protection-fee",
  /** Money owed back to the Client, until the bank takes it. */
  refundOwed: "refund.owed",
  /** The Materials released at Work started, before the Artisan Fee (ADR 0006). */
  materialsReleased: "release.materials",
  /** The Labour released at Approval, before the Artisan Fee (ADR 0006, #130). */
  labourReleased: "release.labour",
  /** The Artisan Fee kept from a Release (ADR 0009). */
  artisanFee: "release.artisan-fee",
  /** A Release less its Artisan Fee, owed to the Artisan until a Payout sends it (#128). */
  payoutOwed: "payout.owed",
  /** A Payout of what a Release owes, sent to the payment adapter by the daily run. */
  payoutCreated: "payout.created",
  /** A Payout the bank paid into the Artisan's Payout account: no longer owed. */
  payoutPaid: "payout.paid",
  /** A Payout the bank refused, at sending or later: its Release is still owed (#129). */
  payoutRefused: "payout.refused",
  /** A paid Payout the bank sent back: owed to the Artisan again (#129). */
  payoutSentBack: "payout.sent-back",
} as const;

export type LedgerKind = (typeof LEDGER_KINDS)[keyof typeof LEDGER_KINDS];

/** The part of the Hired Quote each Release kind releases. */
export const RELEASED_PARTS: Partial<Record<LedgerKind, "materials" | "labour">> = {
  [LEDGER_KINDS.materialsReleased]: "materials",
  [LEDGER_KINDS.labourReleased]: "labour",
};

/** One row of an event. A zero amount is left out: nothing moved. */
export type LedgerRow = {
  kind: LedgerKind;
  amountCents: number;
  paymentId: string;
  engagementId: string | null;
};

/**
 * The writes of one event's ledger rows, sharing its id; with a condition,
 * written only while it holds when the batch runs.
 */
export function ledgerWrites(ctx: Context, rows: LedgerRow[], condition?: SQL): Write[] {
  const eventId = ctx.newId();
  const recordedAt = ctx.now();
  return rows
    .filter((row) => row.amountCents !== 0)
    .map((row) => {
      const entry = { id: ctx.newId(), eventId, recordedAt, ...row };
      return condition
        ? insertWhile(ctx, ledgerEntries, entry, condition)
        : ctx.db.insert(ledgerEntries).values(entry);
    });
}

/**
 * The rows that record a Release: the amount released of one part, the
 * Artisan Fee kept from it, rounded half up to the cent, and the rest owed
 * to the Artisan.
 */
export function releaseRows(
  engagement: { id: string; paymentId: string; artisanFeePercent: number },
  kind: typeof LEDGER_KINDS.materialsReleased | typeof LEDGER_KINDS.labourReleased,
  amountCents: number,
): LedgerRow[] {
  const feeCents = artisanFeeCents(amountCents, engagement.artisanFeePercent);
  const of = (kind: LedgerKind, amountCents: number) => ({
    kind,
    amountCents,
    paymentId: engagement.paymentId,
    engagementId: engagement.id,
  });
  return [
    of(kind, amountCents),
    of(LEDGER_KINDS.artisanFee, feeCents),
    of(LEDGER_KINDS.payoutOwed, amountCents - feeCents),
  ];
}

/** The rows that record a Payment arriving: its Labour, Materials, and Protection Fee. */
export function paymentInRows(
  payment: {
    id: string;
    labourCents: number;
    materialsCents: number;
    protectionFeeCents: number;
  },
  engagementId: string | null,
): LedgerRow[] {
  const of = (kind: LedgerKind, amountCents: number) => ({
    kind,
    amountCents,
    paymentId: payment.id,
    engagementId,
  });
  return [
    of(LEDGER_KINDS.labourIn, payment.labourCents),
    of(LEDGER_KINDS.materialsIn, payment.materialsCents),
    of(LEDGER_KINDS.protectionFeeIn, payment.protectionFeeCents),
  ];
}

/**
 * An Engagement's money, from its ledger rows: what was paid in for the
 * Hired Quote (the Protection Fee apart), released, refunded, and not yet
 * released, each of Labour and Materials too.
 */
export async function engagementMoney(ctx: Context, engagementId: string) {
  const rows = await ctx.db
    .select({ kind: ledgerEntries.kind, cents: sql<number>`sum(${ledgerEntries.amountCents})` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.engagementId, engagementId))
    .groupBy(ledgerEntries.kind);
  const sum = (kind: LedgerKind) => rows.find((row) => row.kind === kind)?.cents ?? 0;
  // Refunds come with their ticket (#132).
  const labour = {
    paidInCents: sum(LEDGER_KINDS.labourIn),
    releasedCents: sum(LEDGER_KINDS.labourReleased),
    refundedCents: 0,
  };
  const materials = {
    paidInCents: sum(LEDGER_KINDS.materialsIn),
    releasedCents: sum(LEDGER_KINDS.materialsReleased),
    refundedCents: 0,
  };
  const paidInCents = labour.paidInCents + materials.paidInCents;
  const releasedCents = labour.releasedCents + materials.releasedCents;
  const refundedCents = labour.refundedCents + materials.refundedCents;
  return {
    labour,
    materials,
    paidInCents,
    releasedCents,
    refundedCents,
    unreleasedCents: paidInCents - releasedCents - refundedCents,
    protectionFeeCents: sum(LEDGER_KINDS.protectionFeeIn),
  };
}
