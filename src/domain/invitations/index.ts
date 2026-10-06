import { and, desc, eq, exists, sql, type SQLWrapper } from "drizzle-orm";
import { accountIdOf, type Actor } from "../actor";
import type { Context } from "../context";
import { causedBy } from "../errors";
import { JOB_AS_ARTISAN_COLUMNS, jobAsArtisanView, jobRow, type JobRow } from "../jobs/rows";
import { browse, type Narrowing } from "../profiles";
import { ok, refuse } from "../result";
import { invitations, jobs, regions, suburbs } from "../schema";
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
      // Not once the Job has five Quotes, once there are Quotes (#124); not
      // by or to a Suspended Account, once there are Suspensions (#136).
      if ((await invitable(ctx, job, { artisanId: input.artisanId })).length === 0) {
        return notListed();
      }
      // Each write is guarded on the Job still being Open. The Invitation
      // opens a Conversation too, once there are Conversations (#125).
      const stillOpen = and(eq(jobs.id, job.id), eq(jobs.state, "open"))!;
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
            exists(
              ctx.db
                .select({ one: sql`1` })
                .from(jobs)
                .where(stillOpen),
            ),
          ),
        ]);
        if (invited.length === 0) return notOpen();
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
     * each marked once invited. Null for anyone else. Whether an Artisan
     * holds or passed a Job Match for the Job shows nowhere.
     */
    async list(viewer: Actor, input: { jobId: string; regionId?: string }) {
      const job = await jobRow(ctx, input.jobId);
      if (!job || job.clientId !== accountIdOf(viewer)) return null;
      const [listed, invited] = await Promise.all([
        invitable(ctx, job, { regionId: input.regionId }),
        invitedTo(ctx, job.id),
      ]);
      return listed.map((artisan) => ({
        ...artisan,
        // Marked "Quoted" too, once there are Quotes (#124).
        mark: invited.has(artisan.artisanId) ? ("invited" as const) : null,
      }));
    },

    /** The Invitations the Artisan holds on Open Jobs, the newest first. */
    async mine(viewer: Actor) {
      if (viewer.kind !== "artisan") return null;
      const rows = await ctx.db
        .select({ ...JOB_AS_ARTISAN_COLUMNS, invitedAt: invitations.invitedAt })
        .from(invitations)
        .innerJoin(jobs, eq(jobs.id, invitations.jobId))
        .leftJoin(suburbs, eq(suburbs.id, jobs.suburbId))
        .leftJoin(regions, eq(regions.id, suburbs.regionId))
        .where(and(eq(invitations.artisanId, viewer.accountId), eq(jobs.state, "open")))
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

/** The Invitation the Artisan holds for the Job; null if none. */
export async function heldInvitation(ctx: Context, jobId: string, artisanId: string) {
  const [row] = await ctx.db
    .select({ invitedAt: invitations.invitedAt })
    .from(invitations)
    .where(and(eq(invitations.jobId, jobId), eq(invitations.artisanId, artisanId)));
  return row ?? null;
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

function alreadyInvited() {
  return refuse("already-invited", "You have already invited this Artisan.");
}
