import { and, asc, desc, eq, exists, inArray, not, sql } from "drizzle-orm";
import { accountIdOf, type Actor } from "../actor";
import { firstProblem } from "../accounts/inputs";
import { publicName } from "../accounts/names";
import { checkContent } from "../content/check";
import type { Context } from "../context";
import { heldInvitation } from "../invitations";
import { JOB_AS_ARTISAN_COLUMNS, jobAsArtisanView, jobRow } from "../jobs/rows";
import { heldMatch } from "../matches";
import { ok, refuse } from "../result";
import { accounts, engagements, jobs, quotes, regions, suburbs } from "../schema";
import { defineSection } from "../section";
import { badgesOf } from "../verification";
import { protectionFeeCents } from "../money";
import { causedBy } from "../errors";
import { insertWhile } from "../guarded";
import { emailTells, tellWhile } from "../tells";
import { startClock } from "../clocks";
import { alreadyChecked, isAlreadyDecided } from "../content/held";
import { quoteSentWrites } from "../conversations/rows";
import { endWrites, expiryClocks } from "./ends";
import { heldQuote, holdWrites, withdrawHeldQuote } from "./held";
import { quoteFields, type ParsedQuote, type QuoteFields } from "./inputs";
import { problemMessage, sendingProblem, startPassed } from "./rules";
import { fieldsView } from "./views";
import {
  applyWrites,
  heldRevision,
  holdRevisionWrites,
  revisionsStanding,
  sameVersion,
  withdrawRevisionWrites,
} from "./revisions";
import {
  COUNTED_STATES,
  EXPIRY_CLOCK,
  expiryOf,
  isLive,
  jobFull,
  newestQuote,
  quoteRow,
  quoteText,
  takesQuotes,
  takesQuotesNow,
  vatNumberOf,
  type QuoteRow,
} from "./rows";
import { isSuspended, suspendedNow } from "../standing";
import { completedCounts } from "../engagements/rows";
import { summariesOf } from "../reviews/rows";

// Quotes (#124, ADR 0002, ADR 0004): an Artisan holding a Job Match or an
// Invitation sends one fixed-price Quote on an Open Job. The Content check
// reads it first (ADR 0011).

