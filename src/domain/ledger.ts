import { eq, sql } from "drizzle-orm";
import type { Context, Write } from "./context";
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
} as const;

type LedgerKind = (typeof LEDGER_KINDS)[keyof typeof LEDGER_KINDS];

/** One row of an event. A zero amount is left out: nothing moved. */
export type LedgerRow = {
  kind: LedgerKind;
  amountCents: number;
  paymentId: string;
  engagementId: string | null;
};

/** The writes of one event's ledger rows, sharing its id. */
export function ledgerWrites(ctx: Context, rows: LedgerRow[]): Write[] {
  const eventId = ctx.newId();
  const recordedAt = ctx.now();
  return rows
    .filter((row) => row.amountCents !== 0)
    .map((row) =>
      ctx.db.insert(ledgerEntries).values({ id: ctx.newId(), eventId, recordedAt, ...row }),
    );
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
  // Releases and Refunds come with their tickets (#127, #132).
  const labour = { paidInCents: sum(LEDGER_KINDS.labourIn), releasedCents: 0, refundedCents: 0 };
  const materials = {
    paidInCents: sum(LEDGER_KINDS.materialsIn),
    releasedCents: 0,
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
