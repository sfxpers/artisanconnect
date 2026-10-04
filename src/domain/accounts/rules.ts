import { desc } from "drizzle-orm";
import type { Actor } from "../actor";
import { audit } from "../audit";
import type { Context } from "../context";
import { adminOnly, ok, refuse } from "../result";
import { defineSection } from "../section";
import { emailTells, tellEveryAccount } from "../tells";
import { marketplaceRules } from "../schema";

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
