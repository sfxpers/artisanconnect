import * as z from "zod";
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Actor } from "../actor";
import { firstProblem } from "../accounts/inputs";
import { audit } from "../audit";
import type { Context } from "../context";
import { adminOnly, ok, refuse } from "../result";
import { artisanRegions, regions, suburbs } from "../schema";
import { defineSection } from "../section";
import { REGIONS_MAX, suburbKey } from "./places";

// Regions and suburbs (#100, #119) are seeded data: the City's districts and
// its official suburbs, each in exactly one Region. A suburb gives a Job its
// Region, and an Artisan is offered Jobs only in the Regions they choose.
// Nothing here names a city, so a later city is a new seed. The Admin adds a
// suburb the City creates (#142), and never moves, renames, or removes one.

/** The most suburbs one search gives. */
const SEARCH_MAX = 20;

/** The longest suburb name the Admin may add; the City's longest is under 50. */
const NAME_MAX = 80;

const suburbInput = z.object({
  name: z
    .string()
    .transform((name) => name.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(1, { error: "Name the suburb as the City publishes it." })
        .max(NAME_MAX, { error: `A suburb's name is at most ${NAME_MAX} characters.` }),
    ),
  regionId: z.string({ error: "Choose the Region it is in." }),
  despiteAlike: z.boolean().optional(),
});

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

    /**
     * The Admin adds a suburb the City has created to the Region it is in.
     * A name a suburb has, whatever its case, is refused; one that reads like
     * another's (`suburbKey`) is added only when the Admin asks again, since
     * the City publishes some that differ only in punctuation.
     */
    async addSuburb(
      actor: Actor,
      input: { name: string; regionId: string; despiteAlike?: boolean },
    ) {
      if (actor.kind !== "admin") return adminOnly();
      const parsed = suburbInput.safeParse(input);
      if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
      const { name, regionId, despiteAlike } = parsed.data;
      // A name of punctuation only could never be searched for.
      const key = suburbKey(name);
      if (!key) return refuse("invalid", "Name the suburb as the City publishes it.");
      const [region] = await ctx.db.select().from(regions).where(eq(regions.id, regionId));
      if (!region) return refuse("invalid", "That is not a Region. Choose from the list.");

      const alike = await ctx.db
        .select({ name: suburbs.name, region: regions.name })
        .from(suburbs)
        .innerJoin(regions, eq(regions.id, suburbs.regionId))
        // The same name in another case has the same key too.
        .where(eq(suburbs.searchKey, key))
        .orderBy(asc(suburbs.name));
      const same = alike.find((each) => each.name.toLowerCase() === name.toLowerCase());
      if (same) {
        return refuse(
          "already-a-suburb",
          `${same.name} is already a suburb, in ${same.region}. A suburb is never moved or renamed.`,
        );
      }
      if (alike.length > 0 && !despiteAlike) {
        const named = alike.map((each) => `${each.name} (${each.region})`).join(", ");
        return refuse(
          "reads-alike",
          `${name} reads like ${named}. Add it only if the City names both.`,
        );
      }

      const suburbId = ctx.newId();
      await ctx.commit([
        ctx.db.insert(suburbs).values({ id: suburbId, name, searchKey: key, regionId }),
        audit(ctx, actor, {
          action: "suburb.added",
          summary: `Added the suburb ${name} to ${region.name}`,
          subjectId: suburbId,
        }),
      ]);
      return ok({ suburbId });
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
