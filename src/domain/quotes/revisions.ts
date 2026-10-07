import { and, desc, eq, exists, sql } from "drizzle-orm";
import type { Actor } from "../actor";
import type { Context, Write } from "../context";
import { defineHeldKind } from "../content/held";
import { jobRow } from "../jobs/rows";
import { queueItems, quoteRevisions, quotes } from "../schema";
import { tellWhile } from "../tells";
import { accountSidebar, quoteBlocks } from "./held";
import { quoteRow, type QuoteRow } from "./rows";
import { startPassed } from "./rules";

// While it is Sent a Quote may be revised: its scope, amounts, dates, and
// Warranty change, and its 14 days do not restart. Each revision is read by
// the Content check; one it is unsure about waits for the Admin's Pre-check
// (ADR 0020), and the Quote shows as it was meanwhile.

/** What a revision gives: the whole Quote again. */
export type QuoteVersion = Pick<
  QuoteRow,
  | "scope"
  | "labourCents"
  | "materialsCents"
  | "materialsBy"
  | "startOn"
  | "durationDays"
  | "warranty"
  | "vatNumber"
>;

/** Only a version's own fields, of a Quote or a revision row. */
export function versionOf(quote: QuoteVersion): QuoteVersion {
  const { scope, labourCents, materialsCents, materialsBy, startOn, durationDays } = quote;
  const { warranty, vatNumber } = quote;
  return {
    scope,
    labourCents,
    materialsCents,
    materialsBy,
    startOn,
    durationDays,
    warranty,
    vatNumber,
  };
}

/** Whether two versions of a Quote say the same. */
export function sameVersion(a: QuoteVersion, b: QuoteVersion) {
  const left = versionOf(a);
  const right = versionOf(b);
  return (Object.keys(left) as (keyof QuoteVersion)[]).every((key) => left[key] === right[key]);
}

/**
 * The writes that show a version on the Quote while it is Sent, and tell the
 * Client it was revised, only if it was. The first returns the Quote's id if
 * it was revised.
 */
function showWrites(
  ctx: Context,
  actor: Actor,
  quote: { id: string; jobId: string },
  job: { clientId: string; title: string },
  version: QuoteVersion,
) {
  const now = ctx.now();
  return [
    ctx.db
      .update(quotes)
      .set({ ...versionOf(version), revisedAt: now })
      .where(and(eq(quotes.id, quote.id), eq(quotes.state, "sent")))
      .returning({ id: quotes.id }),
    ...tellWhile(
      ctx,
      actor,
      [job.clientId],
      {
        event: "quote.revised",
        title: `A Quote was revised: ${job.title}`,
        link: `/jobs/${quote.jobId}`,
      },
      exists(
        ctx.db
          .select({ one: sql`1` })
          .from(quotes)
          .where(and(eq(quotes.id, quote.id), eq(quotes.revisedAt, now))),
      ),
    ),
  ] as const;
}

/**
 * The writes that show a revision the Content check cleared, and keep it as
 * history. The first returns the Quote's id if it was revised.
 */
export function applyWrites(
  ctx: Context,
  actor: Actor,
  quote: { id: string; jobId: string },
  job: { clientId: string; title: string },
  version: QuoteVersion,
) {
  const [shown, ...told] = showWrites(ctx, actor, quote, job, version);
  return [
    shown,
    ctx.db.insert(quoteRevisions).values({
      id: ctx.newId(),
      quoteId: quote.id,
      ...versionOf(version),
      state: "released",
      sentAt: ctx.now(),
    }),
    ...told,
  ] as const;
}

/** The writes that Hold a revision for the Admin's Pre-check. */
export function holdRevisionWrites(
  ctx: Context,
  quote: { id: string },
  jobTitle: string,
  version: QuoteVersion,
  heldFor: string,
): Write[] {
  const id = ctx.newId();
  return [
    ctx.db.insert(quoteRevisions).values({
      id,
      quoteId: quote.id,
      ...versionOf(version),
      state: "held",
      heldFor,
      sentAt: ctx.now(),
    }),
    heldRevision.raise(ctx, { subjectId: id, title: `Quote revision: ${jobTitle}` }).write,
  ];
}

/**
 * Where the Quote's revisions stand, from the newest: being checked, which
 * only its Artisan and the Admin see, or refused, with the Admin's reason.
 */
