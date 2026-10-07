import { and, asc, eq, exists, inArray, like, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { accountIdOf, type Actor } from "../actor";
import { firstProblem } from "../accounts/inputs";
import { publicName } from "../accounts/names";
import { checkContent } from "../content/check";
import { alreadyChecked, isAlreadyDecided } from "../content/held";
import type { Context } from "../context";
import { causedBy } from "../errors";
import { ok, refuse } from "../result";
import { accounts, artisanRegions, authUsers, regions, verificationChecks } from "../schema";
import { defineSection } from "../section";
import {
  isServiceCategory,
  SERVICE_CATEGORY_NAMES,
  type ServiceCategory,
} from "../service-categories";
import { checkFileCount, discardFiles, uploadFile, UPLOAD_CONTEXTS } from "../uploads";
import { badgesOf, verifiedCategoriesOf } from "../verification";
import { slotOf } from "../verification/checks";
import {
  editsStanding,
  heldProfile,
  holdEdit,
  photoById,
  photoPath,
  shownVersion,
  type ProfilePhoto,
  type ProfileVersion,
  withdrawEdit,
} from "./edits";
import { aboutText } from "./inputs";

// Browse and the Artisan Profile (#120, ADR 0016): anyone, signed in or not,
// lists the Artisans verified for one Service Category, optionally in one
// Region, and opens an Artisan's public Profile, which never gives a way to
// reach the Artisan off the platform.

export const profilesSection = defineSection({
  name: "profiles",
  queueItems: [heldProfile],
  api: (ctx) => ({
    /**
     * The Artisans verified now for the category, optionally only those
     * working in the Region: Available for Jobs first, then by public name A
     * to Z. Anyone may browse.
     */
    async browse(_viewer: Actor, input: { category: string; regionId?: string }) {
      if (!isServiceCategory(input.category)) return [];
      return browse(ctx, input.category, { regionId: input.regionId });
    },

    /**
     * An Artisan's public Profile, the same for anyone who opens it, or null
     * until the Artisan has been verified for a Service Category. It never
     * holds a way to reach the Artisan.
     */
    async view(_viewer: Actor, input: { artisanId: string }) {
      return publicProfile(ctx, input.artisanId);
    },

    /** Every Profile anyone may open, for search engines to find. */
    async listed(_viewer: Actor) {
      return ctx.db
        .select({ artisanId: accounts.id })
        .from(accounts)
        .innerJoin(authUsers, eq(authUsers.id, accounts.id))
        .where(and(mayBeListed(), wasVerified(ctx)));
    },

    /**
     * The Artisan's own Profile: the version shown, the Profile as anyone
     * sees it (null until anyone else may open it), and where the newest
     * edit stands.
     */
    async mine(viewer: Actor) {
      if (viewer.kind !== "artisan") return null;
      const [shown, standing, profile] = await Promise.all([
        shownVersion(ctx, viewer.accountId),
        editsStanding(ctx, viewer.accountId),
        publicProfile(ctx, viewer.accountId),
      ]);
      return {
        shown: versionView(shown),
        profile,
        beingChecked: standing.beingChecked && versionView(standing.beingChecked),
        refused: standing.refused && {
          ...versionView(standing.refused),
          reason: standing.refused.reason,
        },
      };
    },

    /**
     * Sends the whole new version of the Profile: the About text, the photos
     * kept from the version shown, and photos to add. It is read by the
     * Content check, and a sure hit is refused with the reason; otherwise it
     * waits for the Admin's Pre-check, and the version shown stays shown.
     */
    async edit(actor: Actor, input: { about: string; keep: string[]; add: Blob[] }) {
      if (actor.kind !== "artisan") {
        return refuse("artisans-only", ARTISANS_ONLY);
      }
      const about = aboutText.safeParse(input.about);
      if (!about.success) return refuse("invalid", firstProblem(about.error));
      const [artisan] = await ctx.db
        .select({ id: accounts.id, name: accounts.name, tradingName: accounts.tradingName })
        .from(accounts)
        .where(eq(accounts.id, actor.accountId));
      if (!artisan) return refuse("artisans-only", ARTISANS_ONLY);
      if ((await editsStanding(ctx, artisan.id)).beingChecked) return beingChecked();

      const shown = await shownVersion(ctx, artisan.id);
      const keep = [...new Set(input.keep)];
      const kept = keep.map((id) => shown.photos.find((photo) => photo.id === id));
      if (kept.some((photo) => !photo)) {
        return refuse("invalid", "That photo is not on your Profile. Reload the page.");
      }
      const counted = checkFileCount("profilePhotos", keep.length + input.add.length);
      if (!counted.ok) return counted;
      const unchanged =
        input.add.length === 0 &&
        about.data === shown.about &&
        keep.join() === shown.photos.map((photo) => photo.id).join();
      if (unchanged) return refuse("unchanged", "Nothing has changed.");

      const added: ProfilePhoto[] = [];
      const discard = () => discardFiles(ctx, added);
      try {
        for (const file of input.add) {
          const uploaded = await uploadFile(ctx, file, UPLOAD_CONTEXTS.beforePayment);
          if (!uploaded.ok) {
            await discard();
            return uploaded;
          }
          if (uploaded.value.kind === "photo") added.push(uploaded.value);
        }
        // Photos kept were read, and released by the Admin, already.
        const checked = await checkContent(ctx, {
          text: about.data,
          files: added,
          context: { kind: "before-payment" },
        });
        if (!checked.ok) {
          await discard();
          return checked;
        }
        const version = { about: about.data, photos: [...(kept as ProfilePhoto[]), ...added] };
        await ctx.commit(
          holdEdit(
            ctx,
            artisan,
            version,
            checked.value.verdict === "held" ? checked.value.reason : null,
          ),
        );
      } catch (error) {
        // Nothing stored stays behind an edit that was not written.
        await discard();
        if (causedBy(error, "UNIQUE constraint failed: profile_edits.artisan_id")) {
          return beingChecked();
        }
        throw error;
      }
      return ok({ profile: "being-checked" as const });
    },

    /**
     * A Profile photo's stored copy, or its thumbnail: to anyone once it is
     * on a Profile anyone may open, and before that, or after an edit removes
     * it, only to its Artisan and the Admin.
     */
    async photo(viewer: Actor, input: { photoId: string; thumbnail?: boolean }) {
      const found = await photoById(ctx, input.photoId);
      if (!found) return null;
      const shown =
        (await shownVersion(ctx, found.artisanId)).photos.some(
          (photo) => photo.id === found.photo.id,
        ) && (await openableArtisan(ctx, found.artisanId)) !== null;
      const maySee = shown || viewer.kind === "admin" || accountIdOf(viewer) === found.artisanId;
      if (!maySee) return null;
      const object = await ctx.ports.files.get(
        input.thumbnail ? found.photo.thumbnailKey : found.photo.key,
      );
      if (!object) return null;
      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType ?? "image/webp",
        size: object.size,
        /** Whether anyone may see it, so a shared cache may keep it. */
        shown,
      };
    },

    /**
     * Withdraws the edit being checked, leaving the version shown until now,
     * and deletes the photos it added.
     */
    async withdraw(actor: Actor) {
      if (actor.kind !== "artisan") {
        return refuse("artisans-only", ARTISANS_ONLY);
      }
      const { beingChecked } = await editsStanding(ctx, actor.accountId);
      if (!beingChecked)
        return refuse("nothing-held", "No Profile edit of yours is being checked.");
      try {
        await ctx.commit(await withdrawEdit(ctx, beingChecked.id));
      } catch (error) {
        if (isAlreadyDecided(error)) return alreadyChecked();
        throw error;
      }
      // The photos it added are nobody's now; those it kept are still shown.
      const shown = new Set((await shownVersion(ctx, actor.accountId)).photos.map((p) => p.id));
      await discardFiles(
        ctx,
        beingChecked.photos.filter((photo) => !shown.has(photo.id)),
      );
      return ok({});
    },
  }),
});

