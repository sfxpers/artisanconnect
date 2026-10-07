import { and, eq, exists, sql } from "drizzle-orm";
import { accounts, authUsers, quotes } from "../schema";
import { startClock } from "../clocks";
import type { Context, Write } from "../context";
import { defineHeldKind, refusedFor } from "../content/held";
import { artisanRecordBlocks } from "../engagements/record";
import { quoteSentWrites } from "../conversations/rows";
import { jobBlocks } from "../jobs/held";
import { jobRow } from "../jobs/rows";
import { formatRands } from "../money";
import type { Block } from "../queues";
import { formatDay } from "../sa-days";
import { SERVICE_CATEGORY_NAMES } from "../service-categories";
import { tellWhile } from "../tells";
import type { QuoteVersion } from "./revisions";
import { EXPIRY_CLOCK, expiryOf, quoteRow, quoteText, takesQuotes, takesQuotesNow } from "./rows";
import { sendingProblem } from "./rules";

// A Quote the Content check is unsure about, or cannot read, is Held (ADR
// 0020): it is not Sent, takes none of the Job's five, and starts no clock
// until the Admin releases it. Released while the Job still takes it, and
// while what sending needs still holds, it is Sent then; otherwise it is
// unsent. Refused, its Artisan may send another.

export const heldQuote = defineHeldKind("held.quote", {
  async sender(ctx, subjectId) {
    return (await quoteRow(ctx, subjectId))?.artisanId ?? null;
  },
  async release(ctx, _admin, subjectId) {
    const quote = await quoteRow(ctx, subjectId);
    const job = quote && (await jobRow(ctx, quote.jobId));
    if (!quote || !job) return [];
    // Released is when it is Sent, so what sending needs is asked again now.
    if (await sendingProblem(ctx, quote.artisanId, job, quote.startOn)) {
      return [unsentWrite(ctx, quote.id)];
    }
    return sendHeldWrites(ctx, quote, job);
  },
  async refuse(ctx, _admin, subjectId) {
    return [
      ctx.db
        .update(quotes)
        .set({ state: "refused" })
        .where(and(eq(quotes.id, subjectId), eq(quotes.state, "held"))),
    ];
  },
  told: {
    async released(ctx, subjectId) {
      const quote = await quoteRow(ctx, subjectId);
      const job = quote && (await jobRow(ctx, quote.jobId));
      if (!quote || !job) return "Your Quote is checked";
      const problem = await sendingProblem(ctx, quote.artisanId, job, quote.startOn);
      if (problem === "start-passed") return "Your Quote is checked, but its start date has passed";
      if (problem === "not-verified") {
        return `Your Quote is checked, but you are no longer verified for ${job.category ? SERVICE_CATEGORY_NAMES[job.category] : "its trade"}`;
      }
      return (await takesQuotesNow(ctx, quote.jobId))
        ? "Your Quote is checked and Sent"
        : "Your Quote is checked, but the Job takes no more Quotes";
    },
    refused: "Your Quote was refused",
    async link(ctx, subjectId) {
      return `/jobs/${(await quoteRow(ctx, subjectId))?.jobId ?? ""}`;
    },
  },
  async view(ctx, item) {
    const quote = await quoteRow(ctx, item.subjectId);
    const job = quote && (await jobRow(ctx, quote.jobId));
    if (!quote || !job) return { tabs: [], sidebar: [] };
    return {
      tabs: [
        { key: "quote", label: "The Quote", blocks: quoteBlocks(quote) },
        { key: "job", label: "The Job", blocks: jobBlocks(job) },
        {
          key: "check",
          label: "Content check",
          blocks: [{ kind: "text", text: quote.heldFor ?? "The Content check could not run." }],
        },
      ],
      sidebar: await accountSidebar(ctx, quote.artisanId),
    };
  },
});

/**
 * The writes that Send a Held Quote if the Job still takes it, with its
 * expiry clock and the Client's Tell; otherwise it is unsent. Each is guarded
 * on its still being Held, so it ends one way or the other.
 */
