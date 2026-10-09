import {
  and,
  count,
  countDistinct,
  eq,
  gte,
  inArray,
  isNotNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { Actor } from "../actor";
import { LEDGER_KINDS, type LedgerKind } from "../ledger";
import {
  disputes,
  engagements,
  jobs,
  ledgerEntries,
  quotes,
  refusedSends,
  suspensions,
  warnings,
} from "../schema";
import { defineSection } from "../section";
import { DEFAULT_FIGURE_PERIOD, FIGURE_PERIODS, periodDays, type FigurePeriod } from "./periods";

// The Admin's figures (#142): how the marketplace is doing over a period,
// with no targets. Jobs and Hires are counted by when they were posted and
// Hired, and what became of them since; money, Leaving, and refused sends by
// when they happened.

const DAY_MS = 24 * 60 * 60 * 1000;

/** The ledger rows each money figure adds up. */
const MONEY = {
  paymentValue: [LEDGER_KINDS.labourIn, LEDGER_KINDS.materialsIn, LEDGER_KINDS.protectionFeeIn],
  protectionFees: [LEDGER_KINDS.protectionFeeIn],
  artisanFees: [LEDGER_KINDS.artisanFee],
  refunded: [LEDGER_KINDS.labourRefunded, LEDGER_KINDS.materialsRefunded],
  chargedBack: [LEDGER_KINDS.chargebackReversed],
} satisfies Record<string, LedgerKind[]>;

/** A count of how many of a whole, for a rate the page shows as a share. */
export type Share = { count: number; of: number };

export const figuresSection = defineSection({
  name: "figures",
  api: (ctx) => ({
    /** The figures over the last so many days, or all time. Only the Admin reads them. */
    async read(viewer: Actor, input: { period?: FigurePeriod } = {}) {
      if (viewer.kind !== "admin") return null;
      const period = FIGURE_PERIODS.includes(input.period as FigurePeriod)
        ? input.period!
        : DEFAULT_FIGURE_PERIOD;
      const days = periodDays(period);
      const since = days === null ? null : new Date(ctx.now().getTime() - days * DAY_MS);
      const from = (column: SQLiteColumn): SQL | undefined =>
        since ? gte(column, since) : undefined;

      const [posted, hired, money, leavingWarnings, leavingSuspensions, refused] =
        await Promise.all([
          // A Quote that was ever Sent: Held and never released, it never was.
          ctx.db
            .select({ posted: countDistinct(jobs.id), quoted: countDistinct(quotes.jobId) })
            .from(jobs)
            .leftJoin(quotes, and(eq(quotes.jobId, jobs.id), isNotNull(quotes.sentAt)))
            .where(and(isNotNull(jobs.postedAt), from(jobs.postedAt))),
          ctx.db
            .select({
              count: count(),
              // A repeat Hire's Client Relationship had a Completed Engagement: the lower Artisan Fee.
              repeat: sql<number>`coalesce(sum(${engagements.artisanFeePercent} = 5), 0)`,
              completed: sql<number>`coalesce(sum(${engagements.state} = 'completed'), 0)`,
              // A party's Cancellation; one a Chargeback decision made has nobody (#137).
              cancelledByClient: sql<number>`coalesce(sum(${engagements.cancelledBy} = 'client'), 0)`,
              cancelledByArtisan: sql<number>`coalesce(sum(${engagements.cancelledBy} = 'artisan'), 0)`,
              ended: sql<number>`coalesce(sum(${engagements.state} in ('completed', 'cancelled')), 0)`,
              disputed: countDistinct(disputes.engagementId),
            })
            .from(engagements)
            .leftJoin(disputes, eq(disputes.engagementId, engagements.id))
            .where(from(engagements.hiredAt)),
          // Money of Engagements only, as a Payment that Hired nobody was
          // refunded whole; but what the bank sent back, of any Payment.
          ctx.db
            .select({
              kind: ledgerEntries.kind,
              cents: sql<number>`sum(${ledgerEntries.amountCents})`,
            })
            .from(ledgerEntries)
            .where(
              and(
                inArray(ledgerEntries.kind, [...new Set(Object.values(MONEY).flat())]),
                or(
                  isNotNull(ledgerEntries.engagementId),
                  eq(ledgerEntries.kind, LEDGER_KINDS.chargebackReversed),
                ),
                from(ledgerEntries.recordedAt),
              ),
            )
            .groupBy(ledgerEntries.kind),
          ctx.db
            .select({ count: count() })
            .from(warnings)
            .where(and(eq(warnings.leaving, true), from(warnings.warnedAt))),
          ctx.db
            .select({ count: count() })
            .from(suspensions)
            .where(and(eq(suspensions.leaving, true), from(suspensions.suspendedAt))),
          ctx.db.select({ count: count() }).from(refusedSends).where(from(refusedSends.refusedAt)),
        ]);

      const cents = (kinds: readonly LedgerKind[]) =>
        money
          .filter((row) => kinds.includes(row.kind as LedgerKind))
          .reduce((sum, row) => sum + Number(row.cents), 0);
      const hires = hired[0]!;
      const of = hires.count;
      return {
        period,
        since,
        jobsPosted: posted[0]!.posted,
        jobsWithQuote: { count: posted[0]!.quoted, of: posted[0]!.posted } satisfies Share,
        hires: of,
        paymentValueCents: cents(MONEY.paymentValue),
        protectionFeesCents: cents(MONEY.protectionFees),
        artisanFeesCents: cents(MONEY.artisanFees),
        refundedCents: cents(MONEY.refunded),
        chargedBackCents: cents(MONEY.chargedBack),
        repeatHireRate: { count: Number(hires.repeat), of } satisfies Share,
        completedRate: { count: Number(hires.completed), of } satisfies Share,
        cancellationRate: {
          count: Number(hires.cancelledByClient) + Number(hires.cancelledByArtisan),
          of,
          byClient: Number(hires.cancelledByClient),
          byArtisan: Number(hires.cancelledByArtisan),
        },
        disputeRate: { count: hires.disputed, of } satisfies Share,
        /** Hires in the period neither Completed nor Cancelled yet. */
        inProgress: of - Number(hires.ended),
        leavingWarnings: leavingWarnings[0]!.count,
        leavingSuspensions: leavingSuspensions[0]!.count,
        refusedSends: refused[0]!.count,
      };
    },
  }),
});
