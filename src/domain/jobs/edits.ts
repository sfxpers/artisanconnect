import { and, desc, eq, inArray, notExists, sql, type SQL } from "drizzle-orm";
import type { Context, Write } from "../context";
import { defineHeldKind } from "../content/held";
import { quotesSentOn } from "../quotes/rows";
import { jobEdits, jobs, queueItems } from "../schema";
import { clientSidebar, jobBlocks } from "./held";
import { jobRow, photoView, type JobPhoto } from "./rows";

// Until its first Quote a posted Job's title, description, photos, Site type,
// and Preferred start may change. Each edit is read by the Content check; one
// it is unsure about waits for the Admin's Pre-check (ADR 0020), and the Job
// shows as it was meanwhile, as an Artisan Profile does.

export type JobVersion = {
  title: string;
  description: string;
  photos: JobPhoto[];
  siteType: "home" | "business";
  preferredStart: string | null;
};

/** The states a Job may be edited in, before its first Quote. */
export const EDITABLE_STATES = ["open", "expired"] as const;

/**
 * The writes that apply an edit the Content check cleared, if the Job is
 * still the version the edit was made from. The first returns the Job's id if
 * it applied; otherwise the edit's row is history that shows nothing.
 */
export function applyWrites(
  ctx: Context,
  job: { id: string; revision: number },
  version: JobVersion,
) {
  return [
    applyWrite(ctx, job.id, version, eq(jobs.revision, job.revision)).returning({ id: jobs.id }),
    ctx.db.insert(jobEdits).values({
      id: ctx.newId(),
      jobId: job.id,
      ...version,
      state: "released",
      sentAt: ctx.now(),
    }),
  ] as const;
}

/** The writes that Hold an edit for the Admin's Pre-check. */
export function holdEditWrites(
  ctx: Context,
  job: { id: string; title: string },
  version: JobVersion,
  heldFor: string,
): Write[] {
  const id = ctx.newId();
  return [
    ctx.db.insert(jobEdits).values({
      id,
      jobId: job.id,
      ...version,
      state: "held",
      heldFor,
      sentAt: ctx.now(),
    }),
    heldJobEdit.raise(ctx, { subjectId: id, title: `Job edit: ${job.title}` }).write,
  ];
}

/**
 * The update that shows a version on the Job, while it may still be edited:
 * a Held edit the Admin releases after the first Quote shows nothing.
 */
function applyWrite(ctx: Context, jobId: string, version: JobVersion, guard?: SQL) {
  return ctx.db
    .update(jobs)
    .set({ ...version, updatedAt: ctx.now(), revision: sql`${jobs.revision} + 1` })
    .where(
      and(
        eq(jobs.id, jobId),
        inArray(jobs.state, EDITABLE_STATES),
        notExists(quotesSentOn(ctx, jobs.id)),
        guard,
      ),
    );
}

/**
 * Where the Job's edits stand, from the newest: being checked, which only the
 * Client and the Admin see, or refused, with the Admin's reason.
 */
export async function editsStanding(ctx: Context, jobId: string) {
  const [newest] = await ctx.db
    .select({
      id: jobEdits.id,
      title: jobEdits.title,
      description: jobEdits.description,
      photos: jobEdits.photos,
      siteType: jobEdits.siteType,
      preferredStart: jobEdits.preferredStart,
      state: jobEdits.state,
      reason: queueItems.reason,
    })
    .from(jobEdits)
    .leftJoin(
      queueItems,
      and(eq(queueItems.subjectId, jobEdits.id), eq(queueItems.kind, heldJobEdit.kind)),
    )
    .where(eq(jobEdits.jobId, jobId))
    .orderBy(desc(jobEdits.sentAt), desc(sql.raw(`"job_edits"."rowid"`)))
    .limit(1);
  if (newest?.state !== "held" && newest?.state !== "refused") {
    return { beingChecked: null, refused: null };
  }
  const { state, reason, ...version } = newest;
  return state === "held"
    ? { beingChecked: version, refused: null }
    : { beingChecked: null, refused: { ...version, reason: reason ?? "" } };
}