export async function revisionsStanding(ctx: Context, quoteId: string) {
  const [newest] = await ctx.db
    .select({ revision: quoteRevisions, reason: queueItems.reason })
    .from(quoteRevisions)
    .leftJoin(
      queueItems,
      and(eq(queueItems.subjectId, quoteRevisions.id), eq(queueItems.kind, heldRevision.kind)),
    )
    .where(eq(quoteRevisions.quoteId, quoteId))
    .orderBy(desc(quoteRevisions.sentAt), desc(sql.raw(`"quote_revisions"."rowid"`)))
    .limit(1);
  const state = newest?.revision.state;
  if (state !== "held" && state !== "refused") return { beingChecked: null, refused: null };
  const revision = { id: newest!.revision.id, ...versionOf(newest!.revision) };
  return state === "held"
    ? { beingChecked: revision, refused: null }
    : { beingChecked: null, refused: { ...revision, reason: newest!.reason ?? "" } };
}

/** The writes that withdraw the Quote's Held revision, if it has one. */
export async function withdrawRevisionWrites(ctx: Context, quoteId: string): Promise<Write[]> {
  const { beingChecked } = await revisionsStanding(ctx, quoteId);
  if (!beingChecked) return [];
  return [
    ctx.db
      .update(quoteRevisions)
      .set({ state: "withdrawn" })
      .where(and(eq(quoteRevisions.id, beingChecked.id), eq(quoteRevisions.state, "held"))),
    ...(await heldRevision.withdraw(ctx, beingChecked.id)),
  ];
}

async function revisionRow(ctx: Context, revisionId: string) {
  const [row] = await ctx.db.select().from(quoteRevisions).where(eq(quoteRevisions.id, revisionId));
  return row ?? null;
}

export const heldRevision = defineHeldKind("held.quote-revision", {
  async sender(ctx, subjectId) {
    const revision = await revisionRow(ctx, subjectId);
    return (revision && (await quoteRow(ctx, revision.quoteId))?.artisanId) ?? null;
  },
  async release(ctx, admin, subjectId) {
    const revision = await revisionRow(ctx, subjectId);
    const quote = revision && (await quoteRow(ctx, revision.quoteId));
    const job = quote && (await jobRow(ctx, quote.jobId));
    if (!revision || !quote || !job) return [];
    return [
      ctx.db
        .update(quoteRevisions)
        .set({ state: "released" })
        .where(and(eq(quoteRevisions.id, subjectId), eq(quoteRevisions.state, "held"))),
      // A Quote ended meanwhile is not revised, and the Client is told
      // nothing; nor is one whose start date has passed while it waited.
      ...(startPassed(ctx, revision.startOn) ? [] : showWrites(ctx, admin, quote, job, revision)),
    ];
  },
  async refuse(ctx, _admin, subjectId) {
    return [
      ctx.db
        .update(quoteRevisions)
        .set({ state: "refused" })
        .where(and(eq(quoteRevisions.id, subjectId), eq(quoteRevisions.state, "held"))),
    ];
  },
  told: {
    async released(ctx, subjectId) {
      const revision = await revisionRow(ctx, subjectId);
      return revision && startPassed(ctx, revision.startOn)
        ? "Your Quote revision is checked, but its start date has passed"
        : "Your Quote revision is checked and shown";
    },
    refused: "Your Quote revision was refused",
    async link(ctx, subjectId) {
      const revision = await revisionRow(ctx, subjectId);
      const quote = revision && (await quoteRow(ctx, revision.quoteId));
      return `/jobs/${quote?.jobId ?? ""}`;
    },
  },
  async view(ctx, item) {
    const revision = await revisionRow(ctx, item.subjectId);
    const quote = revision && (await quoteRow(ctx, revision.quoteId));
    if (!revision || !quote) return { tabs: [], sidebar: [] };
    return {
      tabs: [
        { key: "revision", label: "The revision", blocks: quoteBlocks(revision) },
        { key: "shown", label: "Shown now", blocks: quoteBlocks(quote) },
        {
          key: "check",
          label: "Content check",
          blocks: [{ kind: "text", text: revision.heldFor ?? "The Content check could not run." }],
        },
      ],
      sidebar: await accountSidebar(ctx, quote.artisanId),
    };
  },
});