const ARTISANS_ONLY = "Only an Artisan has a Profile to edit.";

function beingChecked() {
  return refuse(
    "being-checked",
    "Your last Profile edit is being checked. Withdraw it to send another.",
  );
}

/** A version as a viewer sees it: each photo by the path that serves it. */
function versionView(version: ProfileVersion) {
  return {
    about: version.about,
    photos: version.photos.map((photo) => ({
      id: photo.id,
      width: photo.width,
      height: photo.height,
      href: photoPath(photo),
      thumbnailHref: photoPath(photo, true),
    })),
  };
}

const LISTED_COLUMNS = {
  id: accounts.id,
  name: accounts.name,
  tradingName: accounts.tradingName,
  availableForJobs: accounts.availableForJobs,
};

/**
 * An Artisan Account others may see at all, once verified: one whose Email is
 * proven and whose names others may see. Join `authUsers` to use it.
 */
function mayBeListed() {
  return and(
    eq(accounts.kind, "artisan"),
    eq(authUsers.emailVerified, true),
    // Names the Content check has not passed are nobody else's to see.
    eq(accounts.namesShown, true),
  );
}

/**
 * Whether the Admin has accepted the Artisan's identity document and work
 * photos for a Service Category, as verifying it needs. A Profile opens then
 * and stays open when a check later expires, so a link shared keeps working.
 */
function wasVerified(ctx: Context) {
  const accepted = (slot: SQL) =>
    exists(
      ctx.db
        .select({ one: sql`1` })
        .from(verificationChecks)
        .where(
          and(
            eq(verificationChecks.artisanId, accounts.id),
            slot,
            eq(verificationChecks.state, "accepted"),
          ),
        ),
    );
  return and(
    accepted(eq(verificationChecks.slot, slotOf("identity", null))),
    // Work photos sit in one slot per category.
    accepted(like(verificationChecks.slot, "work-photos:%")),
  );
}

