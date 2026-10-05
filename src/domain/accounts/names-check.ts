import { and, desc, eq, exists, isNull, sql, type SQL } from "drizzle-orm";
import type { Context, Write } from "../context";
import { checkContent } from "../content/check";
import { defineHeldKind } from "../content/held";
import { accounts, authUsers, namesSent, queueItems } from "../schema";

// An Account's names and trading name go through the Content check like
// everything else sent (#116), so a name cannot carry contact details. Names
// the check is sure about are refused at once; names it is unsure about are
// Held: the Account keeps them, and nobody else sees them until the Admin
// releases them. A change of an Artisan's names is Held even when clear, as
// they head the Artisan Profile, every edit of which waits for the Admin (#120).

export type Names = { name: string; tradingName: string | null };

/** Checks names as everything before Payment is checked. */
export function checkNames(ctx: Context, names: Names) {
  return checkContent(ctx, {
    text: [names.name, names.tradingName].filter(Boolean).join("\n"),
    context: { kind: "before-payment" },
  });
}

/** The writes that make these the names shown, and record them as sent. */
export function showNames(ctx: Context, accountId: string, names: Names): Write[] {
  return [
    ctx.db.insert(namesSent).values({
      id: ctx.newId(),
      accountId,
      ...names,
      state: "shown",
      sentAt: ctx.now(),
    }),
    ...setNames(ctx, accountId, names),
  ];
}

/** The writes that make these the names shown, if `when` holds as they run. */
function setNames(ctx: Context, accountId: string, names: Names, when?: SQL): Write[] {
  return [
    ctx.db
      .update(accounts)
      .set({ name: names.name, tradingName: names.tradingName, namesShown: true })
      .where(and(eq(accounts.id, accountId), when)),
    ctx.db
      .update(authUsers)
      .set({ name: names.name })
      .where(and(eq(authUsers.id, accountId), when)),
  ];
}

/** The write that Holds names; raise them with `raiseHeldNames` once the Account exists. */
export function holdNames(
  ctx: Context,
  accountId: string,
  names: Names,
  heldFor: string | null,
): { write: Write; id: string } {
  const id = ctx.newId();
  return {
    id,
    write: ctx.db
      .insert(namesSent)
      .values({ id, accountId, ...names, state: "held", heldFor, sentAt: ctx.now() }),
  };
}

function namesTitle(names: Names) {
  return `Names: ${names.name}${names.tradingName ? ` (${names.tradingName})` : ""}`;
}

/** The write that puts Held names in the Pre-checks queue. */
export function raiseNames(ctx: Context, held: { id: string } & Names): Write {
  return heldNames.raise(ctx, { subjectId: held.id, title: namesTitle(held) }).write;
}

/**
 * Puts the Account's Held names in the Pre-checks queue, if they are not
 * there yet: names given at sign-up wait until the Email is proven, so a
 * sign-up nobody finishes never reaches the Admin.
 */
export async function raiseHeldNames(ctx: Context, accountId: string): Promise<void> {
  const unraised = await ctx.db
    .select({ id: namesSent.id, name: namesSent.name, tradingName: namesSent.tradingName })
    .from(namesSent)
    .leftJoin(
      queueItems,
      and(eq(queueItems.subjectId, namesSent.id), eq(queueItems.kind, heldNames.kind)),
    )
    .where(
      and(eq(namesSent.accountId, accountId), eq(namesSent.state, "held"), isNull(queueItems.id)),
    );
  await ctx.commit(unraised.map((held) => raiseNames(ctx, held)));
}

/** The Account's Held names, if it has any. */
export async function heldNamesOf(ctx: Context, accountId: string) {
  const [held] = await ctx.db
    .select({ id: namesSent.id })
    .from(namesSent)
    .where(and(eq(namesSent.accountId, accountId), eq(namesSent.state, "held")));
  return held ?? null;
}

