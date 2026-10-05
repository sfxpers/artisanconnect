import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { startClock } from "../clocks";
import type { Context } from "../context";
import { jobs, regions, suburbs } from "../schema";
import type { StoredFile } from "../uploads";
import { OPEN_DAYS } from "./inputs";

// Reading a Job, and what more than one part of the Jobs section says of one.

export type JobPhoto = Extract<StoredFile, { kind: "photo" }>;

const JOB_COLUMNS = {
  id: jobs.id,
  clientId: jobs.clientId,
  state: jobs.state,
  category: jobs.category,
  siteType: jobs.siteType,
  suburbId: jobs.suburbId,
  suburbName: suburbs.name,
  regionId: regions.id,
  regionName: regions.name,
  street: jobs.street,
  title: jobs.title,
  description: jobs.description,
  photos: jobs.photos,
  gasWork: jobs.gasWork,
  preferredStart: jobs.preferredStart,
  matching: jobs.matching,
  heldFor: jobs.heldFor,
  updatedAt: jobs.updatedAt,
  revision: jobs.revision,
  openedAt: jobs.openedAt,
  expiresAt: jobs.expiresAt,
};

/** A Job, with its suburb's name and Region. */
export async function jobRow(ctx: Context, jobId: string) {
  const [row] = await ctx.db
    .select(JOB_COLUMNS)
    .from(jobs)
    .leftJoin(suburbs, eq(suburbs.id, jobs.suburbId))
    .leftJoin(regions, eq(regions.id, suburbs.regionId))
    .where(eq(jobs.id, jobId));
  return row ?? null;
}

export type JobRow = NonNullable<Awaited<ReturnType<typeof jobRow>>>;

/** A Client's Jobs, the one changed last first. */
export async function jobsOf(ctx: Context, clientId: string) {
  return ctx.db
    .select(JOB_COLUMNS)
    .from(jobs)
    .leftJoin(suburbs, eq(suburbs.id, jobs.suburbId))
    .leftJoin(regions, eq(regions.id, suburbs.regionId))
    .where(eq(jobs.clientId, clientId))
    .orderBy(desc(jobs.updatedAt), desc(jobs.id));
}

/** What the Content check reads of a Job, with its photos. */
export function jobText(job: { title: string; description: string }) {
  return `${job.title}\n\n${job.description}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** How long before a Job Expires its Client is reminded. */
export const REMINDER_LEAD_MS = 24 * HOUR_MS;

/** The kinds of a Job's two clocks, fired by the Jobs section. */
export const EXPIRY_CLOCKS = {
  reminder: "job.expiry-reminder",
  expiry: "job.expires",
} as const;

/**
 * The writes that open a Job now, for 14 days, and start its clocks: the
 * Client's reminder 24 hours before it Expires, and the Expiry. The first is
 * guarded on what else is given and returns the Job's id if it opened; a
 * clock started for a Job that did not open does nothing when it fires.
 * A matched Job's first Batch goes when it opens, once there are Batches (#122).
 */
export function openWrites(ctx: Context, jobId: string, guard?: SQL) {
  const now = ctx.now();
  const expiresAt = new Date(now.getTime() + OPEN_DAYS * DAY_MS);
  return [
    ctx.db
      .update(jobs)
      .set({ state: "open", openedAt: now, expiresAt, updatedAt: now })
      .where(and(eq(jobs.id, jobId), guard))
      .returning({ id: jobs.id }),
    startClock(ctx, {
      kind: EXPIRY_CLOCKS.reminder,
      subjectId: jobId,
      dueAt: new Date(expiresAt.getTime() - REMINDER_LEAD_MS),
    }),
    startClock(ctx, { kind: EXPIRY_CLOCKS.expiry, subjectId: jobId, dueAt: expiresAt }),
  ] as const;
}

/** A photo's path in the web app, which serves it only to whoever may see it. */
export function jobPhotoPath(photo: { id: string }, thumbnail = false): string {
  return `/job-photos/${photo.id}${thumbnail ? "?size=thumbnail" : ""}`;
}

/** Deletes stored photos nothing holds any more; one that will not go is left. */
export async function discardPhotos(ctx: Context, photos: JobPhoto[]) {
  const keys = photos.flatMap((photo) => [photo.key, photo.thumbnailKey]);
  if (keys.length > 0) await ctx.ports.files.delete(keys).catch(() => {});
}

/** A photo as a viewer sees it, by the paths that serve it. */
export function photoView(photo: JobPhoto) {
  return {
    id: photo.id,
    width: photo.width,
    height: photo.height,
    href: jobPhotoPath(photo),
    thumbnailHref: jobPhotoPath(photo, true),
  };
}

/** A photo a Job holds, and whose Job it is. */
export async function jobPhotoById(ctx: Context, photoId: string) {
  const [job] = await ctx.db
    .select({ jobId: jobs.id, photos: jobs.photos })
    .from(jobs)
    .where(
      sql`exists (select 1 from json_each(${jobs.photos}) where json_extract(json_each.value, '$.id') = ${photoId})`,
    )
    .limit(1);
  const photo = job?.photos.find((each) => each.id === photoId);
  return job && photo ? { jobId: job.jobId, photo } : null;
}
