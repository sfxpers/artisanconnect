import * as z from "zod";
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Actor } from "../actor";
import { firstProblem } from "../accounts/inputs";
import type { Context } from "../context";
import { ok, refuse } from "../result";
import { artisanRegions, regions, suburbs } from "../schema";
import { defineSection } from "../section";
import { REGIONS_MAX, suburbKey } from "./places";

// Regions and suburbs (#100, #119) are seeded data: the City's districts and
// its official suburbs, each in exactly one Region. A suburb gives a Job its
// Region, and an Artisan is offered Jobs only in the Regions they choose.
// Nothing here names a city, so a later city is a new seed.

/** The most suburbs one search gives. */
const SEARCH_MAX = 20;

const choiceInput = z.object({
  regionIds: z
    .array(z.string(), { error: "Choose one to three Regions." })
    .min(1, { error: "Choose one to three Regions." })
    .max(REGIONS_MAX, { error: "Choose one to three Regions." })
    .refine((ids) => new Set(ids).size === ids.length, { error: "Choose each Region once." }),
});

export const regionsSection = defineSection({
  name: "regions",
  api: (ctx) => ({
    /** Every Region, A to Z, each with its suburbs A to Z. Anyone may read them. */
    async all(_viewer: Actor) {
      const [regionRows, suburbRows] = await Promise.all([
        ctx.db.select().from(regions).orderBy(asc(regions.name)),
        ctx.db
          .select({ id: suburbs.id, name: suburbs.name, regionId: suburbs.regionId })
          .from(suburbs)
          .orderBy(asc(suburbs.name)),
      ]);
      return regionRows.map((region) => ({
        id: region.id,
        name: region.name,
        suburbs: suburbRows
          .filter((suburb) => suburb.regionId === region.id)
          .map(({ id, name }) => ({ id, name })),
      }));
    },

    /**
     * Suburbs whose name holds the query, ignoring case, spaces, and
     * punctuation: those it starts with first, then A to Z, each with its Region.
     */
    async searchSuburbs(_viewer: Actor, input: { query: string }) {
      const key = typeof input.query === "string" ? suburbKey(input.query) : "";
      if (!key) return [];
      const rows = await ctx.db
        .select({
          id: suburbs.id,
          name: suburbs.name,
          regionId: regions.id,
          regionName: regions.name,
        })
        .from(suburbs)
        .innerJoin(regions, eq(regions.id, suburbs.regionId))
        .where(sql`instr(${suburbs.searchKey}, ${key}) > 0`)
        .orderBy(sql`instr(${suburbs.searchKey}, ${key}) = 1 desc`, asc(suburbs.name))
        .limit(SEARCH_MAX);
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        region: { id: row.regionId, name: row.regionName },
      }));
    },

    /** The Regions the Artisan works in, A to Z, or null for anyone else. */
    async mine(viewer: Actor) {
      if (viewer.kind !== "artisan") return null;
      return { regions: await regionsOf(ctx, viewer.accountId) };
    },

    /** Replaces the Regions the Artisan works in with one to three others. */
    async choose(actor: Actor, input: { regionIds: string[] }) {
      if (actor.kind !== "artisan") {
        return refuse("artisans-only", "Only an Artisan chooses Regions to work in.");
      }
      const parsed = choiceInput.safeParse(input);
      if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
      const { regionIds } = parsed.data;
      const known = await ctx.db
        .select({ id: regions.id })
        .from(regions)
        .where(inArray(regions.id, regionIds));
      if (known.length !== regionIds.length) {
        return refuse("invalid", "That is not a Region. Choose from the list.");
      }

      await ctx.commit([
        ctx.db.delete(artisanRegions).where(eq(artisanRegions.artisanId, actor.accountId)),
        ctx.db
          .insert(artisanRegions)
          .values(regionIds.map((regionId) => ({ artisanId: actor.accountId, regionId }))),
      ]);
      return ok({ regions: await regionsOf(ctx, actor.accountId) });
    },
  }),
});

/** The Regions an Artisan works in, A to Z. */
function regionsOf(ctx: Context, artisanId: string) {
  return ctx.db
    .select({ id: regions.id, name: regions.name })
    .from(artisanRegions)
    .innerJoin(regions, eq(regions.id, artisanRegions.regionId))
    .where(eq(artisanRegions.artisanId, artisanId))
    .orderBy(asc(regions.name));
}
