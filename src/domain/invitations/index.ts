import {
  and,
  desc,
  eq,
  exists,
  inArray,
  isNull,
  notExists,
  sql,
  type SQLWrapper,
} from "drizzle-orm";
import { accountIdOf, type Actor } from "../actor";
import type { Context } from "../context";
import { openWrites } from "../conversations/rows";
import { causedBy } from "../errors";
import { JOB_AS_ARTISAN_COLUMNS, jobAsArtisanView, jobRow, type JobRow } from "../jobs/rows";
import { browse, type Narrowing } from "../profiles";
import { belowFive, COUNTED_STATES, jobFull, liveQuoteOf, takesQuotesNow } from "../quotes/rows";
import { ok, refuse } from "../result";
import { invitations, jobMatches, jobs, quotes, regions, suburbs } from "../schema";
import { defineSection } from "../section";
import { emailTells, tellWhile } from "../tells";

// Invitations (#123, ADR 0003): a Client asks Artisans of their choosing to
// Quote on an Open Job. An Invite-only Job is offered to nobody else. An
// Invitation reaches an Artisan who passed on a Job Match for the Job too,
// so whom a Client may invite reveals nothing about Batches.

export const invitationsSection = defineSection({
  name: "invitations",
  api: (ctx) => ({
    /** Invites the Artisan to Quote on the Client's Open Job, with a Tell. */
    async invite(actor: Actor, input: { jobId: string; artisanId: string }) {
      const job = await jobRow(ctx, input.jobId);
      if (!job || job.clientId !== accountIdOf(actor)) return noJob();
      if (job.state !== "open") return notOpen();
      if (!(await takesQuotesNow(ctx, job.id))) return jobFull();
      // Not by or to a Suspended Account, once there are Suspensions (#136).
      if ((await invitable(ctx, job, { artisanId: input.artisanId })).length === 0) {
        return notListed();
      }
      // Each write is guarded on the Job still taking Quotes. The Invitation
      // opens the Conversation too, unless a Quote did.
      const stillOpen = and(eq(jobs.id, job.id), eq(jobs.state, "open"), belowFive())!;
      const landed = exists(
        ctx.db
          .select({ one: sql`1` })
          .from(jobs)
          .where(stillOpen),
      );
      try {
        const [invited] = await ctx.db.batch([
          ctx.db
            .insert(invitations)
            .select(
              ctx.db
                .select({
                  id: sql<string>`${ctx.newId()}`.as("id"),
                  jobId: jobs.id,
                  artisanId: sql<string>`${input.artisanId}`.as("artisan_id"),
                  invitedAt: sql<number>`${ctx.now().getTime()}`.as("invited_at"),
                  passedAt: sql<null>`null`.as("passed_at"),
                })
                .from(jobs)
                .where(stillOpen),
            )
            .returning({ id: invitations.id }),
          ...tellWhile(
            ctx,
            actor,
            [input.artisanId],
            {
              event: "job.invited",
              title: `Invited to Quote: ${job.title}`,
              link: `/jobs/${job.id}`,
            },
            landed,
          ),
          ...openWrites(ctx, { jobId: job.id, artisanId: input.artisanId }, landed),
        ]);
        if (invited.length === 0) {
          return (await jobRow(ctx, job.id))?.state === "open" ? jobFull() : notOpen();
        }
      } catch (error) {
        if (causedBy(error, "UNIQUE constraint failed: invitations.job_id"))
          return alreadyInvited();
        throw error;
      }
      // The Invitation stands whatever happens to an email; the clocks retry one that did not go.
      await emailTells(ctx).catch((error: unknown) => {
        console.error("Tell emails did not go", error);
      });
      return ok({});
    },

    /**
     * Whom the Job's Client may invite: Browse narrowed to the Job's category,
     * and to gas-registered Artisans on a gas Job, optionally in one Region,
     * each marked once invited or once their Quote is Sent. Null for anyone else. Whether an Artisan
     * holds or passed a Job Match for the Job shows nowhere.
     */
    async list(viewer: Actor, input: { jobId: string; regionId?: string }) {
      const job = await jobRow(ctx, input.jobId);
      if (!job || job.clientId !== accountIdOf(viewer)) return null;
      const [listed, invited, quoted] = await Promise.all([
        invitable(ctx, job, { regionId: input.regionId }),
        invitedTo(ctx, job.id),
        quotedOn(ctx, job.id),
      ]);
      return listed.map((artisan) => ({
        ...artisan,
        mark: quoted.has(artisan.artisanId)
          ? ("quoted" as const)
          : invited.has(artisan.artisanId)
            ? ("invited" as const)
            : null,
      }));
    },

    /**
     * Passes on an Invitation the Artisan holds for an Open Job, and has not
     * Quoted on, and on the Job Match it may have been. Nobody is told, and
     * the Client's list still marks the Artisan invited.
     */
    async pass(actor: Actor, input: { jobId: string }) {
      if (actor.kind !== "artisan") return noInvitation();
      const now = ctx.now();
      const held = and(
        eq(invitations.jobId, input.jobId),
        eq(invitations.artisanId, actor.accountId),
        isNull(invitations.passedAt),
        notExists(liveQuoteOf(ctx, invitations.jobId, invitations.artisanId)),
        // One on a Job no longer Open is not shown, and Renew shows it again.
        exists(
          ctx.db
            .select({ one: sql`1` })
            .from(jobs)
            .where(and(eq(jobs.id, input.jobId), eq(jobs.state, "open"))),
        ),
      );
      const [passed] = await ctx.db.batch([
        ctx.db
          .update(invitations)
          .set({ passedAt: now })
          .where(held)
          .returning({ id: invitations.id }),
        // Only if the pass above landed: a Job Match it was is passed with it.
        ctx.db
          .update(jobMatches)
          .set({ passedAt: now })
          .where(
            and(
              eq(jobMatches.jobId, input.jobId),
              eq(jobMatches.artisanId, actor.accountId),
              isNull(jobMatches.passedAt),
              exists(
                ctx.db
                  .select({ one: sql`1` })
                  .from(invitations)
                  .where(
                    and(
                      eq(invitations.jobId, input.jobId),
                      eq(invitations.artisanId, actor.accountId),
                      eq(invitations.passedAt, now),
                    ),
                  ),
              ),
            ),
          ),
      ]);
      if (passed.length === 0) return noInvitation();
      return ok({});
    },

    /**
     * The Invitations the Artisan holds on Open Jobs, the newest first. One
     * they have Quoted on is among their Quotes.
     */
    async mine(viewer: Actor) {
      if (viewer.kind !== "artisan") return null;
      const rows = await ctx.db
        .select({ ...JOB_AS_ARTISAN_COLUMNS, invitedAt: invitations.invitedAt })
        .from(invitations)
        .innerJoin(jobs, eq(jobs.id, invitations.jobId))
        .leftJoin(suburbs, eq(suburbs.id, jobs.suburbId))
        .leftJoin(regions, eq(regions.id, suburbs.regionId))
        .where(
          and(
            eq(invitations.artisanId, viewer.accountId),
            isNull(invitations.passedAt),
            eq(jobs.state, "open"),
            notExists(liveQuoteOf(ctx, invitations.jobId, invitations.artisanId)),
          ),
        )
        .orderBy(desc(invitations.invitedAt), desc(jobs.openedAt));
      return rows.map(jobAsArtisanView);
    },
  }),
});

