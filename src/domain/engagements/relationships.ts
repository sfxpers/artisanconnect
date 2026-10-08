import { desc, eq, min } from "drizzle-orm";
import type { Context } from "../context";
import { accounts, engagements } from "../schema";

// The Protected Relationship Period (#139, ADR 0014): the 365 days after the
// first Payment in a Client Relationship, during which all work between the
// pair belongs on the platform. A later Payment does not extend it, and
// nothing ends or pauses it. Only the Admin sees it.

export const PROTECTED_RELATIONSHIP_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

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
    const protectedUntil = new Date(firstPayment.getTime() + PROTECTED_RELATIONSHIP_DAYS * DAY_MS);
    return {
      ...row,
      firstPaymentAt: firstPayment,
      protectedUntil,
      protectedNow: now < protectedUntil.getTime(),
    };
  });
}
