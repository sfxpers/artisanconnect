import { and, desc, eq, min } from "drizzle-orm";
import type { Context } from "../context";
import { accounts, engagements } from "../schema";
import { DAY_MS } from "../sa-days";

// The Protected Relationship Period (#139, ADR 0014): the 365 days after the
// first Payment in a Client Relationship, during which all work between the
// pair belongs on the platform. A later Payment does not extend it, and
// nothing ends or pauses it. Both parties see when it ends on each of their
// Engagements; the Admin sees it for every Client Relationship.

const PROTECTED_RELATIONSHIP_DAYS = 365;

function protectedUntilAfter(firstPaymentAt: Date) {
  return new Date(firstPaymentAt.getTime() + PROTECTED_RELATIONSHIP_DAYS * DAY_MS);
}

/** When the Protected Relationship Period of a Client and an Artisan who have Hired ends. */
export async function protectedUntil(ctx: Context, clientId: string, artisanId: string) {
  // An Engagement is Hired when its Payment arrives, so the first Hire is the first Payment.
  const [row] = await ctx.db
    .select({ firstPaymentAt: min(engagements.hiredAt) })
    .from(engagements)
    .where(and(eq(engagements.clientId, clientId), eq(engagements.artisanId, artisanId)));
  return protectedUntilAfter(row!.firstPaymentAt!);
}

/**
 * The Client Relationships of a Client or an Artisan, each with the other
 * party, its first Payment, and its Protected Relationship Period: when it
 * ends, and whether it is running now. The newest first.
 */
export async function clientRelationshipsOf(
  ctx: Context,
  account: { accountId: string; kind: "client" | "artisan" },
) {
  const [mine, theirs] =
    account.kind === "client"
      ? [engagements.clientId, engagements.artisanId]
      : [engagements.artisanId, engagements.clientId];
  // An Engagement is Hired when its Payment arrives, so the first Hire is the first Payment.
  const firstPaymentAt = min(engagements.hiredAt);
  const rows = await ctx.db
    .select({ accountId: theirs, name: accounts.name, firstPaymentAt })
    .from(engagements)
    .innerJoin(accounts, eq(accounts.id, theirs))
    .where(eq(mine, account.accountId))
    .groupBy(theirs, accounts.name)
    .orderBy(desc(firstPaymentAt), theirs);
  const now = ctx.now().getTime();
  return rows.map(({ firstPaymentAt: first, ...row }) => {
    const firstPayment = first!;
    const until = protectedUntilAfter(firstPayment);
    return {
      ...row,
      firstPaymentAt: firstPayment,
      protectedUntil: until,
      protectedNow: now < until.getTime(),
    };
  });
}