/**
 * The Artisan, if anyone may open its Profile, with what it is verified for
 * now, which may be nothing once a check has expired.
 */
async function openableArtisan(ctx: Context, artisanId: string) {
  const [row] = await ctx.db
    .select(LISTED_COLUMNS)
    .from(accounts)
    .innerJoin(authUsers, eq(authUsers.id, accounts.id))
    .where(and(eq(accounts.id, artisanId), mayBeListed(), wasVerified(ctx)));
  if (!row) return null;
  const categories = (await verifiedCategoriesOf(ctx, [row.id])).get(row.id) ?? [];
  return { ...row, categories };
}

async function publicProfile(ctx: Context, artisanId: string) {
  const row = await openableArtisan(ctx, artisanId);
  if (!row) return null;
  const [badges, worksIn, shown] = await Promise.all([
    badgesOf(ctx, row.id),
    regionsOf(ctx, [row.id]),
    shownVersion(ctx, row.id),
  ]);
  return {
    artisanId: row.id,
    publicName: publicName(row),
    ...versionView(shown),
    categories: row.categories.map(({ category, gasWork }) => ({
      category,
      name: SERVICE_CATEGORY_NAMES[category],
      gasWork,
    })),
    badges,
    regions: worksIn.get(row.id) ?? [],
    availableForJobs: row.availableForJobs,
    // Engagements and Reviews come with their tickets (#130, #138).
    completed: 0,
    reviews: { average: null, count: 0, items: [] },
  };
}

/**
 * Browse: the Artisans verified now for the category, in the Region or only
 * the Artisan if one is given, Available for Jobs first, then by public name
 * A to Z.
 */
export async function browse(ctx: Context, category: ServiceCategory, narrow: Narrowing = {}) {
  const listed = await listedArtisans(ctx, category, narrow);
  return listed.sort(
    (a, b) =>
      Number(b.availableForJobs) - Number(a.availableForJobs) ||
      a.publicName.localeCompare(b.publicName, "en-ZA", { sensitivity: "base" }),
  );
}

export type Narrowing = { regionId?: string; artisanId?: string };

/** The Artisans verified now for the category, narrowed as given. */
async function listedArtisans(
  ctx: Context,
  category: ServiceCategory,
  { regionId, artisanId }: Narrowing,
) {
  // Only an Artisan holding an accepted check of the category's work photos
  // can be verified for it; whether it is now is worked out from its checks.
  const candidates = ctx.db
    .select({ id: accounts.id })
    .from(accounts)
    .innerJoin(authUsers, eq(authUsers.id, accounts.id))
    .where(
      and(
        mayBeListed(),
        artisanId === undefined ? undefined : eq(accounts.id, artisanId),
        exists(
          ctx.db
            .select({ one: sql`1` })
            .from(verificationChecks)
            .where(
              and(
                eq(verificationChecks.artisanId, accounts.id),
                eq(verificationChecks.slot, slotOf("work-photos", category)),
                eq(verificationChecks.state, "accepted"),
              ),
            ),
        ),
        regionId === undefined
          ? undefined
          : exists(
              ctx.db
                .select({ one: sql`1` })
                .from(artisanRegions)
                .where(
                  and(
                    eq(artisanRegions.artisanId, accounts.id),
                    eq(artisanRegions.regionId, regionId),
                  ),
                ),
            ),
      ),
    );
  const [rows, verified, worksIn] = await Promise.all([
    ctx.db.select(LISTED_COLUMNS).from(accounts).where(inArray(accounts.id, candidates)),
    verifiedCategoriesOf(ctx, candidates),
    regionsOf(ctx, candidates),
  ]);
  return rows.flatMap((row) => {
    const status = verified.get(row.id)?.find((each) => each.category === category);
    if (!status) return [];
    return [
      {
        artisanId: row.id,
        publicName: publicName(row),
        availableForJobs: row.availableForJobs,
        /** Whether the Artisan is verified for gas work in the category, too. */
        gasWork: status.gasWork,
        regions: worksIn.get(row.id) ?? [],
      },
    ];
  });
}

/** The Regions each of these Artisans works in, A to Z, by id. */
async function regionsOf(ctx: Context, artisanIds: SQLWrapper | string[]) {
  const rows = await ctx.db
    .select({ artisanId: artisanRegions.artisanId, id: regions.id, name: regions.name })
    .from(artisanRegions)
    .innerJoin(regions, eq(regions.id, artisanRegions.regionId))
    .where(inArray(artisanRegions.artisanId, artisanIds))
    .orderBy(asc(regions.name));
  const byArtisan = new Map<string, { id: string; name: string }[]>();
  for (const { artisanId, ...region } of rows) {
    byArtisan.set(artisanId, [...(byArtisan.get(artisanId) ?? []), region]);
  }
  return byArtisan;
}
