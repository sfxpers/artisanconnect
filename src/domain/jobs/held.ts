import { and, eq, isNull, notExists, sql } from "drizzle-orm";
import type { Context, Write } from "../context";
import { defineHeldKind, refusedFor } from "../content/held";
import type { Block } from "../queues";
import { formatDay } from "../sa-days";
import { accounts, authUsers, jobs, queueItems } from "../schema";
import { SERVICE_CATEGORY_NAMES } from "../service-categories";
import { jobPhotoPath, jobRow, jobText, openWrites, type JobRow } from "./rows";

// A Job the Content check is unsure about, or cannot read, is Held at posting
// (ADR 0020): it is not Open and is not matched until the Admin releases it.
// Refused or withdrawn, it is a Draft again, for the Client to fix and post.

export const heldJob = defineHeldKind("held.job", {
  async sender(ctx, subjectId) {
    return (await jobRow(ctx, subjectId))?.clientId ?? null;
  },
  async release(ctx, _admin, subjectId) {
    const job = await jobRow(ctx, subjectId);
    if (!job) return [];
    // Its first Batch goes within the minute, when the clocks next run.
    return [...openWrites(ctx, job, eq(jobs.state, "held"))];
  },
  async refuse(ctx, _admin, subjectId) {
    return [backToDraft(ctx, subjectId)];
  },
  told: {
    released: "Your Job is checked and Open",
    refused: "Your Job was refused",
    link: async (_ctx, subjectId) => `/jobs/${subjectId}`,
  },
  async view(ctx, item) {
    const job = await jobRow(ctx, item.subjectId);
    if (!job) return { tabs: [], sidebar: [] };
    return {
      tabs: [
        { key: "job", label: "The Job", blocks: jobBlocks(job) },
        {
          key: "check",
          label: "Content check",
          blocks: [{ kind: "text", text: job.heldFor ?? "The Content check could not run." }],
        },
      ],
      sidebar: await clientSidebar(ctx, job.clientId),
    };
  },
});

/** Who posted the Job, for the Admin. */
export async function clientSidebar(ctx: Context, clientId: string) {
  const [client] = await ctx.db
    .select({ name: accounts.name, email: authUsers.email })
    .from(accounts)
    .innerJoin(authUsers, eq(authUsers.id, accounts.id))
    .where(eq(accounts.id, clientId));
  return [
    {
      title: "Client",
      blocks: [
        {
          kind: "facts" as const,
          facts: [
            { label: "Name", value: client?.name ?? "" },
            { label: "Email", value: client?.email ?? "" },
          ],
        },
      ],
    },
  ];
}

/**
 * The writes that Hold a Draft for the Admin, if it is still the version the
 * Content check read: the move, and its Pre-check, raised unless one is open
 * already, so a Draft posted twice at once waits once. The first returns the
 * Job's id if it moved.
 */
export function holdWrites(
  ctx: Context,
  job: { id: string; title: string; revision: number },
  heldFor: string,
) {
  const now = ctx.now();
  return [
    ctx.db
      .update(jobs)
      .set({ state: "held", heldFor, updatedAt: now })
      .where(and(eq(jobs.id, job.id), stillDraft(job)))
      .returning({ id: jobs.id }),
    ctx.db.insert(queueItems).select(
      ctx.db
        .select({
          id: sql<string>`${ctx.newId()}`.as("id"),
          queue: sql<"pre-checks">`'pre-checks'`.as("queue"),
          kind: sql<string>`${heldJob.kind}`.as("kind"),
          subjectId: jobs.id,
          title: sql<string>`${`Job: ${job.title}`}`.as("title"),
          raisedAt: sql<number>`${now.getTime()}`.as("raised_at"),
          decision: sql<null>`null`.as("decision"),
          reason: sql<null>`null`.as("reason"),
          decidedBy: sql<null>`null`.as("decided_by"),
          decidedAt: sql<null>`null`.as("decided_at"),
        })
        .from(jobs)
        .where(
          and(
            eq(jobs.id, job.id),
            eq(jobs.state, "held"),
            notExists(
              ctx.db
                .select({ id: queueItems.id })
                .from(queueItems)
                .where(
                  and(
                    eq(queueItems.kind, heldJob.kind),
                    eq(queueItems.subjectId, job.id),
                    isNull(queueItems.decidedAt),
                  ),
                ),
            ),
          ),
        ),
    ),
  ] as const;
}

/** A Draft not saved since it was read: the version the Content check read. */
export function stillDraft(job: { revision: number }) {
  return and(eq(jobs.state, "draft"), eq(jobs.revision, job.revision));
}

/** The writes that withdraw the Client's Held Job, guarded on its still being Held. */
export async function withdrawHeldJob(ctx: Context, jobId: string): Promise<Write[]> {
  return [backToDraft(ctx, jobId), ...(await heldJob.withdraw(ctx, jobId))];
}

function backToDraft(ctx: Context, jobId: string): Write {
  return ctx.db
    .update(jobs)
    .set({ state: "draft", updatedAt: ctx.now() })
    .where(and(eq(jobs.id, jobId), eq(jobs.state, "held")));
}

/** Why the Admin refused the Job when it was last posted, while it is a Draft again. */
export async function refusalOf(ctx: Context, job: JobRow): Promise<string | null> {
  return job.state === "draft" ? refusedFor(ctx, heldJob.kind, job.id) : null;
}

const SITE_TYPE_NAMES = { home: "Home", business: "Business" } as const;
const MATCHING_NAMES = {
  matched: "Find Artisans for me",
  "invite-only": "Only Artisans I invite",
} as const;

/** What the Admin reads of a Job: what Artisans would see, and the suburb, never the street. */
export function jobBlocks(job: Omit<JobRow, "street">): Block[] {
  const facts = [
    { label: "Service Category", value: job.category ? SERVICE_CATEGORY_NAMES[job.category] : "" },
    ...(job.gasWork === null ? [] : [{ label: "Gas work", value: job.gasWork ? "Yes" : "No" }]),
    { label: "Site type", value: job.siteType ? SITE_TYPE_NAMES[job.siteType] : "" },
    { label: "Suburb", value: job.suburbName ?? "" },
    { label: "Region", value: job.regionName ?? "" },
    {
      label: "Preferred start",
      value: job.preferredStart ? formatDay(job.preferredStart) : "None given",
    },
    { label: "Matching", value: job.matching ? MATCHING_NAMES[job.matching] : "" },
  ];
  const blocks: Block[] = [
    { kind: "facts", facts },
    { kind: "text", text: jobText(job) },
  ];
  if (job.photos.length > 0) {
    blocks.push({
      kind: "files",
      files: job.photos.map((photo, index) => ({
        kind: "photo",
        label: `Photo ${index + 1}`,
        href: jobPhotoPath(photo),
      })),
    });
  }
  return blocks;
}
