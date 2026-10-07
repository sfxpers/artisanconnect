import { and, asc, desc, eq, exists, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Actor } from "../actor";
import { audit } from "../audit";
import type { Context } from "../context";
import { LEDGER_KINDS, RELEASED_PARTS, type LedgerKind } from "../ledger";
import { adminOnly, ok, refuse } from "../result";
import { accounts, authUsers, engagements, jobs, ledgerEntries, payouts } from "../schema";
import { defineSection } from "../section";
import { emailTells, tellWhile } from "../tells";
import { currentPayoutAccount } from "../verification";
import { payoutClocks } from "./events";
import { latestRun, payoutReference, unpaidCents } from "./run";

// Payouts (#128): money sent to the Artisan's Payout account after a
// Release, in the next daily run. The Artisan follows each Release to its
// Payout; the Admin sees each Artisan's unpaid total, may hold an Artisan's
// Payouts, and is shown a banner while the float cannot cover them.

/** Why a Release owed has no Payout yet. */
type WaitingFor = "next-run" | "hold" | "payout-account";

export const payoutsSection = defineSection({
  name: "payouts",
  clocks: payoutClocks,
  api: (ctx) => ({
    /**
     * The Artisan's Payouts view: each Release, newest first, with its
     * Artisan Fee, the amount paid for it, and where its Payout stands; what
     * is still unpaid and what was paid; and whether the Admin holds them.
     */
    async mine(viewer: Actor) {
      if (viewer.kind !== "artisan") return null;
      const artisanId = viewer.accountId;
      const [artisan] = await ctx.db
        .select({ payoutsHeldAt: accounts.payoutsHeldAt })
        .from(accounts)
        .where(eq(accounts.id, artisanId));
      const held = !!artisan?.payoutsHeldAt;
      const releases = await releasesOf(ctx, artisanId);
      const waitingFor: WaitingFor = held
        ? "hold"
        : (await currentPayoutAccount(ctx, artisanId))
          ? "next-run"
          : "payout-account";
      const paidCents = releases.reduce(
        (sum, release) => sum + (release.payout?.state === "paid" ? release.amountCents : 0),
        0,
      );
      const owedCents = releases.reduce((sum, release) => sum + release.amountCents, 0);
      return {
        held,
        unpaidCents: owedCents - paidCents,
        paidCents,
        releases: releases.map(({ payout, ...release }) => ({
          ...release,
          state: stateOf(payout),
          waitingFor: payout ? null : waitingFor,
          reference: payout ? payoutReference(payout.id) : null,
          paidAt: payout?.paidAt ?? null,
        })),
      };
    },

    /**
     * Each Artisan still owed money, or whose Payouts are held, with what is
     * unpaid: the most owed first.
     */
    async unpaid(viewer: Actor) {
      if (viewer.kind !== "admin") return null;
      const unpaid = sql<number>`coalesce(sum(case ${ledgerEntries.kind} when ${LEDGER_KINDS.payoutOwed} then ${ledgerEntries.amountCents} when ${LEDGER_KINDS.payoutPaid} then -${ledgerEntries.amountCents} else 0 end), 0)`;
      const rows = await ctx.db
        .select({
          artisanId: accounts.id,
          name: accounts.name,
          email: authUsers.email,
          unpaidCents: unpaid,
          heldAt: accounts.payoutsHeldAt,
        })
        .from(accounts)
        .innerJoin(authUsers, eq(authUsers.id, accounts.id))
        .leftJoin(engagements, eq(engagements.artisanId, accounts.id))
        .leftJoin(
          ledgerEntries,
          and(
            eq(ledgerEntries.engagementId, engagements.id),
            inArray(ledgerEntries.kind, [LEDGER_KINDS.payoutOwed, LEDGER_KINDS.payoutPaid]),
          ),
        )
        .where(eq(accounts.kind, "artisan"))
        .groupBy(accounts.id)
        .having(or(sql`${unpaid} > 0`, isNotNull(accounts.payoutsHeldAt)))
        .orderBy(desc(unpaid), asc(accounts.name), asc(accounts.id));
      return rows.map(({ heldAt, ...row }) => ({ ...row, held: !!heldAt }));
    },

    /**
     * The Admin home's banner: shown from a run whose float check found the
     * float could not cover it, until the float can cover every Payout sent
     * and not yet paid.
     */
    async float(viewer: Actor) {
      if (viewer.kind !== "admin") return null;
      const run = await latestRun(ctx);
      if (!run || run.floatCents >= run.neededCents) return { short: false as const };
      const neededCents = await unpaidCents(ctx);
      const floatCents = await ctx.ports.payments
        .getFloatBalance()
        .then(({ cents }) => cents)
        // If the provider cannot say, the banner stays: the Admin must look.
        .catch(() => run.floatCents);
      if (floatCents >= neededCents) return { short: false as const };
      return { short: true as const, floatCents, neededCents, checkedAt: run.ranAt };
    },

    /** The Admin holds an Artisan's Payouts: they wait until the hold is lifted. */
    async hold(actor: Actor, input: { artisanId: string }) {
      if (actor.kind !== "admin") return adminOnly();
      const artisan = await artisanRow(ctx, input.artisanId);
      if (!artisan) return refuse("not-found", "That Artisan does not exist.");
      if (artisan.payoutsHeldAt) {
        return refuse("already-held", "This Artisan's Payouts are already held.");
      }
      const now = ctx.now();
      await ctx.commit([
        ctx.db
          .update(accounts)
          .set({ payoutsHeldAt: now })
          .where(and(eq(accounts.id, artisan.id), isNull(accounts.payoutsHeldAt))),
        audit(
          ctx,
          actor,
          {
            action: "payouts.held",
            summary: `Held the Payouts of ${artisan.name}`,
            subjectId: artisan.id,
          },
          heldSince(ctx, artisan.id, now),
        ),
        ...tellWhile(
          ctx,
          actor,
          [artisan.id],
          { event: "payouts.held", title: "Your Payouts are held by the Admin", link: "/payouts" },
          heldSince(ctx, artisan.id, now),
        ),
      ]);
      await emailTells(ctx).catch((error: unknown) => {
        console.error("Tell emails did not go", error);
      });
      return ok({});
    },

    /** The Admin lifts a Payout hold: the Artisan's Payouts go in the next daily run. */
    async lift(actor: Actor, input: { artisanId: string }) {
      if (actor.kind !== "admin") return adminOnly();
      const artisan = await artisanRow(ctx, input.artisanId);
      if (!artisan) return refuse("not-found", "That Artisan does not exist.");
      if (!artisan.payoutsHeldAt) return refuse("not-held", "This Artisan's Payouts are not held.");
      await ctx.commit([
        ctx.db
          .update(accounts)
          .set({ payoutsHeldAt: null })
          .where(
            and(eq(accounts.id, artisan.id), eq(accounts.payoutsHeldAt, artisan.payoutsHeldAt)),
          ),
        audit(
          ctx,
          actor,
          {
            action: "payouts.hold-lifted",
            summary: `Lifted the Payout hold on ${artisan.name}`,
            subjectId: artisan.id,
          },
          heldSince(ctx, artisan.id, null),
        ),
        ...tellWhile(
          ctx,
          actor,
          [artisan.id],
          {
            event: "payouts.hold-lifted",
            title: "Your Payouts are no longer held",
            link: "/payouts",
          },
          heldSince(ctx, artisan.id, null),
        ),
      ]);
      await emailTells(ctx).catch((error: unknown) => {
        console.error("Tell emails did not go", error);
      });
      return ok({});
    },
  }),
});

