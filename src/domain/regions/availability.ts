import { and, eq } from "drizzle-orm";
import type { Actor } from "../actor";
import { ok, refuse } from "../result";
import { accounts } from "../schema";
import { defineSection } from "../section";

// Available for Jobs (#119): the Artisan's switch for receiving Job Matches.
// Off hides nothing, the Artisan Profile included, and on again keeps the
// Artisan's place in the offer order, which only a Batch moves.

export const availabilitySection = defineSection({
  name: "availability",
  api: (ctx) => ({
    /** Whether the Artisan receives Job Matches, or null for anyone else. */
    async mine(viewer: Actor) {
      if (viewer.kind !== "artisan") return null;
      const [row] = await ctx.db
        .select({ availableForJobs: accounts.availableForJobs })
        .from(accounts)
        .where(eq(accounts.id, viewer.accountId));
      return row ?? null;
    },

    /** Turns Available for Jobs on or off. */
    async set(actor: Actor, input: { available: boolean }) {
      if (actor.kind !== "artisan") {
        return refuse("artisans-only", "Only an Artisan is Available for Jobs.");
      }
      if (typeof input.available !== "boolean") {
        return refuse("invalid", "Say whether you are Available for Jobs.");
      }
      const updated = await ctx.db
        .update(accounts)
        .set({ availableForJobs: input.available })
        .where(and(eq(accounts.id, actor.accountId), eq(accounts.kind, "artisan")))
        .returning({ availableForJobs: accounts.availableForJobs });
      const [row] = updated;
      if (!row) return refuse("artisans-only", "Only an Artisan is Available for Jobs.");
      return ok(row);
    },
  }),
});
