import { and, asc, eq } from "drizzle-orm";
import { publicName } from "../accounts/names";
import type { Context } from "../context";
import { engagementMoney } from "../ledger";
import { fieldsView } from "../quotes/views";
import { accounts, engagements, payments, quotes } from "../schema";
import type { ServiceCategory } from "../service-categories";
import { badgesOf } from "../verification";
import { answerBy } from "./work-started";

// An Engagement as each party sees it on the Job page (#107): the Client
// never sees the Artisan Fee, and the Artisan never sees the Protection Fee.

/** The Job's Engagement, as its Client sees it; null before Hire. */
export async function engagementAsClient(
  ctx: Context,
  job: { id: string; category: ServiceCategory | null },
) {
  const found = await engagementOf(ctx, job.id);
  if (!found) return null;
  const { engagement, quote } = found;
  const [money, [artisan], badges] = await Promise.all([
    engagementMoney(ctx, engagement.id),
    ctx.db
      .select({
        name: accounts.name,
        tradingName: accounts.tradingName,
        namesShown: accounts.namesShown,
      })
      .from(accounts)
      .where(eq(accounts.id, engagement.artisanId)),
    badgesOf(ctx, engagement.artisanId),
  ]);
  const { protectionFeeCents, ...shared } = money;
  return {
    ...common(found),
    artisan: {
      artisanId: engagement.artisanId,
      // Names the Content check has not passed are nobody else's to see.
      publicName: artisan?.namesShown ? publicName(artisan) : null,
      badges: badges.filter((badge) => badge.category === null || badge.category === job.category),
    },
    money: { ...moneyView(shared), protectionFeeCents },
    quote: { quoteId: quote.id, ...fieldsView(quote) },
  };
}

/** The Job's Engagement, as its Hired Artisan sees it; null for any other Artisan. */
export async function engagementAsArtisan(ctx: Context, jobId: string, artisanId: string) {
  const found = await engagementOf(ctx, jobId);
  if (!found || found.engagement.artisanId !== artisanId) return null;
  const { protectionFeeCents: _, ...money } = await engagementMoney(ctx, found.engagement.id);
  return {
    ...common(found),
    money: { ...moneyView(money), artisanFeePercent: found.engagement.artisanFeePercent },
  };
}

/** The Payments on the Client's Job that arrived but Hired nobody, refunded whole. */
export async function notHiredPayments(ctx: Context, jobId: string) {
  return ctx.db
    .select({
      paymentId: payments.id,
      amountCents: payments.amountCents,
      reason: payments.notHiredFor,
      at: payments.settledAt,
    })
    .from(payments)
    .where(and(eq(payments.jobId, jobId), eq(payments.state, "not-hired")))
    .orderBy(asc(payments.settledAt));
}

async function engagementOf(ctx: Context, jobId: string) {
  const [row] = await ctx.db
    .select({ engagement: engagements, quote: quotes })
    .from(engagements)
    .innerJoin(quotes, eq(quotes.id, engagements.quoteId))
    .where(eq(engagements.jobId, jobId));
  return row ?? null;
}

type Found = NonNullable<Awaited<ReturnType<typeof engagementOf>>>;
type Money = Omit<Awaited<ReturnType<typeof engagementMoney>>, "protectionFeeCents">;

/**
 * What both parties see alike: its state, the Hired Quote's dates, the
 * Artisan's claim to have started while it waits for the Client, and its Activity.
 */
function common({ engagement, quote }: Found) {
  const { startClaimedAt, workStartedAt } = engagement;
  return {
    engagementId: engagement.id,
    state: engagement.state,
    hiredAt: engagement.hiredAt,
    startOn: quote.startOn,
    durationDays: quote.durationDays,
    warranty: quote.warranty,
    startClaim:
      engagement.state === "paid" && startClaimedAt
        ? { claimedAt: startClaimedAt, answerBy: answerBy(startClaimedAt) }
        : null,
    workStartedAt,
    /** What happened, oldest first. Each later step adds its own. */
    activity: [
      { event: "quote.sent" as const, at: quote.sentAt! },
      { event: "hired" as const, at: engagement.hiredAt },
      ...(workStartedAt ? [{ event: "work.started" as const, at: workStartedAt }] : []),
    ],
  };
}

/**
 * The money of the Hired Quote: paid in, released, not yet released, and
 * refunded, and its two numbered payments, the Materials released at Work
 * started and the Labour at Approval.
 */
function moneyView({ labour, materials, ...totals }: Money) {
  const part = (of: typeof labour) => ({
    amountCents: of.paidInCents,
    state:
      of.paidInCents > 0 && of.refundedCents === of.paidInCents
        ? ("refunded" as const)
        : of.paidInCents > 0 && of.releasedCents + of.refundedCents === of.paidInCents
          ? ("released" as const)
          : ("unreleased" as const),
  });
  return {
    ...totals,
    payments: [
      { part: "materials" as const, ...part(materials) },
      { part: "labour" as const, ...part(labour) },
    ],
  };
}
