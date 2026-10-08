import * as z from "zod";
import { and, asc, eq, or, sql } from "drizzle-orm";
import type { Actor } from "../actor";
import { firstProblem } from "../accounts/inputs";
import type { Context } from "../context";
import { isAlreadyDecided } from "../content/held";
import { causedBy } from "../errors";
import { adminOnly, ok, refuse } from "../result";
import { artisanRecord } from "../engagements/record";
import { accounts, authUsers } from "../schema";
import { defineSection } from "../section";
import { emailTells } from "../tells";
import { discardFiles } from "../uploads";
import {
  liftWrites,
  suspendedNow,
  suspendWrites,
  suspensionOf,
  suspensionsOf,
  warningsOf,
  warnWrites,
} from ".";

// The People page (#136): the Admin acts on an Account directly, warning or
// suspending it, lifting its Suspension, or holding its Payouts, and reads an
// Artisan's record. Each is a Tell to that Account.

const reasonInput = z
  .string()
  .trim()
  .min(1, { error: "Give the reason. The Account is told it." })
  .max(2000, { error: "Keep the reason to 2000 characters." });

export const peopleSection = defineSection({
  name: "people",
  api: (ctx) => ({
    /**
     * The Accounts whose name or Email holds the words given, A to Z, at most
     * 50, each with whether it is Suspended. Never a sign-up whose Email is
     * unproven.
     */
    async find(viewer: Actor, input: { query: string }) {
      if (viewer.kind !== "admin") return null;
      const query = input.query.trim().toLocaleLowerCase("en-ZA");
      const pattern = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      const rows = await ctx.db
        .select({
          accountId: accounts.id,
          kind: accounts.kind,
          name: accounts.name,
          email: authUsers.email,
          suspended: sql<number>`${suspendedNow(ctx, accounts.id)}`,
        })
        .from(accounts)
        .innerJoin(authUsers, eq(authUsers.id, accounts.id))
        .where(
          and(
            eq(authUsers.emailVerified, true),
            query
              ? or(
                  sql`lower(${accounts.name}) like ${pattern} escape '\\'`,
                  sql`lower(${authUsers.email}) like ${pattern} escape '\\'`,
                )
              : undefined,
          ),
        )
        .orderBy(asc(accounts.name), asc(accounts.id))
        .limit(50);
      return rows.map((row) => ({ ...row, suspended: !!row.suspended }));
    },

    /**
     * One Account's page: who it is, its Suspension while one stands, every
     * warning and Suspension it has had, newest first, whether its Payouts
     * are held, and an Artisan's record. Null for anyone but an Admin.
     */
    async view(viewer: Actor, input: { accountId: string }) {
      if (viewer.kind !== "admin") return null;
      const [row] = await ctx.db
        .select({
          accountId: accounts.id,
          kind: accounts.kind,
          name: accounts.name,
          email: authUsers.email,
          signedUpAt: accounts.signedUpAt,
          payoutsHeldAt: accounts.payoutsHeldAt,
        })
        .from(accounts)
        .innerJoin(authUsers, eq(authUsers.id, accounts.id))
        .where(and(eq(accounts.id, input.accountId), eq(authUsers.emailVerified, true)));
      if (!row) return null;
      const { payoutsHeldAt, ...account } = row;
      const [suspension, warned, suspended, record] = await Promise.all([
        suspensionOf(ctx, row.accountId),
        warningsOf(ctx, row.accountId),
        suspensionsOf(ctx, row.accountId),
        row.kind === "artisan" ? artisanRecord(ctx, row.accountId) : null,
      ]);
      return {
        ...account,
        suspended: suspension && { reason: suspension.reason, since: suspension.since },
        warnings: warned,
        suspensions: suspended,
        payoutsHeld: payoutsHeldAt !== null,
        artisanRecord: record,
      };
    },

    /** Warns the Account, telling it the reason. */
    async warn(actor: Actor, input: { accountId: string; reason: string }) {
      if (actor.kind !== "admin") return adminOnly();
      const reason = reasonInput.safeParse(input.reason);
      if (!reason.success) return refuse("invalid", firstProblem(reason.error));
      const account = await accountRow(ctx, input.accountId);
      if (!account) return noAccount();
      await ctx.commit(warnWrites(ctx, actor, account, { reason: reason.data, leaving: false }));
      await emailTells(ctx);
      return ok({});
    },

    /** Lifts the Account's Suspension, telling it. Its warnings stay. */
    async lift(actor: Actor, input: { accountId: string; reason?: string }) {
      if (actor.kind !== "admin") return adminOnly();
      const account = await accountRow(ctx, input.accountId);
      if (!account) return noAccount();
      const suspension = await suspensionOf(ctx, account.id);
      if (!suspension) return notSuspended();
      await ctx.commit(liftWrites(ctx, actor, account, suspension, input.reason?.trim() || null));
      await emailTells(ctx);
      return ok({});
    },

    /** Suspends the Account, telling it the reason. */
    async suspend(actor: Actor, input: { accountId: string; reason: string }) {
      if (actor.kind !== "admin") return adminOnly();
      const reason = reasonInput.safeParse(input.reason);
      if (!reason.success) return refuse("invalid", firstProblem(reason.error));
      const account = await accountRow(ctx, input.accountId);
      if (!account) return noAccount();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const suspended = await suspendWrites(ctx, actor, account, {
          reason: reason.data,
          leaving: false,
        });
        try {
          await ctx.commit(suspended.writes);
        } catch (error) {
          if (isAlreadySuspended(error)) return alreadySuspended();
          // Something it ends changed meanwhile, which aborted it: read it again.
          if (isAlreadyDecided(error)) continue;
          throw error;
        }
        await discardFiles(ctx, suspended.discard);
        await emailTells(ctx);
        return ok({});
      }
      throw new Error(`Account ${account.id} kept changing while it was suspended`);
    },
  }),
});

async function accountRow(ctx: Context, accountId: string) {
  const [row] = await ctx.db
    .select({ id: accounts.id, name: accounts.name, kind: accounts.kind })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return row ?? null;
}

/** Whether a batch failed because a Suspension already stands on the Account. */
export function isAlreadySuspended(error: unknown) {
  return causedBy(error, "UNIQUE constraint failed: suspensions.account_id");
}

export function alreadySuspended() {
  return refuse("already-suspended", "This Account is already suspended.");
}

function notSuspended() {
  return refuse("not-suspended", "This Account is not suspended.");
}

function noAccount() {
  return refuse("not-found", "That Account does not exist.");
}
