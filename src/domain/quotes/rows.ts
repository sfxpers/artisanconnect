import { and, desc, eq, exists, inArray, sql, type SQLWrapper } from "drizzle-orm";
import type { Context } from "../context";
import { refuse } from "../result";
import { accounts, jobs, quotes } from "../schema";
import { QUOTE_DAYS, QUOTES_MAX } from "./inputs";

// Reading a Quote, and what more than one part of the Quotes section says of one.

export type QuoteRow = typeof quotes.$inferSelect;

/** The kind of the clock that Expires a Sent Quote. */
export const EXPIRY_CLOCK = "quote.expires";

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a Quote Sent now Expires. */
export function expiryOf(sentAt: Date): Date {
  return new Date(sentAt.getTime() + QUOTE_DAYS * DAY_MS);
}

/** The states of a Quote that was Sent: each counts toward its Job's five. */
export const COUNTED_STATES = ["sent", "declined", "withdrawn", "expired", "hired"] as const;

/**
 * The states of a Quote that is or was Sent, or is being checked: one its
 * Artisan may not send another beside. A refused or unsent one was never Sent.
 */
const LIVE_STATES = ["held", ...COUNTED_STATES] as const;

/** What the Content check reads of a Quote. */
export function quoteText(quote: { scope: string; warranty: string | null }) {
  return [quote.scope, quote.warranty].filter(Boolean).join("\n\n");
}

/** Whether a Quote is one its Artisan may not send another beside. */
export function isLive(quote: Pick<QuoteRow, "state"> | null): quote is QuoteRow {
  return !!quote && (LIVE_STATES as readonly string[]).includes(quote.state);
}

/** The Artisan's newest Quote on the Job, in any state; null if none. */
export async function newestQuote(ctx: Context, jobId: string, artisanId: string) {
  const [row] = await ctx.db
    .select()
    .from(quotes)
    .where(and(eq(quotes.jobId, jobId), eq(quotes.artisanId, artisanId)))
    .orderBy(desc(quotes.createdAt), desc(sql.raw(`"quotes"."rowid"`)))
    .limit(1);
  return row ?? null;
}

/** A Quote by its id; null if there is none. */
export async function quoteRow(ctx: Context, quoteId: string) {
  const [row] = await ctx.db.select().from(quotes).where(eq(quotes.id, quoteId));
  return row ?? null;
}

/**
 * The SQL that is true while the outer `jobs` row has fewer than five Quotes
 * Sent since it last opened, Declined, Withdrawn, and Expired ones counting.
 */
export function belowFive() {
  return sql`(select count(*) from ${quotes} where ${quotes.jobId} = ${jobs.id} and ${inArray(quotes.state, COUNTED_STATES)} and ${quotes.sentAt} >= ${jobs.openedAt}) < ${QUOTES_MAX}`;
}

/** The refusal of a Quote, or an Invitation, on a Job that has five Quotes. */
export function jobFull() {
  return refuse("full", "This Job has five Quotes and takes no more.");
}

/** The SQL that is true while the Job takes Quotes: Open, with fewer than five. */
export function takesQuotes(ctx: Context, jobId: SQLWrapper | string) {
  return exists(
    ctx.db
      .select({ one: sql`1` })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.state, "open"), belowFive())),
  );
}

/** Whether the Job takes Quotes now: Open, with fewer than five. */
export async function takesQuotesNow(ctx: Context, jobId: string): Promise<boolean> {
  const [row] = await ctx.db
    .select({ takes: sql<number>`${takesQuotes(ctx, jobId)}` })
    .from(sql`(select 1)`);
  return !!row?.takes;
}

/**
 * The Quote of the Artisan on the Job, each given as a value or a column, as
 * a subquery: one that is or was Sent, or is being checked. `notExists` it to
 * leave Quoted Artisans out.
 */
export function liveQuoteOf(ctx: Context, jobId: SQLWrapper | string, artisanId: SQLWrapper) {
  return ctx.db
    .select({ one: sql`1` })
    .from(quotes)
    .where(
      and(
        eq(quotes.jobId, jobId),
        eq(quotes.artisanId, artisanId),
        inArray(quotes.state, LIVE_STATES),
      ),
    );
}

/**
 * The Quotes ever Sent on the Job, given as a value or a column, as a
 * subquery: `notExists` it for a Job no Quote has locked yet.
 */
export function quotesSentOn(ctx: Context, jobId: SQLWrapper | string) {
  return ctx.db
    .select({ one: sql`1` })
    .from(quotes)
    .where(and(eq(quotes.jobId, jobId), inArray(quotes.state, COUNTED_STATES)));
}

/** Whether a Quote was ever Sent on the Job, which locks its edits. */
export async function hasHadQuote(ctx: Context, jobId: string): Promise<boolean> {
  const [row] = await quotesSentOn(ctx, jobId).limit(1);
  return !!row;
}

/** The Artisan's VAT number now, which a Quote carries when it is sent or revised. */
export async function vatNumberOf(ctx: Context, artisanId: string): Promise<string | null> {
  const [row] = await ctx.db
    .select({ vatNumber: accounts.vatNumber })
    .from(accounts)
    .where(eq(accounts.id, artisanId));
  return row?.vatNumber ?? null;
}