export const quotesSection = defineSection({
  name: "quotes",
  queueItems: [heldQuote, heldRevision],
  clocks: expiryClocks,
  api: (ctx) => ({
    /** Sends a Quote on an Open Job the Artisan holds a Job Match or an Invitation for. */
    async send(actor: Actor, input: QuoteFields & { jobId: string }) {
      if (actor.kind !== "artisan")
        return refuse("artisans-only", "Only an Artisan sends a Quote.");
      const job = await jobRow(ctx, input.jobId);
      if (
        !job ||
        job.state !== "open" ||
        // One out of view is nobody's to see but its Client's (#136).
        job.outOfViewSince !== null ||
        !(await isOfferedOrInvited(ctx, job.id, actor.accountId))
      ) {
        return noJob();
      }
      const parsed = quoteFields.safeParse(input);
      if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
      const fields = parsed.data;
      if (isLive(await newestQuote(ctx, job.id, actor.accountId))) return alreadyQuoted();
      // Verification is asked now, as it is again at Hire (ADR 0002).
      const problem = await sendingProblem(ctx, actor.accountId, job, fields.startOn);
      if (problem) {
        return refuse(
          problem === "start-passed" ? "invalid" : problem,
          problemMessage(problem, job.category),
        );
      }
      if (!(await takesQuotesNow(ctx, job.id))) return jobFull();

      const checked = await checkContent(ctx, {
        text: quoteText(fields),
        context: { kind: "before-payment" },
      });
      if (!checked.ok) return checked;
      const verdict = checked.value;
      const now = ctx.now();
      const quote: QuoteRow = {
        id: ctx.newId(),
        jobId: job.id,
        artisanId: actor.accountId,
        state: "held",
        scope: fields.scope,
        labourCents: fields.labour,
        materialsCents: fields.materials,
        materialsBy: fields.materialsBy,
        startOn: fields.startOn,
        durationDays: fields.durationDays,
        warranty: fields.warranty,
        vatNumber: await vatNumberOf(ctx, actor.accountId),
        heldFor: null,
        createdAt: now,
        sentAt: null,
        expiresAt: null,
        revisedAt: null,
        endedAt: null,
      };
      try {
        if (verdict.verdict === "held") {
          // Held, it takes no slot and starts no clock, so the Job need not take it yet.
          await ctx.commit(holdWrites(ctx, { ...quote, heldFor: verdict.reason }, job.title));
          return ok({ quoteId: quote.id, state: "held" as const });
        }
        const expiresAt = expiryOf(now);
        // A batch, not a commit, to read whether the guarded insert landed.
        const [sent] = await ctx.db.batch([
          insertWhile(
            ctx,
            quotes,
            { ...quote, state: "sent", sentAt: now, expiresAt },
            // Not if a Suspension landed since it was asked above.
            and(takesQuotes(ctx, job.id), not(suspendedNow(ctx, actor.accountId)))!,
          ).returning({ id: quotes.id }),
          startClock(ctx, { kind: EXPIRY_CLOCK, subjectId: quote.id, dueAt: expiresAt }),
          // The first Quote Sent opens the Conversation, unless an Invitation did.
          ...quoteSentWrites(ctx, quote),
          ...tellWhile(
            ctx,
            actor,
            [job.clientId],
            { event: "quote.sent", title: `New Quote on ${job.title}`, link: `/jobs/${job.id}` },
            exists(
              ctx.db
                .select({ one: sql`1` })
                .from(quotes)
                .where(eq(quotes.id, quote.id)),
            ),
          ),
        ]);
        if (sent.length === 0) {
          if (await isSuspended(ctx, actor.accountId)) {
            return refuse("suspended", problemMessage("suspended", job.category));
          }
          return (await jobRow(ctx, job.id))?.state === "open" ? jobFull() : noJob();
        }
      } catch (error) {
        if (causedBy(error, "UNIQUE constraint failed: quotes.job_id")) return alreadyQuoted();
        throw error;
      }
      await sendEmails(ctx);
      return ok({ quoteId: quote.id, state: "sent" as const });
    },

    /**
     * Revises the Artisan's Sent Quote on the Job, given whole. The Content
     * check reads it: a sure hit is refused with the reason; an unsure one
     * waits for the Admin, and the Quote shows as it was meanwhile. Its 14
     * days do not restart.
     */
    async revise(actor: Actor, input: QuoteFields & { jobId: string }) {
      if (actor.kind !== "artisan") return notSent();
      const quote = await newestQuote(ctx, input.jobId, actor.accountId);
      const job = quote && (await jobRow(ctx, quote.jobId));
      if (quote?.state !== "sent" || !job) return notSent();
      const parsed = quoteFields.safeParse(input);
      if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
      const fields = parsed.data;
      if (startPassed(ctx, fields.startOn)) {
        return refuse("invalid", problemMessage("start-passed", job.category));
      }
      const version = {
        ...versionFrom(fields),
        vatNumber: await vatNumberOf(ctx, actor.accountId),
      };
      if (sameVersion(version, quote)) return refuse("unchanged", "Nothing has changed.");
      if ((await revisionsStanding(ctx, quote.id)).beingChecked) return revisionBeingChecked();

      const checked = await checkContent(ctx, {
        text: quoteText(version),
        context: { kind: "before-payment" },
      });
      if (!checked.ok) return checked;
      const verdict = checked.value;
      try {
        if (verdict.verdict === "held") {
          await ctx.commit(holdRevisionWrites(ctx, quote, job.title, version, verdict.reason));
          return ok({ revision: "being-checked" as const });
        }
        // A batch, not a commit, to read whether the guarded update landed.
        const [shown] = await ctx.db.batch(applyWrites(ctx, actor, quote, job, version));
        if (shown.length === 0) return notSent();
      } catch (error) {
        if (causedBy(error, "UNIQUE constraint failed: quote_revisions.quote_id")) {
          return revisionBeingChecked();
        }
        throw error;
      }
      await sendEmails(ctx);
      return ok({ revision: "applied" as const });
    },

    /**
     * Withdraws what of the Artisan's Quote on the Job is being checked: a
     * Held Quote, which was never Sent, or a Held revision, which leaves the
     * Quote as it was. Nobody is told.
     */
    async withdrawHeld(actor: Actor, input: { jobId: string }) {
      const quote = accountIdOf(actor)
        ? await newestQuote(ctx, input.jobId, accountIdOf(actor)!)
        : null;
      const writes =
        quote?.state === "held"
          ? await withdrawHeldQuote(ctx, quote.id)
          : quote?.state === "sent"
            ? await withdrawRevisionWrites(ctx, quote.id)
            : [];
      if (writes.length === 0) {
        return refuse("nothing-held", "Nothing of your Quote is being checked.");
      }
      try {
        await ctx.commit(writes);
      } catch (error) {
        if (isAlreadyDecided(error)) return alreadyChecked();
        throw error;
      }
      return ok({});
    },

    /** Withdraws the Artisan's Sent Quote on the Job, telling the Client. */
    async withdraw(actor: Actor, input: { jobId: string }) {
      if (actor.kind !== "artisan") return notSent();
      const quote = await newestQuote(ctx, input.jobId, actor.accountId);
      const job = quote && (await jobRow(ctx, quote.jobId));
      if (quote?.state !== "sent" || !job) return notSent();
      const ended = await endQuote(ctx, quote, () =>
        endWrites(ctx, actor, quote, "withdrawn", {
          to: job.clientId,
          title: `A Quote was withdrawn: ${job.title}`,
          link: `/jobs/${job.id}`,
        }),
      );
      if (!ended) return notSent();
      await sendEmails(ctx);
      return ok({});
    },

    /** Declines a Sent Quote on the Client's Job, telling its Artisan. */
    async decline(actor: Actor, input: { quoteId: string }) {
      const quote = await quoteRow(ctx, input.quoteId);
      const job = quote && (await jobRow(ctx, quote.jobId));
      if (!quote || !job || job.clientId !== accountIdOf(actor) || !isLive(quote)) {
        return refuse("not-found", "That Quote does not exist.");
      }
      if (quote.state !== "sent") return notSent();
      const ended = await endQuote(ctx, quote, () =>
        endWrites(ctx, actor, quote, "declined", {
          to: quote.artisanId,
          title: `Your Quote was declined: ${job.title}`,
          link: `/jobs/${job.id}`,
        }),
      );
      if (!ended) return notSent();
      await sendEmails(ctx);
      return ok({});
    },

    /**
     * The Artisan's Quotes being checked, Sent, or Hired, the newest first,
     * each with its Job as they see it in a list: the Region, never the
     * address; and a Hired one's Engagement's state.
     */
    async mine(viewer: Actor) {
      if (viewer.kind !== "artisan") return null;
      const rows = await ctx.db
        .select({ ...JOB_AS_ARTISAN_COLUMNS, quote: quotes, engagementState: engagements.state })
        .from(quotes)
        .innerJoin(jobs, eq(jobs.id, quotes.jobId))
        .leftJoin(suburbs, eq(suburbs.id, jobs.suburbId))
        .leftJoin(regions, eq(regions.id, suburbs.regionId))
        .leftJoin(engagements, eq(engagements.quoteId, quotes.id))
        .where(
          and(
            eq(quotes.artisanId, viewer.accountId),
            inArray(quotes.state, ["held", "sent", "hired"]),
          ),
        )
        .orderBy(desc(quotes.createdAt), desc(sql.raw(`"quotes"."rowid"`)));
      return rows.map(({ quote, engagementState, ...job }) => ({
        ...jobAsArtisanView(job),
        quoteId: quote.id,
        state: quote.state as "held" | "sent" | "hired",
        engagementState,
        totalCents: quote.labourCents + quote.materialsCents,
        sentAt: quote.sentAt,
        expiresAt: quote.expiresAt,
      }));
    },

    /**
     * The Quotes on the Client's Job, in the order sent, each with the
     * Artisan's record and badges for the Job's category, and the Payment the
     * Client would make. Nothing is ranked. Null for anyone else.
     */
    async forJob(viewer: Actor, input: { jobId: string }) {
      const job = await jobRow(ctx, input.jobId);
      if (!job || job.clientId !== accountIdOf(viewer)) return null;
      const rows = await ctx.db
        .select({
          quote: quotes,
          name: accounts.name,
          tradingName: accounts.tradingName,
          namesShown: accounts.namesShown,
        })
        .from(quotes)
        .innerJoin(accounts, eq(accounts.id, quotes.artisanId))
        .where(and(eq(quotes.jobId, job.id), inArray(quotes.state, COUNTED_STATES)))
        .orderBy(asc(quotes.sentAt), asc(sql.raw(`"quotes"."rowid"`)));
      const artisanIds = [...new Set(rows.map((row) => row.quote.artisanId))];
      const [reviewed, completed] = await Promise.all([
        summariesOf(ctx, artisanIds),
        completedCounts(ctx, "artisanId", artisanIds),
      ]);
      const badges = new Map(
        await Promise.all(
          artisanIds.map(async (artisanId) => [artisanId, await badgesOf(ctx, artisanId)] as const),
        ),
      );
      return rows.map(({ quote, namesShown, ...names }) => {
        const view = fieldsView(quote);
        const protectionFee = protectionFeeCents(view.totalCents);
        return {
          quoteId: quote.id,
          // Only these are selected: one never Sent is nobody else's to see.
          state: quote.state as (typeof COUNTED_STATES)[number],
          artisan: {
            artisanId: quote.artisanId,
            // Names the Content check has not passed are nobody else's to see.
            publicName: namesShown ? publicName(names) : null,
            reviews: reviewed.get(quote.artisanId),
            completed: completed.get(quote.artisanId),
            badges: (badges.get(quote.artisanId) ?? []).filter(
              (badge) => badge.category === null || badge.category === job.category,
            ),
          },
          ...view,
          protectionFeeCents: protectionFee,
          paymentCents: view.totalCents + protectionFee,
          /** Whether its start date has passed, so it must be revised before it can be Hired. */
          startPassed: startPassed(ctx, quote.startOn),
          sentAt: quote.sentAt,
          expiresAt: quote.expiresAt,
          revisedAt: quote.revisedAt,
          endedAt: quote.endedAt,
        };
      });
    },
  }),
});

