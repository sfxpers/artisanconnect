import { eq } from "drizzle-orm";
import { accountIdOf, type Actor } from "../actor";
import { publicName, shownName } from "../accounts/names";
import type { Context } from "../context";
import { viewerOf } from "../conversations/parties";
import { conversationRow, messageRow } from "../conversations/rows";
import { seesJob } from "../jobs";
import { jobRow } from "../jobs/rows";
import { openableArtisan } from "../profiles";
import { COUNTED_STATES } from "../quotes/rows";
import { quoteRow } from "../quotes/rows";
import { readsReview } from "../reviews/readers";
import { reviewRow } from "../reviews/rows";
import { accounts, type REPORT_SUBJECTS } from "../schema";

// What a Report may be about, and who may make one: only an Account that
// can see the thing, and never of its own.

export type ReportSubject = (typeof REPORT_SUBJECTS)[number];

/** What a Report is about. */
export type About = { kind: ReportSubject; id: string };

/** What a Report of a thing the reporter can see is about, as the module reads it. */
export type Reportable = {
  /** Whose the thing is: the Account reported. */
  reportedId: string;
  /** What the thing is called, for the reporter's Tell and the Admin's item. */
  name: string;
  /** The page it is on, for the reporter's Tell. */
  link: string;
  /** The Job it is on, if it is on one. */
  jobId: string | null;
};

/**
 * The thing, if the actor is an Account that can see it now; null for
 * anything else. Whether it is the actor's own is the caller's to ask.
 */
export async function reportable(
  ctx: Context,
  actor: Actor,
  about: About,
): Promise<Reportable | null> {
  const accountId = accountIdOf(actor);
  if (!accountId) return null;
  switch (about.kind) {
    case "job": {
      const job = await jobRow(ctx, about.id);
      if (!job) return null;
      // Only an Artisan who holds it, was invited, or Quoted sees a Job; its
      // Client may not Report their own.
      const sees =
        job.clientId === accountId ||
        (actor.kind === "artisan" && (await seesJob(ctx, job, actor)));
      if (!sees) return null;
      return { reportedId: job.clientId, name: job.title, link: `/jobs/${job.id}`, jobId: job.id };
    }
    case "quote": {
      const quote = await quoteRow(ctx, about.id);
      const job = quote && (await jobRow(ctx, quote.jobId));
      if (!quote || !job) return null;
      // Its Client sees a Quote once it was Sent; its Artisan sees their own.
      const wasSent = (COUNTED_STATES as readonly string[]).includes(quote.state);
      const sees = quote.artisanId === accountId || (job.clientId === accountId && wasSent);
      if (!sees) return null;
      return {
        reportedId: quote.artisanId,
        name: job.title,
        link: `/jobs/${job.id}`,
        jobId: job.id,
      };
    }
    case "message": {
      const message = await messageRow(ctx, about.id);
      const conversation = message && (await conversationRow(ctx, message.conversationId));
      if (!message?.senderId || !conversation) return null;
      if (!(await viewerOf(ctx, conversation, accountId))) return null;
      const sees = message.senderId === accountId || message.state === "delivered";
      if (!sees) return null;
      return {
        reportedId: message.senderId,
        name: conversation.job.title,
        link: `/jobs/${conversation.jobId}?tab=messages`,
        jobId: conversation.jobId,
      };
    }
    case "review": {
      const review = await reviewRow(ctx, about.id);
      if (!review || !(await readsReview(ctx, actor, review))) return null;
      const party = accountId === review.clientId || accountId === review.artisanId;
      return {
        reportedId: review.authorId,
        // Its Job's title only to its parties: anyone else read it without the Job.
        name: party ? review.jobTitle : await reviewedName(ctx, review.reviewedId),
        // Where the reporter read it: on the Job, on the Profile, or beside a Job Match.
        link: party
          ? `/jobs/${review.jobId}`
          : review.reviewedId === review.artisanId
            ? `/artisans/${review.artisanId}`
            : "/home",
        jobId: review.jobId,
      };
    }
    case "profile": {
      const artisan = await openableArtisan(ctx, about.id);
      if (!artisan) return null;
      return {
        reportedId: artisan.id,
        name: publicName(artisan),
        link: `/artisans/${artisan.id}`,
        jobId: null,
      };
    }
  }
}

/** How the Account a Review is of appears to those who read it. */
async function reviewedName(ctx: Context, accountId: string) {
  const [row] = await ctx.db
    .select({
      name: accounts.name,
      tradingName: accounts.tradingName,
      namesShown: accounts.namesShown,
      kind: accounts.kind,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return row?.namesShown ? shownName(row.kind, row) : "an Account";
}