function sendHeldWrites(
  ctx: Context,
  quote: { id: string; jobId: string; artisanId: string },
  job: { clientId: string; title: string },
): Write[] {
  const now = ctx.now();
  const expiresAt = expiryOf(now);
  const held = and(eq(quotes.id, quote.id), eq(quotes.state, "held"));
  return [
    ctx.db
      .update(quotes)
      .set({ state: "sent", sentAt: now, expiresAt })
      .where(and(held, takesQuotes(ctx, quote.jobId))),
    unsentWrite(ctx, quote.id),
    // One for a Quote that was not Sent does nothing when it fires.
    startClock(ctx, { kind: EXPIRY_CLOCK, subjectId: quote.id, dueAt: expiresAt }),
    ...quoteSentWrites(ctx, quote),
    ...tellWhile(
      ctx,
      { kind: "system" },
      [job.clientId],
      { event: "quote.sent", title: `New Quote on ${job.title}`, link: `/jobs/${quote.jobId}` },
      exists(
        ctx.db
          .select({ one: sql`1` })
          .from(quotes)
          .where(and(eq(quotes.id, quote.id), eq(quotes.state, "sent"), eq(quotes.sentAt, now))),
      ),
    ),
  ];
}

/** The write that leaves a Held Quote unsent, if it is still Held. */
function unsentWrite(ctx: Context, quoteId: string) {
  return ctx.db
    .update(quotes)
    .set({ state: "unsent" })
    .where(and(eq(quotes.id, quoteId), eq(quotes.state, "held")));
}

/** Why the Admin refused the Quote, if it is a refused one. */
export async function refusalOf(ctx: Context, quote: { id: string; state: string }) {
  if (quote.state !== "refused") return null;
  return (await refusedFor(ctx, heldQuote.kind, quote.id)) ?? "";
}

const MATERIALS_BY_NAMES = {
  artisan: "The Artisan",
  client: "The Client",
  both: "Both",
} as const;

/** What the Admin reads of a Quote, or of a revision of one. */
export function quoteBlocks(quote: QuoteVersion): Block[] {
  return [
    {
      kind: "facts",
      facts: [
        { label: "Labour", value: formatRands(quote.labourCents) },
        { label: "Materials", value: formatRands(quote.materialsCents) },
        { label: "Total", value: formatRands(quote.labourCents + quote.materialsCents) },
        { label: "Materials supplied by", value: MATERIALS_BY_NAMES[quote.materialsBy] },
        { label: "Start", value: formatDay(quote.startOn) },
        { label: "Duration", value: `${quote.durationDays} days` },
        { label: "VAT number", value: quote.vatNumber ?? "Not VAT-registered" },
      ],
    },
    { kind: "text", text: quoteText(quote) },
  ];
}

/**
 * Who sent the item, for the Admin: an Artisan, unless titled otherwise. An
 * Artisan's Artisan record follows (#133).
 */
export async function accountSidebar(ctx: Context, accountId: string, title = "Artisan") {
  const [account] = await ctx.db
    .select({ name: accounts.name, email: authUsers.email, kind: accounts.kind })
    .from(accounts)
    .innerJoin(authUsers, eq(authUsers.id, accounts.id))
    .where(eq(accounts.id, accountId));
  return [
    {
      title,
      blocks: [
        {
          kind: "facts" as const,
          facts: [
            { label: "Name", value: account?.name ?? "" },
            { label: "Email", value: account?.email ?? "" },
          ],
        },
      ] as Block[],
    },
    ...(account?.kind === "artisan"
      ? [{ title: "Artisan record", blocks: await artisanRecordBlocks(ctx, accountId) }]
      : []),
  ];
}

/** The writes that Hold a Quote for the Admin's Pre-check. */
export function holdWrites(ctx: Context, quote: typeof quotes.$inferInsert, jobTitle: string) {
  return [
    ctx.db.insert(quotes).values(quote),
    heldQuote.raise(ctx, { subjectId: quote.id!, title: `Quote: ${jobTitle}` }).write,
  ];
}

/** The writes that withdraw a Held Quote, guarded on its still being Held. */
export async function withdrawHeldQuote(ctx: Context, quoteId: string): Promise<Write[]> {
  return [unsentWrite(ctx, quoteId), ...(await heldQuote.withdraw(ctx, quoteId))];
}
