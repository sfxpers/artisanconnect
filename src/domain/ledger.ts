import { eq, sql, type SQL } from "drizzle-orm";
import type { Context, Write } from "./context";
import { causedBy } from "./errors";
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
  /** Unreleased Labour refunded to the Client, never with an Artisan Fee (#132). */
  labourRefunded: "refund.labour",
  /** Unreleased Materials refunded to the Client, never with an Artisan Fee (#132). */
  materialsRefunded: "refund.materials",
  /** A Refund the payment adapter took, to send to the Client's bank. */
  refundSent: "refund.sent",
  /** A Refund the bank paid to the Client: no longer owed. */
  refundPaid: "refund.paid",
  /** A Refund the bank could not take: still owed, until the Admin pays it by hand. */
  refundFailed: "refund.failed",
  /** A failed Refund the Admin paid by bank transfer: no longer owed. */
  refundPaidByHand: "refund.paid-by-hand",
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
 * Commits an event whose Release or Refund was worked out from the money
 * unreleased, working it out again if another Release or Refund took that
 * money meanwhile: the ledger then aborts the batch rather than overdraw.
 */
export async function commitFromUnreleased(ctx: Context, writes: () => Promise<Write[]>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await ctx.commit(await writes());
    } catch (error) {
      if (!isOverdrawn(error)) throw error;
    }
  }
  throw new Error("The money unreleased kept changing while it was released or refunded");
}

/** Whether a batch aborted as it would take more of a line than is unreleased. */
export function isOverdrawn(error: unknown) {
  return causedBy(error, "more than is unreleased");
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
  const part = (inKind: LedgerKind, releasedKind: LedgerKind, refundedKind: LedgerKind) => {
    const [paidInCents, releasedCents, refundedCents] = [inKind, releasedKind, refundedKind].map(
      sum,
    );
    // What a Release or a Refund of it may take now.
    return {
      paidInCents,
      releasedCents,
      refundedCents,
      unreleasedCents: paidInCents - releasedCents - refundedCents,
    };
  };
  const labour = part(
    LEDGER_KINDS.labourIn,
    LEDGER_KINDS.labourReleased,
    LEDGER_KINDS.labourRefunded,
  );
  const materials = part(
    LEDGER_KINDS.materialsIn,
    LEDGER_KINDS.materialsReleased,
    LEDGER_KINDS.materialsRefunded,
  );
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