/** Where the Account's names stand, from the newest names it gave. */
export async function namesStanding(ctx: Context, accountId: string) {
  const [newest] = await ctx.db
    .select({
      name: namesSent.name,
      tradingName: namesSent.tradingName,
      state: namesSent.state,
      reason: queueItems.reason,
    })
    .from(namesSent)
    .leftJoin(
      queueItems,
      and(eq(queueItems.subjectId, namesSent.id), eq(queueItems.kind, heldNames.kind)),
    )
    .where(eq(namesSent.accountId, accountId))
    // Names given in the same millisecond are in the order they were written.
    .orderBy(desc(namesSent.sentAt), desc(sql.raw(`"names_sent"."rowid"`)))
    .limit(1);
  if (newest?.state === "held") {
    return { beingChecked: { name: newest.name, tradingName: newest.tradingName }, refused: null };
  }
  if (newest?.state === "refused") {
    return {
      beingChecked: null,
      refused: { name: newest.name, tradingName: newest.tradingName, reason: newest.reason ?? "" },
    };
  }
  return { beingChecked: null, refused: null };
}

/** The writes that withdraw the Account's Held names, guarded on their still being Held. */
export async function withdrawNames(ctx: Context, heldId: string): Promise<Write[]> {
  return [
    ctx.db
      .update(namesSent)
      .set({ state: "withdrawn" })
      .where(and(eq(namesSent.id, heldId), eq(namesSent.state, "held"))),
    ...(await heldNames.withdraw(ctx, heldId)),
  ];
}

async function heldRow(ctx: Context, id: string) {
  const [row] = await ctx.db
    .select({
      id: namesSent.id,
      accountId: namesSent.accountId,
      name: namesSent.name,
      tradingName: namesSent.tradingName,
      state: namesSent.state,
      heldFor: namesSent.heldFor,
      kind: accounts.kind,
      email: authUsers.email,
      signedUpAt: accounts.signedUpAt,
    })
    .from(namesSent)
    .innerJoin(accounts, eq(accounts.id, namesSent.accountId))
    .innerJoin(authUsers, eq(authUsers.id, namesSent.accountId))
    .where(eq(namesSent.id, id));
  return row ?? null;
}

export const heldNames = defineHeldKind("held.names", {
  async sender(ctx, subjectId) {
    return (await heldRow(ctx, subjectId))?.accountId ?? null;
  },
  async release(ctx, _admin, subjectId) {
    const held = await heldRow(ctx, subjectId);
    if (held?.state !== "held") return [];
    // Shown only if this batch is what released them, so a withdrawal landing first leaves them unshown.
    const released = exists(
      ctx.db
        .select({ one: sql`1` })
        .from(namesSent)
        .where(and(eq(namesSent.id, held.id), eq(namesSent.state, "released"))),
    );
    return [
      ctx.db
        .update(namesSent)
        .set({ state: "released" })
        .where(and(eq(namesSent.id, held.id), eq(namesSent.state, "held"))),
      ...setNames(ctx, held.accountId, held, released),
    ];
  },
  async refuse(ctx, _admin, subjectId) {
    return [
      ctx.db
        .update(namesSent)
        .set({ state: "refused" })
        .where(and(eq(namesSent.id, subjectId), eq(namesSent.state, "held"))),
    ];
  },
  told: {
    released: "Your names are checked and shown",
    refused: "Your names were refused",
    link: "/account",
  },
  async view(ctx, item) {
    const held = await heldRow(ctx, item.subjectId);
    if (!held) return { tabs: [], sidebar: [] };
    return {
      tabs: [
        {
          key: "names",
          label: "Names",
          blocks: [
            {
              kind: "facts",
              facts: [
                { label: "Name", value: held.name },
                { label: "Trading name", value: held.tradingName ?? "None" },
              ],
            },
          ],
        },
        {
          key: "check",
          label: "Content check",
          blocks: [
            {
              kind: "text",
              text:
                held.heldFor ??
                "The Content check found nothing. An Artisan's names head their Profile, so every change waits for the Admin.",
            },
          ],
        },
      ],
      sidebar: [
        {
          title: "Account",
          blocks: [
            {
              kind: "facts",
              facts: [
                { label: "Kind", value: held.kind === "client" ? "Client" : "Artisan" },
                { label: "Email", value: held.email },
              ],
            },
          ],
        },
      ],
    };
  },
});
