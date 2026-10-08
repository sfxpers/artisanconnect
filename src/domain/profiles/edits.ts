import { and, desc, eq, lte, sql } from "drizzle-orm";
import { publicName } from "../accounts/names";
import type { Context, Write } from "../context";
import { defineHeldKind } from "../content/held";
import type { Block } from "../queues";
import { accounts, authUsers, profileEdits, queueItems } from "../schema";
import type { StoredFile } from "../uploads";

// Every Artisan Profile edit waits for the Admin's Pre-check (ADR 0020),
// whatever the Content check made of it, and the version shown until now
// stays shown meanwhile, so the public page is never broken. An edit is the
// whole new version; the newest one released is the Profile shown.

export type ProfilePhoto = Extract<StoredFile, { kind: "photo" }>;

export type ProfileVersion = { about: string; photos: ProfilePhoto[] };

/** A Profile no edit has been released for. */
const EMPTY: ProfileVersion = { about: "", photos: [] };

/** The version of the Artisan's Profile shown now. */
export async function shownVersion(ctx: Context, artisanId: string): Promise<ProfileVersion> {
  const [shown] = await ctx.db
    .select({ about: profileEdits.about, photos: profileEdits.photos })
    .from(profileEdits)
    .where(and(eq(profileEdits.artisanId, artisanId), eq(profileEdits.state, "released")))
    // Released in the same millisecond, in the order they were written.
    .orderBy(desc(profileEdits.releasedAt), desc(sql.raw(`"profile_edits"."rowid"`)))
    .limit(1);
  return shown ?? EMPTY;
}

/**
 * Where the Artisan's edits stand, from the newest: being checked, which only
 * the Artisan and the Admin see, or refused, with the Admin's reason.
 */
export async function editsStanding(ctx: Context, artisanId: string) {
  const [newest] = await ctx.db
    .select({
      id: profileEdits.id,
      about: profileEdits.about,
      photos: profileEdits.photos,
      state: profileEdits.state,
      reason: queueItems.reason,
    })
    .from(profileEdits)
    .leftJoin(
      queueItems,
      and(eq(queueItems.subjectId, profileEdits.id), eq(queueItems.kind, heldProfile.kind)),
    )
    .where(eq(profileEdits.artisanId, artisanId))
    .orderBy(desc(profileEdits.sentAt), desc(sql.raw(`"profile_edits"."rowid"`)))
    .limit(1);
  if (newest?.state === "held") {
    return {
      beingChecked: { id: newest.id, about: newest.about, photos: newest.photos },
      refused: null,
    };
  }
  if (newest?.state === "refused") {
    return {
      beingChecked: null,
      refused: {
        about: newest.about,
        photos: newest.photos,
        reason: newest.reason ?? "",
      },
    };
  }
  return { beingChecked: null, refused: null };
}

/** The write that Holds an edit, and the write that puts it in the Pre-checks queue. */
export function holdEdit(
  ctx: Context,
  artisan: { id: string; name: string; tradingName: string | null },
  version: ProfileVersion,
  heldFor: string | null,
) {
  const id = ctx.newId();
  return [
    ctx.db.insert(profileEdits).values({
      id,
      artisanId: artisan.id,
      ...version,
      state: "held",
      heldFor,
      sentAt: ctx.now(),
    }),
    heldProfile.raise(ctx, { subjectId: id, title: `Profile: ${publicName(artisan)}` }).write,
  ];
}

/** The writes that withdraw a Held edit, guarded on its still being Held. */
export async function withdrawEdit(ctx: Context, editId: string): Promise<Write[]> {
  return [
    ctx.db
      .update(profileEdits)
      .set({ state: "withdrawn" })
      .where(and(eq(profileEdits.id, editId), eq(profileEdits.state, "held"))),
    ...(await heldProfile.withdraw(ctx, editId)),
  ];
}

async function editRow(ctx: Context, id: string) {
  const [row] = await ctx.db
    .select({
      id: profileEdits.id,
      artisanId: profileEdits.artisanId,
      about: profileEdits.about,
      photos: profileEdits.photos,
      state: profileEdits.state,
      heldFor: profileEdits.heldFor,
      sentAt: profileEdits.sentAt,
      name: accounts.name,
      tradingName: accounts.tradingName,
      email: authUsers.email,
    })
    .from(profileEdits)
    .innerJoin(accounts, eq(accounts.id, profileEdits.artisanId))
    .innerJoin(authUsers, eq(authUsers.id, profileEdits.artisanId))
    .where(eq(profileEdits.id, id));
  return row ?? null;
}

