import { and, desc, eq } from "drizzle-orm";
import type { Actor } from "../actor";
import { publicName } from "../accounts/names";
import type { Context } from "../context";
import { invitable, invitationWrites } from "../invitations";
import { ok, refuse } from "../result";
import { accounts, chargebacks, engagements, jobs } from "../schema";
import { SERVICE_CATEGORY_NAMES } from "../service-categories";
import { closedState } from "../accounts/closing";
import { isSuspended } from "../standing";
import { jobRow, type JobRow } from "./rows";

// Hire Again (#139, ADR 0013): a Client opens an Invite-only Job from a
// Completed Engagement, prefilled from it and inviting only its Artisan. It
// then follows the ordinary Quote and Hire flow; a Hire on it is at the
// repeat Artisan Fee, as the Client Relationship has a Completed Engagement.

/**
 * The Client's Draft made by Hire Again of their Completed Engagement: its
 * Job's category, title, description, site, and gas answer, Invite-only, and
 * no photos, for the Client to add. One already a Draft is opened again.
 */
export async function hireAgainDraft(ctx: Context, actor: Actor, engagementId: string) {
  if (actor.kind !== "client") return noEngagement();
  const [[engagement], [chargeback]] = await Promise.all([
    ctx.db
      .select({
        jobId: engagements.jobId,
        clientId: engagements.clientId,
        state: engagements.state,
      })
      .from(engagements)
      .where(eq(engagements.id, engagementId)),
    ctx.db
      .select({ id: chargebacks.id })
      .from(chargebacks)
      .where(eq(chargebacks.engagementId, engagementId))
      .limit(1),
  ]);
  if (!engagement || engagement.clientId !== actor.accountId) return noEngagement();
  // One with a Chargeback would leave the Artisan Fee at 10% (#137).
  if (engagement.state !== "completed" || chargeback) {
    return refuse("not-completed", "Hire Again is offered once the Engagement is Completed.");
  }
  const [draft] = await ctx.db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.hireAgainOf, engagementId), eq(jobs.state, "draft")))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  if (draft) return ok({ jobId: draft.id });
  const from = (await jobRow(ctx, engagement.jobId))!;
  const jobId = ctx.newId();
  const now = ctx.now();
  await ctx.db.insert(jobs).values({
    id: jobId,
    clientId: actor.accountId,
    state: "draft",
    category: from.category,
    siteType: from.siteType,
    suburbId: from.suburbId,
    street: from.street,
    title: from.title,
    description: from.description,
    photos: [],
    gasWork: from.gasWork,
    preferredStart: null,
    matching: "invite-only",
    hireAgainOf: engagementId,
    createdAt: now,
    updatedAt: now,
  });
  return ok({ jobId });
}

/**
 * Why a Job opened by Hire Again cannot be posted as it is: its Artisan
 * cannot be invited to it now. Null for any other Job, or if they can.
 */
export async function hireAgainProblem(ctx: Context, job: JobRow): Promise<string | null> {
  const artisanId = job.hireAgainArtisanId;
  if (!artisanId || !job.category) return null;
  const [listed] = await invitable(ctx, job, { artisanId });
  if (listed) return null;
  const name = (await shownArtisanName(ctx, artisanId)) ?? "The Artisan";
  if ((await isSuspended(ctx, artisanId)) || (await closedState(ctx, artisanId))?.closedAt) {
    return `${name} cannot be invited to a Job now.`;
  }
  const category = SERVICE_CATEGORY_NAMES[job.category];
  if (job.gasWork) {
    const [withoutGas] = await invitable(ctx, { ...job, gasWork: false }, { artisanId });
    if (withoutGas) return `${name} cannot be invited to a ${category} Job with gas work now.`;
  }
  return `${name} cannot be invited to a ${category} Job now. Choose a Service Category they are verified for.`;
}

/**
 * The writes that invite the Artisan hired again to a Job opened by Hire
 * Again as it opens, with a Tell, from its Client; none for any other Job,
 * or while they cannot be invited, as once Suspended (#136) since it was
 * posted and Held. The Client may invite them once they can again.
 */
export async function hireAgainWrites(ctx: Context, job: JobRow) {
  if (!job.hireAgainArtisanId) return [];
  if ((await invitable(ctx, job, { artisanId: job.hireAgainArtisanId })).length === 0) return [];
  return invitationWrites(
    ctx,
    { kind: "client", accountId: job.clientId },
    job,
    job.hireAgainArtisanId,
  );
}

/** The Artisan a Job opened by Hire Again invites, as its Client sees them; null for any other Job. */
export async function hireAgainView(ctx: Context, job: JobRow) {
  if (!job.hireAgainArtisanId) return null;
  return {
    artisanId: job.hireAgainArtisanId,
    publicName: await shownArtisanName(ctx, job.hireAgainArtisanId),
  };
}

/** The Artisan's public name, once the Content check passed it; null before. */
async function shownArtisanName(ctx: Context, artisanId: string) {
  const [artisan] = await ctx.db
    .select({
      name: accounts.name,
      tradingName: accounts.tradingName,
      namesShown: accounts.namesShown,
    })
    .from(accounts)
    .where(eq(accounts.id, artisanId));
  return artisan?.namesShown ? publicName(artisan) : null;
}

function noEngagement() {
  return refuse("not-found", "That Engagement does not exist.");
}
