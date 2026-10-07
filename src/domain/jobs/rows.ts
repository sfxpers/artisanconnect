import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { startClock } from "../clocks";
import type { Context } from "../context";
import { jobs, regions, suburbs } from "../schema";
import { SERVICE_CATEGORY_NAMES, type ServiceCategory } from "../service-categories";
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
  nextBatchAt: jobs.nextBatchAt,
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

/** The kind of the clock that sends a matched Job's next Batch, fired by the Matches section. */
export const BATCH_CLOCK = "job.next-batch";

/**
 * The writes that open a Job now, for 14 days, and start its clocks: the
 * Client's reminder 24 hours before it Expires, the Expiry, and a matched
 * Job's first Batch, due at once. The first is guarded on what else is given
 * and returns the Job's id if it opened; a clock started for a Job that did
 * not open does nothing when it fires.
 */
export function openWrites(
  ctx: Context,
  job: { id: string; matching: JobRow["matching"] },
  guard?: SQL,
) {
  const now = ctx.now();
  const expiresAt = new Date(now.getTime() + OPEN_DAYS * DAY_MS);
  const matched = job.matching === "matched";
  return [
    ctx.db
      .update(jobs)
      .set({
        state: "open",
        openedAt: now,
        expiresAt,
        nextBatchAt: matched ? now : null,
        updatedAt: now,
      })
      .where(and(eq(jobs.id, job.id), guard))
      .returning({ id: jobs.id }),
    startClock(ctx, {
      kind: EXPIRY_CLOCKS.reminder,
      subjectId: job.id,
      dueAt: new Date(expiresAt.getTime() - REMINDER_LEAD_MS),
    }),
    startClock(ctx, { kind: EXPIRY_CLOCKS.expiry, subjectId: job.id, dueAt: expiresAt }),
    ...(matched ? [startClock(ctx, { kind: BATCH_CLOCK, subjectId: job.id, dueAt: now })] : []),
  ] as const;
}

/** A photo's path in the web app, which serves it only to whoever may see it. */
export function jobPhotoPath(photo: { id: string }, thumbnail = false): string {
  return `/job-photos/${photo.id}${thumbnail ? "?size=thumbnail" : ""}`;
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

/**
 * What an Artisan holding a Job Match or an Invitation sees of a Job in a
 * list, before Payment: the Region, never the suburb.
 */
export const JOB_AS_ARTISAN_COLUMNS = {
  jobId: jobs.id,
  title: jobs.title,
  description: jobs.description,
  category: jobs.category,
  siteType: jobs.siteType,
  regionName: regions.name,
  gasWork: jobs.gasWork,
  preferredStart: jobs.preferredStart,
  photos: jobs.photos,
};

/** A row of `JOB_AS_ARTISAN_COLUMNS` as the Artisan sees it, with its first photo. */
export function jobAsArtisanView<
  Row extends { photos: JobPhoto[]; category: ServiceCategory | null; regionName: string | null },
>({ photos, category, regionName, ...row }: Row) {
  return {
    ...row,
    category: category && { id: category, name: SERVICE_CATEGORY_NAMES[category] },
    region: regionName,
    photo: photos[0] ? photoView(photos[0]) : null,
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
