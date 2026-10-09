import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { Actor } from "../actor";
import { audit } from "../audit";
import type { Context } from "../context";
import { adminOnly, ok, refuse } from "../result";
import { defineSection } from "../section";
import { emailTells, tellEveryAccount } from "../tells";
import { accounts, authUsers, marketplaceRules } from "../schema";

export type MarketplaceRules = { version: number; summary: string; publishedAt: Date };

export async function currentRules(ctx: Context): Promise<MarketplaceRules> {
  const [current] = await ctx.db
    .select()
    .from(marketplaceRules)
    .orderBy(desc(marketplaceRules.version))
    .limit(1);
  if (!current) throw new Error("No Marketplace rules have been published");
  return current;
}

export const marketplaceRulesSection = defineSection({
  name: "marketplaceRules",
  api: (ctx) => ({
    /** The version every Account must have accepted. Anyone may read it. */
    async current(_viewer: Actor) {
      return currentRules(ctx);
    },

    /**
     * Every version for the Admin, newest first, each with the Accounts whose
     * last accepted version it is: those told of a change, so not a sign-up
     * that never proved its Email, nor an erased Account.
     */
    async versions(viewer: Actor) {
      if (viewer.kind !== "admin") return null;
      const [versions, accepted] = await Promise.all([
        ctx.db.select().from(marketplaceRules).orderBy(desc(marketplaceRules.version)),
        ctx.db
          .select({ version: accounts.rulesVersion, accounts: count() })
          .from(accounts)
          .innerJoin(authUsers, eq(authUsers.id, accounts.id))
          .where(and(eq(authUsers.emailVerified, true), isNull(accounts.erasedAt)))
          .groupBy(accounts.rulesVersion),
      ]);
      return {
        accounts: accepted.reduce((sum, row) => sum + row.accounts, 0),
        versions: versions.map((rules) => ({
          ...rules,
          acceptedLastBy: accepted.find((row) => row.version === rules.version)?.accounts ?? 0,
        })),
      };
    },

    /**
     * The Admin publishes a new version. Every Account is told, and accepts
     * it at its next sign-in.
     */
    async publish(actor: Actor, input: { summary: string }) {
      if (actor.kind !== "admin") {
        return adminOnly();
      }
      const summary = input.summary.trim();
      if (!summary) return refuse("invalid", "Say what changed in this version.");
      const version = (await currentRules(ctx)).version + 1;
      await ctx.commit([
        ctx.db.insert(marketplaceRules).values({ version, summary, publishedAt: ctx.now() }),
        audit(ctx, actor, {
          action: "marketplace-rules.published",
          summary: `Published Marketplace rules version ${version}`,
        }),
        tellEveryAccount(ctx, {
          event: "marketplace-rules-changed",
          title: "The Marketplace rules have changed",
          link: "/rules",
        }),
      ]);
      await emailTells(ctx);
      return ok({ version });
    },
  }),
});
