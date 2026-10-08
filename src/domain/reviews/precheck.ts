import { and, eq, exists, sql } from "drizzle-orm";
import type { AdminActor } from "../actor";
import type { Context, Write } from "../context";
import { jobBlocks } from "../jobs/held";
import { jobRow } from "../jobs/rows";
import { defineQueueItemKind, type Block, type DecisionOption } from "../queues";
import { accountSidebar } from "../quotes/held";
import { ok } from "../result";
import { formatTime } from "../sa-days";
import { reviews, REVIEW_GROUNDS } from "../schema";
import { tellWhile } from "../tells";
import { REVIEW_GROUND_NAMES, reviewRow, type ReviewGround } from "./rows";

// Every Review waits in the Pre-checks queue (ADR 0020), whatever the Content
// check made of its comment, with no time limit: one written inside the
// window publishes on approval even after it closes. The Admin refuses one
// only for fraud, abuse, or personal data, never for a low rating, and the
// author is told the decision. Nobody else is told.

/** The decisions that end a Review on a ground, by their key, with a prefix: `refuse.fraud`, … */
export function groundDecisions(prefix: string, label: string): Record<string, DecisionOption> {
  return Object.fromEntries(
    REVIEW_GROUNDS.map((ground) => [
      `${prefix}.${ground}`,
      {
        label: `${label}: ${REVIEW_GROUND_NAMES[ground].toLowerCase()}`,
        told: "The author, with the ground",
        reason: "optional",
        reasonLabel: "Note for the author",
      },
    ]),
  );
}

/** The ground a decision made by `groundDecisions` names; null for any other. */
export function groundOf(prefix: string, decision: string): ReviewGround | null {
  const ground = decision.slice(prefix.length + 1);
  return decision.startsWith(`${prefix}.`) && (REVIEW_GROUNDS as readonly string[]).includes(ground)
    ? (ground as ReviewGround)
    : null;
}

/**
 * The writes that end a Review on a ground, from the state it was read in,
 * telling its author; each only while it ends by this batch.
 */
export async function endWrites(
  ctx: Context,
  admin: AdminActor,
  reviewId: string,
  end: { from: "held"; to: "refused" } | { from: "published"; to: "removed" },
  ground: ReviewGround,
  note: string | null,
): Promise<Write[]> {
  const review = await reviewRow(ctx, reviewId);
  if (!review) return [];
  const now = ctx.now();
  const endedNow = exists(
    ctx.db
      .select({ one: sql`1` })
      .from(reviews)
      .where(and(eq(reviews.id, reviewId), eq(reviews.state, end.to), eq(reviews.decidedAt, now))),
  );
  return [
    ctx.db
      .update(reviews)
      .set({ state: end.to, decidedAt: now, ground, groundNote: note })
      .where(and(eq(reviews.id, reviewId), eq(reviews.state, end.from))),
    ...tellWhile(
      ctx,
      admin,
      [review.authorId],
      {
        event: `review.${end.to}`,
        // A Tell carries no text of the Admin's: the note shows on the Job.
        title: `Your Review was ${end.to} for ${REVIEW_GROUND_NAMES[ground].toLowerCase()}: ${review.jobTitle}`,
        link: `/jobs/${review.jobId}`,
      },
      endedNow,
    ),
  ];
}

const REFUSE = "refuse";

export const heldReview = defineQueueItemKind("held.review", {
  queue: "pre-checks",
  decisions: {
    publish: { label: "Publish", told: "The author", reason: "none" },
    ...groundDecisions(REFUSE, "Refuse"),
  },
  async decide(ctx, admin, item, choice) {
    const ground = groundOf(REFUSE, choice.decision);
    if (ground) {
      return ok(
        await endWrites(
          ctx,
          admin,
          item.subjectId,
          { from: "held", to: "refused" },
          ground,
          choice.reason,
        ),
      );
    }
    const review = await reviewRow(ctx, item.subjectId);
    if (!review) return ok([]);
    const now = ctx.now();
    return ok([
      ctx.db
        .update(reviews)
        .set({ state: "published", decidedAt: now })
        .where(and(eq(reviews.id, review.id), eq(reviews.state, "held"))),
      ...tellWhile(
        ctx,
        admin,
        [review.authorId],
        {
          event: "review.published",
          title: `Your Review is checked and published: ${review.jobTitle}`,
          link: `/jobs/${review.jobId}`,
        },
        exists(
          ctx.db
            .select({ one: sql`1` })
            .from(reviews)
            .where(
              and(
                eq(reviews.id, review.id),
                eq(reviews.state, "published"),
                eq(reviews.decidedAt, now),
              ),
            ),
        ),
      ),
    ]);
  },
  async view(ctx, item) {
    const review = await reviewRow(ctx, item.subjectId);
    const job = review && (await jobRow(ctx, review.jobId));
    if (!review || !job) return { tabs: [], sidebar: [] };
    const [author, reviewed] = await Promise.all([
      accountSidebar(ctx, review.authorId, "Author"),
      accountSidebar(ctx, review.reviewedId, "Reviewed"),
    ]);
    return {
      tabs: [
        { key: "review", label: "The Review", blocks: reviewBlocks(review) },
        {
          key: "check",
          label: "Content check",
          blocks: [
            {
              kind: "text",
              text:
                review.commentHeldFor ??
                "The Content check found nothing. Every Review waits for the Admin, who refuses one only for fraud, abuse, or personal data, never for a low rating.",
            },
          ],
        },
        { key: "job", label: "The Job", blocks: jobBlocks(job) },
      ],
      sidebar: [...author, ...reviewed],
    };
  },
});

/** A Review as the Admin reads it. */
export function reviewBlocks(review: {
  rating: number;
  comment: string | null;
  writtenAt: Date;
}): Block[] {
  return [
    {
      kind: "facts",
      facts: [
        { label: "Rating", value: `${review.rating} out of 5` },
        { label: "Written", value: formatTime(review.writtenAt) },
      ],
    },
    { kind: "text", text: review.comment ?? "No comment." },
  ];
}