/** Whether the Artisan has a Job Match or an Invitation for the Job, not passed. */
async function isOfferedOrInvited(ctx: Context, jobId: string, artisanId: string) {
  const [match, invitation] = await Promise.all([
    heldMatch(ctx, jobId, artisanId),
    heldInvitation(ctx, jobId, artisanId),
  ]);
  return !!match || !!invitation;
}

function alreadyQuoted() {
  return refuse(
    "already-quoted",
    "You have Quoted on this Job already. Revise your Quote instead.",
  );
}

/**
 * Ends a Sent Quote by the writes given, and takes any revision of it out of
 * the Admin's queue. Whether it ended.
 */
async function endQuote(
  ctx: Context,
  quote: { id: string },
  ending: () => ReturnType<typeof endWrites>,
): Promise<boolean> {
  const attempt = async () => {
    const [ended, ...rest] = ending();
    const [landed] = await ctx.db.batch([
      ended,
      ...rest,
      ...(await withdrawRevisionWrites(ctx, quote.id)),
    ]);
    return landed.length > 0;
  };
  try {
    return await attempt();
  } catch (error) {
    // The Admin decided the revision meanwhile: end the Quote as it now stands.
    if (isAlreadyDecided(error)) return attempt();
    throw error;
  }
}

/** A revision's fields from the form's. */
function versionFrom(fields: ParsedQuote) {
  return {
    scope: fields.scope,
    labourCents: fields.labour,
    materialsCents: fields.materials,
    materialsBy: fields.materialsBy,
    startOn: fields.startOn,
    durationDays: fields.durationDays,
    warranty: fields.warranty,
  };
}

function revisionBeingChecked() {
  return refuse(
    "being-checked",
    "Your last revision of this Quote is being checked. Withdraw it to send another.",
  );
}

/** Sends the Tells' emails. What was done stands whatever happens to one; the clocks retry it. */
async function sendEmails(ctx: Context) {
  await emailTells(ctx).catch((error: unknown) => {
    console.error("Tell emails did not go", error);
  });
}

function notSent() {
  return refuse("not-sent", "Only a Sent Quote can be withdrawn or declined.");
}

function noJob() {
  return refuse("not-found", "You hold no Job Match or Invitation for an Open Job by that id.");
}
