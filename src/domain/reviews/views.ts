import type { Context } from "../context";
import { REVIEW_GROUND_NAMES, reviewsOn, type ReviewRow } from "./rows";
import { windowClosesAt } from "./window";

// The Reviews on an Engagement as one of its parties sees them on the Job
// page (#138): their own, from the moment it is written, and the other's once
// it is published and both have written or the window has closed.

const SHOWN_STATES = {
  held: "being-checked",
  published: "published",
  refused: "refused",
  removed: "removed",
} as const satisfies Record<ReviewRow["state"], string>;

/** The Engagement's Reviews as the party sees them; null until it is Completed. */
export async function engagementReviews(
  ctx: Context,
  engagement: { id: string; state: string; completedAt: Date | null },
  accountId: string,
) {
  if (engagement.state !== "completed" || !engagement.completedAt) return null;
  const written = await reviewsOn(ctx, engagement.id);
  const mine = written.find((review) => review.authorId === accountId) ?? null;
  const theirs = written.find((review) => review.authorId !== accountId) ?? null;
  const closesAt = windowClosesAt(engagement.completedAt);
  const open = ctx.now().getTime() < closesAt.getTime();
  const revealed = !!mine || !open;
  return {
    closesAt,
    /** Whether a Review may still be written: the party writes one, if it has not. */
    open,
    mine: mine && {
      rating: mine.rating,
      comment: mine.comment,
      state: SHOWN_STATES[mine.state],
      /** Why the Admin refused or removed it, with the Admin's note. */
      reason:
        mine.ground &&
        [REVIEW_GROUND_NAMES[mine.ground], mine.groundNote].filter(Boolean).join(": "),
      writtenAt: mine.writtenAt,
    },
    theirs:
      theirs?.state === "published" && revealed
        ? {
            reviewId: theirs.id,
            rating: theirs.rating,
            comment: theirs.comment,
            writtenAt: theirs.writtenAt,
          }
        : null,
  };
}
