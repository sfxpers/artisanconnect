import * as z from "zod";
import { inArray } from "drizzle-orm";
import { accountIdOf, type Actor } from "../actor";
import { firstProblem } from "../accounts/inputs";
import { publicName } from "../accounts/names";
import { checkContent } from "../content/check";
import { causedBy } from "../errors";
import { engagementRow } from "../engagements/rows";
import { seesJob } from "../jobs";
import { jobRow } from "../jobs/rows";
import { openableArtisan } from "../profiles";
import { ok, refuse } from "../result";
import { accounts, reviews } from "../schema";
import { defineSection } from "../section";
import { heldReview } from "./precheck";
import { reviewsOn, reviewsShown } from "./rows";
import { REVIEW_COMMENT_MAX } from "./inputs";
import { reviewClocks, windowClosesAt } from "./window";

// Reviews (#138, ADR 0012): once an Engagement is Completed, each party
// writes one Review of the other within seven days: a rating from 1 to 5 and
// an optional comment, never edited or withdrawn. Every Review waits for the
// Admin's Pre-check, and none is read by the other party until both have
// written or the seven days have passed.

const reviewInput = z.object({
  engagementId: z.string().min(1),
  rating: z
    .number({ error: "Choose a rating from 1 to 5." })
    .int({ error: "Choose a rating from 1 to 5." })
    .min(1, { error: "Choose a rating from 1 to 5." })
    .max(5, { error: "Choose a rating from 1 to 5." }),
  comment: z
    .string()
    .trim()
    .max(REVIEW_COMMENT_MAX, {
      error: `Keep the comment to ${REVIEW_COMMENT_MAX} characters.`,
    })
    .optional()
    .transform((comment) => comment || null),
});

export const reviewsSection = defineSection({
  name: "reviews",
  clocks: reviewClocks,
  queueItems: [heldReview],
  api: (ctx) => ({
    /**
     * Writes the party's one Review of the other on a Completed Engagement,
     * within seven days of its Completion. The comment is read by the Content
     * check: a sure hit is refused with the reason. Otherwise the Review
     * waits for the Admin, with what the check made of it.
     */
    async write(actor: Actor, input: { engagementId: string; rating: number; comment?: string }) {
      const accountId = accountIdOf(actor);
      if (!accountId) return refuse("parties-only", "Only a party to the Job writes its Review.");
      const parsed = reviewInput.safeParse(input);
      if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
      const { engagementId, rating, comment } = parsed.data;
      const engagement = await engagementRow(ctx, engagementId);
      const reviewedId =
        engagement?.clientId === accountId
          ? engagement.artisanId
          : engagement?.artisanId === accountId
            ? engagement.clientId
            : null;
      if (!engagement || !reviewedId) return refuse("not-found", "There is no such Job of yours.");
      if (engagement.state !== "completed" || !engagement.completedAt) {
        return refuse("not-completed", "A Review is written once the Job is Completed.");
      }
      // Read once, so a Review let in before the close is written before it.
      const now = ctx.now();
      if (now.getTime() >= windowClosesAt(engagement.completedAt).getTime()) {
        return refuse("window-closed", "The seven days to write a Review have passed.");
      }
      const written = await reviewsOn(ctx, engagement.id);
      if (written.some((review) => review.authorId === accountId)) return alreadyWritten();

      let commentHeldFor: string | null = null;
      if (comment) {
        // A Review may be read by anyone, so it never gives the Job's street.
        const job = await jobRow(ctx, engagement.jobId);
        const checked = await checkContent(ctx, {
          text: comment,
          context: { kind: "before-payment" },
          withheld: { street: job?.street ?? undefined },
          refusedOn: { accountId, jobId: engagement.jobId, what: "A Review" },
        });
        if (!checked.ok) return checked;
        if (checked.value.verdict === "held") commentHeldFor = checked.value.reason;
      }
      const names = await ctx.db
        .select({ id: accounts.id, name: accounts.name, tradingName: accounts.tradingName })
        .from(accounts)
        .where(inArray(accounts.id, [accountId, reviewedId]));
      const nameOf = (id: string) => {
        const row = names.find((each) => each.id === id);
        return row ? publicName(row) : "";
      };
      const id = ctx.newId();
      try {
        await ctx.commit([
          ctx.db.insert(reviews).values({
            id,
            engagementId: engagement.id,
            authorId: accountId,
            reviewedId,
            rating,
            comment,
            commentHeldFor,
            state: "held",
            writtenAt: now,
          }),
          heldReview.raise(ctx, {
            subjectId: id,
            title: `Review of ${nameOf(reviewedId)}, by ${nameOf(accountId)}`,
          }).write,
        ]);
      } catch (error) {
        if (causedBy(error, "UNIQUE constraint failed: reviews.engagement_id")) {
          return alreadyWritten();
        }
        throw error;
      }
      return ok({ state: "being-checked" as const });
    },

    /**
     * The Reviews shown of an Artisan whose Profile anyone may open, newest
     * first, 20 to a page from page 0, with one average and count. Anyone
     * may read them; null for an Artisan whose Profile is not open.
     */
    async ofArtisan(_viewer: Actor, input: { artisanId: string; page?: number }) {
      if (!(await openableArtisan(ctx, input.artisanId))) return null;
      return reviewsShown(ctx, input.artisanId, input.page);
    },

    /**
     * The Reviews shown of a Job's Client, as `ofArtisan` gives an Artisan's:
     * only to an Artisan holding a Job Match, an Invitation, or a Quote on
     * the Job; null for anyone else.
     */
    async ofClient(viewer: Actor, input: { jobId: string; page?: number }) {
      if (viewer.kind !== "artisan") return null;
      const job = await jobRow(ctx, input.jobId);
      if (!job || !(await seesJob(ctx, job, viewer))) return null;
      return reviewsShown(ctx, job.clientId, input.page);
    },
  }),
});

function alreadyWritten() {
  return refuse(
    "already-written",
    "You have written your Review of this Job. A Review cannot be changed.",
  );
}
