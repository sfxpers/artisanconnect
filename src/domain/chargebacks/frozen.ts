import { and, eq, ne, notExists, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { Context } from "../context";
import { causedBy } from "../errors";
import { refuse } from "../result";
import { chargebacks } from "../schema";

// What a Chargeback waiting for the Admin freezes (#137): its Engagement, and
// the waiting Refunds of its Payment. Apart from the Chargebacks module so the
// Refunds paid by hand can reach it.

/** A Chargeback on the Engagement or Payment, given as a value or a column, waiting for the Admin. */
function undecidedOn(on: "engagementId" | "paymentId", id: SQLWrapper | string) {
  return and(eq(chargebacks[on], id), ne(chargebacks.state, "decided"));
}

async function isUndecided(ctx: Context, on: "engagementId" | "paymentId", id: string) {
  const [row] = await ctx.db
    .select({ id: chargebacks.id })
    .from(chargebacks)
    .where(undecidedOn(on, id))
    .limit(1);
  return !!row;
}

/** The SQL that is true while no Chargeback on the Engagement waits for the Admin: it is not frozen. */
export function notFrozen(ctx: Context, engagementId: SQLWrapper | string): SQL {
  return notExists(
    ctx.db
      .select({ one: sql`1` })
      .from(chargebacks)
      .where(undecidedOn("engagementId", engagementId)),
  );
}

/** Whether a Chargeback on the Engagement waits for the Admin, which freezes it. */
export async function isFrozen(ctx: Context, engagementId: string): Promise<boolean> {
  return isUndecided(ctx, "engagementId", engagementId);
}

/**
 * Whether a Chargeback on the Payment waits for the Admin: its Refunds not
 * with the payment adapter wait too, as the decision may find the bank sent
 * their money back to the Client already.
 */
export async function isPaymentFrozen(ctx: Context, paymentId: string): Promise<boolean> {
  return isUndecided(ctx, "paymentId", paymentId);
}

/** The refusal of anything done on an Engagement a Chargeback froze. */
export function frozenRefusal() {
  return refuse(
    "frozen",
    "A Chargeback on this Job's Payment froze it: the Admin decides its money, and nothing more can be done on it until then.",
  );
}

/** Whether a batch aborted as a Chargeback froze its Engagement meanwhile. */
export function isFrozenError(error: unknown) {
  return causedBy(error, "frozen by a Chargeback");
}