/** A photo some edit to the Artisan's Profile holds; null if none holds one by that id. */
export async function photoById(ctx: Context, artisanId: string, photoId: string) {
  const [edit] = await ctx.db
    .select({ photos: profileEdits.photos })
    .from(profileEdits)
    .where(
      and(
        eq(profileEdits.artisanId, artisanId),
        sql`exists (select 1 from json_each(${profileEdits.photos}) where json_extract(json_each.value, '$.id') = ${photoId})`,
      ),
    )
    .limit(1);
  return edit?.photos.find((each) => each.id === photoId) ?? null;
}

/** A photo's path in the web app, which serves it only to whoever may see it. */
export function photoPath(artisanId: string, photo: { id: string }, thumbnail = false): string {
  return `/profile-photos/${artisanId}/${photo.id}${thumbnail ? "?size=thumbnail" : ""}`;
}

export function versionBlocks(
  artisanId: string,
  version: ProfileVersion,
  isNew?: (photo: ProfilePhoto) => boolean,
) {
  const blocks: Block[] = [{ kind: "text", text: version.about || "No About text." }];
  if (version.photos.length > 0) {
    blocks.push({
      kind: "files",
      files: version.photos.map((photo, index) => ({
        kind: "photo",
        label: `Photo ${index + 1}${isNew?.(photo) ? " (new)" : ""}`,
        href: photoPath(artisanId, photo),
      })),
    });
  }
  return blocks;
}

export const heldProfile = defineHeldKind("held.profile", {
  async sender(ctx, subjectId) {
    return (await editRow(ctx, subjectId))?.artisanId ?? null;
  },
  async release(ctx, _admin, subjectId) {
    const edit = await editRow(ctx, subjectId);
    return [
      ctx.db
        .update(profileEdits)
        .set({ state: "released", releasedAt: ctx.now() })
        .where(and(eq(profileEdits.id, subjectId), eq(profileEdits.state, "held"))),
      // One sent since the Profile was taken out of view fixes it, which shows again (#136).
      ...(edit
        ? [
            ctx.db
              .update(accounts)
              .set({ profileOutOfViewSince: null, profileOutOfViewFor: null })
              .where(
                and(
                  eq(accounts.id, edit.artisanId),
                  lte(accounts.profileOutOfViewSince, edit.sentAt),
                ),
              ),
          ]
        : []),
    ];
  },
  async refuse(ctx, _admin, subjectId) {
    return [
      ctx.db
        .update(profileEdits)
        .set({ state: "refused" })
        .where(and(eq(profileEdits.id, subjectId), eq(profileEdits.state, "held"))),
    ];
  },
  told: {
    released: "Your Profile edit is accepted and shown",
    refused: "Your Profile edit was refused",
    link: "/profile",
  },
  async view(ctx, item) {
    const edit = await editRow(ctx, item.subjectId);
    if (!edit) return { tabs: [], sidebar: [] };
    const shown = await shownVersion(ctx, edit.artisanId);
    const shownIds = new Set(shown.photos.map((photo) => photo.id));
    return {
      tabs: [
        {
          key: "edit",
          label: "The edit",
          blocks: versionBlocks(edit.artisanId, edit, (photo) => !shownIds.has(photo.id)),
        },
        { key: "shown", label: "Shown now", blocks: versionBlocks(edit.artisanId, shown) },
        {
          key: "check",
          label: "Content check",
          blocks: [
            {
              kind: "text",
              text:
                edit.heldFor ??
                "The Content check found nothing. Every Profile edit waits for the Admin.",
            },
          ],
        },
      ],
      sidebar: [
        {
          title: "Artisan",
          blocks: [
            {
              kind: "facts",
              facts: [
                { label: "Name", value: edit.name },
                { label: "Trading name", value: edit.tradingName ?? "None" },
                { label: "Email", value: edit.email },
              ],
            },
          ],
        },
      ],
    };
  },
});
