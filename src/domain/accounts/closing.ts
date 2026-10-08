import { and, eq, isNull, notInArray, or } from "drizzle-orm";
import type { AccountActor } from "../actor";
import type { Context, Write } from "../context";
import { isAlreadyDecided } from "../content/held";
import { ok, refuse, type Result } from "../result";
import { accounts, authSessions, engagements } from "../schema";
import { newWorkEnded } from "../standing";
import { emailTells } from "../tells";
import { discardFiles, type StoredFile } from "../uploads";

// Closing an Account (#141): its person leaves while no Engagement of theirs
// is in progress. The new work it had started ends as at a Suspension, every
// session ends, and it stays out of sight until it is reopened. Its paid
// Engagements are over, so nothing else of it changes: its Reviews stay, and
// money still owed to it is still paid.

/** Whether the Account is a party to an Engagement neither Completed nor Cancelled. */
export async function hasEngagementInProgress(ctx: Context, accountId: string) {
  const [row] = await ctx.db
    .select({ id: engagements.id })
    .from(engagements)
    .where(
      and(
        notInArray(engagements.state, ["completed", "cancelled"]),
        or(eq(engagements.clientId, accountId), eq(engagements.artisanId, accountId)),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** Whether the Account is Closed now, and whether it was erased. */
export async function closedState(ctx: Context, accountId: string) {
  const [row] = await ctx.db
    .select({ closedAt: accounts.closedAt, erasedAt: accounts.erasedAt })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return row ?? null;
}

/**
 * The writes that close the Account, if it is open when they run, ending the
 * new work it had started and every session; and the files they leave
 * nobody's, to discard once committed. A decision the Admin recorded
 * meanwhile on something it withdraws aborts the batch with an error
 * `isAlreadyDecided` recognises: read again then.
 */
export async function closeWrites(
  ctx: Context,
  actor: AccountActor,
): Promise<{ writes: Write[]; discard: StoredFile[] }> {
  const ended = await newWorkEnded(ctx, actor, { id: actor.accountId, kind: actor.kind });
  return {
    writes: [
      ctx.db
        .update(accounts)
        .set({ closedAt: ctx.now() })
        .where(and(eq(accounts.id, actor.accountId), isNull(accounts.closedAt))),
      ...ended.writes,
      ctx.db.delete(authSessions).where(eq(authSessions.userId, actor.accountId)),
    ],
    discard: ended.discard,
  };
}

/**
 * Closes the Account while no Engagement of it is in progress, with the
 * writes given alongside in the same batch (made afresh for each try), then
 * discards the files it left nobody's and sends the Tells' emails. A
 * decision the Admin recorded meanwhile on something it ends aborts a try:
 * it is read again.
 */
export async function closeAccount(
  ctx: Context,
  actor: AccountActor,
  alongside: () => Write[] = () => [],
): Promise<Result<Record<string, never>>> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await hasEngagementInProgress(ctx, actor.accountId)) return inProgressRefusal();
    const closing = await closeWrites(ctx, actor);
    try {
      await ctx.commit([...alongside(), ...closing.writes]);
    } catch (error) {
      if (isAlreadyDecided(error)) continue;
      throw error;
    }
    await discardFiles(ctx, closing.discard);
    await emailTells(ctx).catch((error: unknown) => {
      console.error("Tell emails did not go", error);
    });
    return ok({});
  }
  throw new Error(`Account ${actor.accountId} kept changing while it was closed`);
}

export function inProgressRefusal() {
  return refuse(
    "engagement-in-progress",
    "You have an Engagement in progress. Close your Account once each is Completed or Cancelled.",
  );
}

export function closedRefusal() {
  return refuse("closed", "This Account is closed. Reopen it with an Email code.");
}