/**
 * Whom the Job's Client may invite, narrowed as given: Browse for the Job's
 * category, and only gas-registered Artisans on a gas Job.
 */
async function invitable(ctx: Context, job: JobRow, narrow: Narrowing) {
  if (!job.category) return [];
  const listed = await browse(ctx, job.category, narrow);
  return listed.filter((artisan) => !job.gasWork || artisan.gasWork);
}

/**
 * The Invitation of the Artisan to the Job, each given as a value or a column,
 * as a subquery: `notExists` it to leave invited Artisans out.
 */
export function invitationOf(ctx: Context, jobId: SQLWrapper | string, artisanId: SQLWrapper) {
  return ctx.db
    .select({ one: sql`1` })
    .from(invitations)
    .where(and(eq(invitations.jobId, jobId), eq(invitations.artisanId, artisanId)));
}

/** The Invitation the Artisan holds for the Job, not passed; null if none. */
export async function heldInvitation(ctx: Context, jobId: string, artisanId: string) {
  const [row] = await ctx.db
    .select({ invitedAt: invitations.invitedAt })
    .from(invitations)
    .where(
      and(
        eq(invitations.jobId, jobId),
        eq(invitations.artisanId, artisanId),
        isNull(invitations.passedAt),
      ),
    );
  return row ?? null;
}

/** The Artisans whose Quote on the Job was Sent, by id: a Held one is nobody else's to see. */
async function quotedOn(ctx: Context, jobId: string) {
  const rows = await ctx.db
    .select({ artisanId: quotes.artisanId })
    .from(quotes)
    .where(and(eq(quotes.jobId, jobId), inArray(quotes.state, COUNTED_STATES)));
  return new Set(rows.map((row) => row.artisanId));
}

/** The Artisans invited to the Job, by id. */
async function invitedTo(ctx: Context, jobId: string) {
  const rows = await ctx.db
    .select({ artisanId: invitations.artisanId })
    .from(invitations)
    .where(eq(invitations.jobId, jobId));
  return new Set(rows.map((row) => row.artisanId));
}

function noJob() {
  return refuse("not-found", "That Job does not exist.");
}

function notOpen() {
  return refuse("not-open", "Artisans can be invited only while the Job is Open.");
}

function notListed() {
  return refuse("not-listed", "That Artisan cannot be invited to Quote on this Job.");
}

function noInvitation() {
  return refuse("not-found", "You hold no Invitation for that Job.");
}

function alreadyInvited() {
  return refuse("already-invited", "You have already invited this Artisan.");
}