/** An edit as its Client sees it: each photo by the path that serves it. */
export function versionView(version: JobVersion) {
  return {
    title: version.title,
    description: version.description,
    siteType: version.siteType,
    preferredStart: version.preferredStart,
    photos: version.photos.map(photoView),
  };
}

/** The writes that withdraw a Held edit, guarded on its still being Held. */
export async function withdrawEdit(ctx: Context, editId: string): Promise<Write[]> {
  return [
    ctx.db
      .update(jobEdits)
      .set({ state: "withdrawn" })
      .where(and(eq(jobEdits.id, editId), eq(jobEdits.state, "held"))),
    ...(await heldJobEdit.withdraw(ctx, editId)),
  ];
}

/** The photos an edit added: once it is withdrawn they are nobody's; those it kept stay on the Job. */
export function addedBy(edit: { photos: JobPhoto[] }, job: { photos: JobPhoto[] }) {
  const onJob = new Set(job.photos.map((photo) => photo.id));
  return edit.photos.filter((photo) => !onJob.has(photo.id));
}

async function editRow(ctx: Context, editId: string) {
  const [row] = await ctx.db.select().from(jobEdits).where(eq(jobEdits.id, editId));
  return row ?? null;
}

/** A photo some edit holds, and whose Job it is on. */
export async function editPhotoById(ctx: Context, photoId: string) {
  const [edit] = await ctx.db
    .select({ jobId: jobEdits.jobId, photos: jobEdits.photos })
    .from(jobEdits)
    .where(
      sql`exists (select 1 from json_each(${jobEdits.photos}) where json_extract(json_each.value, '$.id') = ${photoId})`,
    )
    .limit(1);
  const photo = edit?.photos.find((each) => each.id === photoId);
  return edit && photo ? { jobId: edit.jobId, photo } : null;
}

export const heldJobEdit = defineHeldKind("held.job-edit", {
  async sender(ctx, subjectId) {
    const edit = await editRow(ctx, subjectId);
    return (edit && (await jobRow(ctx, edit.jobId))?.clientId) ?? null;
  },
  async release(ctx, _admin, subjectId) {
    const edit = await editRow(ctx, subjectId);
    if (!edit) return [];
    return [
      ctx.db
        .update(jobEdits)
        .set({ state: "released" })
        .where(and(eq(jobEdits.id, subjectId), eq(jobEdits.state, "held"))),
      applyWrite(ctx, edit.jobId, versionOf(edit)),
    ];
  },
  async refuse(ctx, _admin, subjectId) {
    return [
      ctx.db
        .update(jobEdits)
        .set({ state: "refused" })
        .where(and(eq(jobEdits.id, subjectId), eq(jobEdits.state, "held"))),
    ];
  },
  told: {
    released: "Your Job edit is checked and shown",
    refused: "Your Job edit was refused",
    link: async (ctx, subjectId) => `/jobs/${(await editRow(ctx, subjectId))?.jobId ?? ""}`,
  },
  async view(ctx, item) {
    const edit = await editRow(ctx, item.subjectId);
    const job = edit && (await jobRow(ctx, edit.jobId));
    if (!edit || !job) return { tabs: [], sidebar: [] };
    return {
      tabs: [
        { key: "edit", label: "The edit", blocks: jobBlocks({ ...job, ...versionOf(edit) }) },
        { key: "shown", label: "Shown now", blocks: jobBlocks(job) },
        {
          key: "check",
          label: "Content check",
          blocks: [{ kind: "text", text: edit.heldFor ?? "The Content check could not run." }],
        },
      ],
      sidebar: await clientSidebar(ctx, job.clientId),
    };
  },
});

function versionOf(edit: JobVersion): JobVersion {
  const { title, description, photos, siteType, preferredStart } = edit;
  return { title, description, photos, siteType, preferredStart };
}
