import { and, eq, exists, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Context, Write } from "../context";
import { moneyOf, unpaidPayoutCents } from "../ledger";
import {
  accounts,
  authCredentials,
  authSessions,
  authUsers,
  authVerifications,
  dataRequests,
  engagements,
  ledgerEntries,
  namesSent,
  notices,
  profileEdits,
  refunds,
  sightings,
  supportRequests,
  verificationChecks,
} from "../schema";
import type { StoredFile } from "../uploads";

// Erasure (#141, ADR 0021): the Admin anonymises a Closed Account once no
// money is still owed to it. What names the person goes: its names, Email,
// password and sessions, the devices and IPs it was seen on, its Notices, its
// own Support messages, its Profile, its stored files, and its export. What
// is also another party's or the platform's record stays: its Jobs, Quotes,
// Conversations, Engagements, money records with the Payout account they
// were paid to, its Reviews (shown without the name), its Identity Number,
// so one still holds at most one Artisan Account, its warnings and
// Suspensions, and the Admin's own records (queue items, decisions, Signals,
// and the audit log) as written.

/** What an erased Account is called, to the Admin and itself, where a name is needed. */
export const ERASED_NAME = "Erased Account";

/** The address an erased Account's sign-in identity holds instead of its Email, which it frees. */
export function erasedAddress(accountId: string) {
  return `erased-${accountId}@erased.invalid`;
}

/** Refunds the bank has not yet taken, or that wait to be paid by hand. */
const OWED_REFUND_STATES = ["waiting", "sent", "paused", "failed"] as const;

/**
 * What is still owed to the Account, or may still be, in cents: money on its
 * Engagements not yet released or refunded, a Client's Refunds not yet paid,
 * and an Artisan's Releases not yet paid out. Erasure waits until it is none.
 */
export async function stillOwedCents(
  ctx: Context,
  account: { id: string; kind: "client" | "artisan" },
) {
  // By subquery, not by id: D1 binds at most 100 values to a query.
  const theirs = ctx.db
    .select({ id: engagements.id })
    .from(engagements)
    .where(or(eq(engagements.clientId, account.id), eq(engagements.artisanId, account.id)));
  const onEngagements = inArray(ledgerEntries.engagementId, theirs);
  const { unreleasedCents } = await moneyOf(ctx, onEngagements);
  if (account.kind === "client") {
    const [owed] = await ctx.db
      .select({ cents: sql<number>`coalesce(sum(${refunds.amountCents}), 0)` })
      .from(refunds)
      .where(and(eq(refunds.clientId, account.id), inArray(refunds.state, OWED_REFUND_STATES)));
    return unreleasedCents + (owed?.cents ?? 0);
  }
  const [unpaid] = await ctx.db
    .select({ cents: unpaidPayoutCents() })
    .from(ledgerEntries)
    .where(onEngagements);
  return unreleasedCents + (unpaid?.cents ?? 0);
}

/**
 * The writes that erase the Closed Account, each only if it is erased by
 * them; and the stored files and exports they leave nobody's, to delete once
 * committed.
 */
export async function eraseWrites(
  ctx: Context,
  account: { id: string; email: string },
): Promise<{ writes: Write[]; files: StoredFile[]; exports: string[] }> {
  const now = ctx.now();
  const erasedNow = exists(
    ctx.db
      .select({ one: sql`1` })
      .from(accounts)
      .where(and(eq(accounts.id, account.id), eq(accounts.erasedAt, now))),
  );
  const replaced = erasedAddress(account.id);
  const changePrefix = `change-email-otp-${account.email}-`;

  const [edits, checks, exported] = await Promise.all([
    ctx.db
      .select({ photos: profileEdits.photos })
      .from(profileEdits)
      .where(eq(profileEdits.artisanId, account.id)),
    ctx.db
      .select({ files: verificationChecks.files })
      .from(verificationChecks)
      .where(eq(verificationChecks.artisanId, account.id)),
    ctx.db
      .select({ key: dataRequests.exportKey })
      .from(dataRequests)
      .where(and(eq(dataRequests.accountId, account.id), isNotNull(dataRequests.exportKey))),
  ]);

  const writes: Write[] = [
    ctx.db
      .update(accounts)
      .set({
        name: ERASED_NAME,
        tradingName: null,
        // Its Reviews, and wherever else it shows, are shown without the name.
        namesShown: false,
        vatNumber: null,
        profileOutOfViewFor: null,
        erasedAt: now,
      })
      .where(
        and(eq(accounts.id, account.id), isNotNull(accounts.closedAt), isNull(accounts.erasedAt)),
      ),
    ctx.db
      .update(authUsers)
      .set({ email: replaced, name: ERASED_NAME, image: null, updatedAt: now })
      .where(and(eq(authUsers.id, account.id), erasedNow)),
    ctx.db.delete(authCredentials).where(and(eq(authCredentials.userId, account.id), erasedNow)),
    ctx.db.delete(authSessions).where(and(eq(authSessions.userId, account.id), erasedNow)),
    // Codes sent to the Email: sign-in, recovery, a change of Email from it.
    ctx.db.delete(authVerifications).where(
      and(
        or(
          inArray(
            authVerifications.identifier,
            ["sign-in", "email-verification", "forget-password"].map(
              (type) => `${type}-otp-${account.email}`,
            ),
          ),
          sql`substr(${authVerifications.identifier}, 1, ${changePrefix.length}) = ${changePrefix}`,
        ),
        erasedNow,
      ),
    ),
    ctx.db
      .update(namesSent)
      .set({ name: ERASED_NAME, tradingName: null, heldFor: null })
      .where(and(eq(namesSent.accountId, account.id), erasedNow)),
    ctx.db.delete(sightings).where(and(eq(sightings.accountId, account.id), erasedNow)),
    ctx.db.delete(notices).where(and(eq(notices.accountId, account.id), erasedNow)),
    // Emails to its address alone, such as a Support answer quoting it.
    ctx.db
      .delete(notices)
      .where(and(eq(notices.address, account.email), isNull(notices.emailedAt), erasedNow)),
    ctx.db
      .update(notices)
      .set({ address: replaced, body: null })
      .where(and(eq(notices.address, account.email), erasedNow)),
    // Its own words to the Admin; a system request may be about money owed, and stays.
    ctx.db
      .update(supportRequests)
      .set({ message: "" })
      .where(
        and(eq(supportRequests.accountId, account.id), isNotNull(supportRequests.topic), erasedNow),
      ),
    ctx.db
      .update(profileEdits)
      .set({ about: "", photos: [] })
      .where(and(eq(profileEdits.artisanId, account.id), erasedNow)),
    // The documents go; what the Admin recorded on accepting them stays.
    ctx.db
      .update(verificationChecks)
      .set({ files: [], reading: { facts: [], text: "" } })
      .where(and(eq(verificationChecks.artisanId, account.id), erasedNow)),
    ctx.db
      .update(dataRequests)
      .set({ exportKey: null })
      .where(and(eq(dataRequests.accountId, account.id), erasedNow)),
  ];
  return {
    writes,
    files: [...edits.flatMap((edit) => edit.photos), ...checks.flatMap((check) => check.files)],
    exports: exported.flatMap((row) => (row.key ? [row.key] : [])),
  };
}
