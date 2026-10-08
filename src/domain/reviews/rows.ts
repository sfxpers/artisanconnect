import { and, desc, eq, exists, inArray, lte, ne, or, sql, type SQLWrapper } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { clientShownName, publicName } from "../accounts/names";
import type { Context } from "../context";
import { accounts, engagements, jobs, reviews, REVIEW_GROUNDS } from "../schema";
import { SERVICE_CATEGORY_NAMES } from "../service-categories";
import { REVIEW_WINDOW_MS } from "./window";

// Reading Reviews (#138). Neither party reads the other's until both have
// written or the seven days have passed, and nobody reads one the Admin has
// not published: so a Review is shown, to the other party and to anyone else
// who may read it, once it is published and revealed.

export type ReviewRow = typeof reviews.$inferSelect;

export type ReviewGround = (typeof REVIEW_GROUNDS)[number];

export const REVIEW_GROUND_NAMES: Record<ReviewGround, string> = {
  fraud: "Fraud",
  abuse: "Abuse",
  "personal-data": "Personal data",
};

/** How many Reviews a list shows at a time. */
export const REVIEWS_PAGE = 20;

/** The Review with its Engagement's parties, Job, and when it was Completed; null if none. */
export async function reviewRow(ctx: Context, reviewId: string) {
  const [row] = await ctx.db
    .select({
      review: reviews,
      clientId: engagements.clientId,
      artisanId: engagements.artisanId,
      completedAt: engagements.completedAt,
      jobId: jobs.id,
      jobTitle: jobs.title,
    })
    .from(reviews)
    .innerJoin(engagements, eq(engagements.id, reviews.engagementId))
    .innerJoin(jobs, eq(jobs.id, engagements.jobId))
    .where(eq(reviews.id, reviewId));
  if (!row) return null;
  const { review, ...rest } = row;
  return { ...review, ...rest };
}

/** The Engagement's Reviews, whatever their state. */
export async function reviewsOn(ctx: Context, engagementId: string): Promise<ReviewRow[]> {
  return ctx.db.select().from(reviews).where(eq(reviews.engagementId, engagementId));
}

/**
 * The SQL that is true of a Review shown at `now`: published, and the other
 * party has written theirs or the window has closed. Join `engagements`.
 */
function shownAt(ctx: Context, now: Date) {
  const other = alias(reviews, "other_review");
  return and(
    eq(reviews.state, "published"),
    or(
      exists(
        ctx.db
          .select({ one: sql`1` })
          .from(other)
          .where(
            and(eq(other.engagementId, reviews.engagementId), ne(other.authorId, reviews.authorId)),
          ),
      ),
      lte(engagements.completedAt, new Date(now.getTime() - REVIEW_WINDOW_MS)),
    ),
  );
}

export type ReviewSummary = { average: number | null; count: number };

const NONE: ReviewSummary = { average: null, count: 0 };

/** The average and count of the Reviews shown at `now` of each of these Accounts, by id. */
export async function summariesOf(
  ctx: Context,
  reviewedIds: string[] | SQLWrapper,
  now = ctx.now(),
): Promise<{ get(id: string): ReviewSummary }> {
  const rows = await ctx.db
    .select({
      reviewedId: reviews.reviewedId,
      average: sql<number>`avg(${reviews.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(reviews)
    .innerJoin(engagements, eq(engagements.id, reviews.engagementId))
    .where(and(inArray(reviews.reviewedId, reviewedIds), shownAt(ctx, now)))
    .groupBy(reviews.reviewedId);
  const byId = new Map(rows.map(({ reviewedId, ...summary }) => [reviewedId, summary]));
  return { get: (id) => byId.get(id) ?? NONE };
}

/**
 * The Reviews shown now of the Account: one average and count, and a page of
 * 20 of them, newest first from page 0, each with its Job's Service Category
 * and the reviewer's shown name; and whether more follow.
 */
export async function reviewsShown(ctx: Context, reviewedId: string, page = 0) {
  // Read once, so the count and the page agree at the window's close.
  const now = ctx.now();
  const [summaries, rows] = await Promise.all([
    summariesOf(ctx, [reviewedId], now),
    pageAt(ctx, reviewedId, page, now),
  ]);
  return {
    ...summaries.get(reviewedId),
    items: rows
      .slice(0, REVIEWS_PAGE)
      .map(({ category, name, tradingName, namesShown, kind, ...review }) => ({
        ...review,
        category: category && { id: category, name: SERVICE_CATEGORY_NAMES[category] },
        // Names the Content check has not passed are nobody else's to see.
        reviewer: namesShown ? shownName(kind, { name, tradingName }) : null,
      })),
    more: rows.length > REVIEWS_PAGE,
  };
}

/** The rows of a page of the Reviews shown at `now`, with one more if more follow. */
async function pageAt(ctx: Context, reviewedId: string, page: number, now: Date) {
  return ctx.db
    .select({
      reviewId: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      writtenAt: reviews.writtenAt,
      category: jobs.category,
      name: accounts.name,
      tradingName: accounts.tradingName,
      namesShown: accounts.namesShown,
      kind: accounts.kind,
    })
    .from(reviews)
    .innerJoin(engagements, eq(engagements.id, reviews.engagementId))
    .innerJoin(jobs, eq(jobs.id, engagements.jobId))
    .innerJoin(accounts, eq(accounts.id, reviews.authorId))
    .where(and(eq(reviews.reviewedId, reviewedId), shownAt(ctx, now)))
    .orderBy(desc(reviews.writtenAt), desc(sql.raw(`"reviews"."rowid"`)))
    .limit(REVIEWS_PAGE + 1)
    .offset((Number.isInteger(page) && page > 0 ? page : 0) * REVIEWS_PAGE);
}

/** How an Account appears to others: a Client by first name and initial, an Artisan by public name. */
export function shownName(
  kind: "client" | "artisan",
  names: { name: string; tradingName: string | null },
) {
  return kind === "client" ? clientShownName(publicName(names)) : publicName(names);
}

/** How many Engagements each of these Accounts has Completed, as Client or Artisan, by id. */
export async function completedCounts(
  ctx: Context,
  side: "clientId" | "artisanId",
  accountIds: string[] | SQLWrapper,
): Promise<{ get(id: string): number }> {
  const rows = await ctx.db
    .select({ accountId: engagements[side], count: sql<number>`count(*)` })
    .from(engagements)
    .where(and(inArray(engagements[side], accountIds), eq(engagements.state, "completed")))
    .groupBy(engagements[side]);
  const byId = new Map(rows.map((row) => [row.accountId, row.count]));
  return { get: (id) => byId.get(id) ?? 0 };
}

/** Whether the Review is shown now, to the other party and anyone else who may read it. */
export async function isShown(ctx: Context, reviewId: string): Promise<boolean> {
  const [row] = await ctx.db
    .select({ id: reviews.id })
    .from(reviews)
    .innerJoin(engagements, eq(engagements.id, reviews.engagementId))
    .where(and(eq(reviews.id, reviewId), shownAt(ctx, ctx.now())));
  return !!row;
}