/**
 * Each Release owed to the Artisan, newest first: the Job, the part
 * released, the Artisan Fee kept, what it owes, and its Payout if it has one.
 */
async function releasesOf(ctx: Context, artisanId: string) {
  const owed = await ctx.db
    .select({
      releaseId: ledgerEntries.eventId,
      jobId: jobs.id,
      jobTitle: jobs.title,
      releasedAt: ledgerEntries.recordedAt,
      amountCents: ledgerEntries.amountCents,
      payout: payouts,
    })
    .from(ledgerEntries)
    .innerJoin(engagements, eq(engagements.id, ledgerEntries.engagementId))
    .innerJoin(jobs, eq(jobs.id, engagements.jobId))
    .leftJoin(payouts, eq(payouts.owedEntryId, ledgerEntries.id))
    .where(
      and(eq(ledgerEntries.kind, LEDGER_KINDS.payoutOwed), eq(engagements.artisanId, artisanId)),
    )
    .orderBy(desc(ledgerEntries.recordedAt), desc(ledgerEntries.id));
  // The rest of each Release's event: the part released and the Artisan Fee.
  const parts = owed.length
    ? await ctx.db
        .select({
          eventId: ledgerEntries.eventId,
          kind: ledgerEntries.kind,
          amountCents: ledgerEntries.amountCents,
        })
        .from(ledgerEntries)
        .where(
          and(
            inArray(
              ledgerEntries.eventId,
              owed.map((release) => release.releaseId),
            ),
            inArray(ledgerEntries.kind, [...RELEASED_KINDS, LEDGER_KINDS.artisanFee]),
          ),
        )
    : [];
  return owed.map((release) => {
    const of = parts.filter((part) => part.eventId === release.releaseId);
    const released = of.find((part) => part.kind !== LEDGER_KINDS.artisanFee);
    return {
      releaseId: release.releaseId,
      jobId: release.jobId,
      jobTitle: release.jobTitle,
      part: released ? RELEASED_PARTS[released.kind as LedgerKind]! : ("materials" as const),
      releasedAt: release.releasedAt,
      releasedCents: released?.amountCents ?? 0,
      artisanFeeCents: of.find((part) => part.kind === LEDGER_KINDS.artisanFee)?.amountCents ?? 0,
      amountCents: release.amountCents,
      payout: release.payout,
    };
  });
}

const RELEASED_KINDS = Object.keys(RELEASED_PARTS);

type PayoutRow = typeof payouts.$inferSelect;

/**
 * Where a Release's Payout stands for the Artisan: waiting for one, sent (a
 * paused one too, as nobody is told of a pause), paid, or refused.
 */
function stateOf(payout: PayoutRow | null) {
  if (!payout) return "waiting" as const;
  if (payout.state === "paid") return "paid" as const;
  if (payout.state === "refused") return "refused" as const;
  return "sent" as const;
}

async function artisanRow(ctx: Context, artisanId: string) {
  const [row] = await ctx.db
    .select({ id: accounts.id, name: accounts.name, payoutsHeldAt: accounts.payoutsHeldAt })
    .from(accounts)
    .where(and(eq(accounts.id, artisanId), eq(accounts.kind, "artisan")));
  return row ?? null;
}

/** The SQL that is true while the Artisan's Payouts are held since this time, or not held. */
function heldSince(ctx: Context, artisanId: string, heldAt: Date | null) {
  return exists(
    ctx.db
      .select({ one: sql`1` })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, artisanId),
          heldAt ? eq(accounts.payoutsHeldAt, heldAt) : isNull(accounts.payoutsHeldAt),
        ),
      ),
  );
}
