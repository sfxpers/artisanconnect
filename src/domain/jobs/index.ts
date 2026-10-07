import { and, eq, sql } from "drizzle-orm";
import { accountIdOf, type Actor } from "../actor";
import { firstProblem } from "../accounts/inputs";
import { checkContent } from "../content/check";
import { alreadyChecked, isAlreadyDecided } from "../content/held";
import type { Context } from "../context";
import { causedBy } from "../errors";
import { ok, refuse } from "../result";
import { saDay } from "../sa-days";
import { clientShownName, publicName } from "../accounts/names";
import { accounts, jobs, suburbs, type JOB_STATES } from "../schema";
import { defineSection } from "../section";
import { SERVICE_CATEGORY_NAMES } from "../service-categories";
import { checkFileCount, discardFiles, uploadFile, UPLOAD_CONTEXTS } from "../uploads";
import { heldInvitation } from "../invitations";
import { heldMatch } from "../matches";
import { closeJobWrites } from "../quotes/ends";
import { hasHadQuote, isLive, newestQuote, takesQuotesNow } from "../quotes/rows";
import { ownQuoteView } from "../quotes/views";
import { sendDueBatch } from "../matches/batches";
import { emailTells } from "../tells";
import { engagementAsArtisan, engagementAsClient, notHiredPayments } from "../engagements/views";
import { expiryClocks } from "./expiry";
import { heldJob, holdWrites, refusalOf, stillDraft, withdrawHeldJob } from "./held";
import {
  EDITABLE_STATES,
  addedBy,
  editPhotoById,
  applyWrites,
  editsStanding,
  heldJobEdit,
  holdEditWrites,
  versionView,
  withdrawEdit,
} from "./edits";
import { draftFields, editFields, type DraftFields, type EditFields } from "./inputs";
import {
  jobPhotoById,
  jobRow,
  jobsOf,
  jobText,
  openWrites,
  photoView,
  type JobPhoto,
  type JobRow,
} from "./rows";

type JobState = (typeof JOB_STATES)[number];

// Posting a Job (#121, ADR 0003): a Client gives a Job its trade, site,
// details, and photos, and chooses matched or Invite-only. A Draft may omit
// anything and is the Client's alone. Posting reads it with the Content check
// and opens it, or Holds it for the Admin (ADR 0020).

/** Photos as the Client sends them: the ids of those to keep, in order, and new ones. */
type PhotosInput = { keep?: string[]; add?: Blob[] };

export const jobsSection = defineSection({
  name: "jobs",
  queueItems: [heldJob, heldJobEdit],
  clocks: expiryClocks,
  api: (ctx) => ({
    /**
     * Saves a new Draft, or the Client's Draft by id, whole: anything may be
     * left out. Photos not kept are deleted.
     */
    async saveDraft(actor: Actor, input: DraftFields & PhotosInput & { jobId?: string }) {
      if (actor.kind !== "client") return refuse("clients-only", CLIENTS_ONLY);
      const parsed = draftFields.safeParse(input);
      if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
      const fields = parsed.data;
      if (fields.suburbId && !(await suburbExists(ctx, fields.suburbId))) {
        return refuse("invalid", "That is not one of the City's suburbs. Choose from the list.");
      }
      const draft = input.jobId ? await jobRow(ctx, input.jobId) : null;
      if (input.jobId && (draft?.clientId !== actor.accountId || draft.state !== "draft")) {
        return noDraft();
      }

      const photos = await takePhotos(ctx, draft?.photos ?? [], input);
      if (!photos.ok) return photos;
      const { kept, added, removed } = photos.value;
      const now = ctx.now();
      const values = {
        category: fields.category ?? null,
        siteType: fields.siteType ?? null,
        suburbId: fields.suburbId ?? null,
        street: fields.street,
        title: fields.title,
        description: fields.description,
        photos: [...kept, ...added],
        // Only Plumbing asks about gas.
        gasWork: fields.category === "plumbing" ? (fields.gasWork ?? null) : null,
        preferredStart: fields.preferredStart,
        matching: fields.matching ?? null,
        updatedAt: now,
      };
      let jobId: string;
      try {
        if (draft) {
          const saved = await ctx.db
            .update(jobs)
            .set({ ...values, revision: sql`${jobs.revision} + 1` })
            .where(and(eq(jobs.id, draft.id), stillDraft(draft)))
            .returning({ id: jobs.id });
          if (saved.length === 0) {
            await discardFiles(ctx, added);
            return changed();
          }
          jobId = draft.id;
        } else {
          jobId = ctx.newId();
          await ctx.db.insert(jobs).values({
            id: jobId,
            clientId: actor.accountId,
            state: "draft",
            createdAt: now,
            ...values,
          });
        }
      } catch (error) {
        await discardFiles(ctx, added);
        throw error;
      }
      await discardFiles(ctx, removed);
      return ok({ jobId });
    },

    /**
     * Posts the Client's Draft once it has everything a Job needs. Its text
     * and photos are read by the Content check: a sure hit is refused with the
     * reason and the Draft is kept; an unsure one Holds it for the Admin.
     * Otherwise it opens for 14 days. The trade, the site, the gas answer, and
     * the matching choice lock now.
     */
    async post(actor: Actor, input: { jobId: string }) {
      const job = await jobRow(ctx, input.jobId);
      if (!job || job.clientId !== accountIdOf(actor) || job.state !== "draft") return noDraft();
      const problem = postingProblem(job, job.photos.length, saDay(ctx.now()));
      if (problem) return refuse("incomplete", problem);

      const checked = await checkContent(ctx, {
        text: jobText(job),
        files: job.photos,
        context: { kind: "before-payment" },
      });
      if (!checked.ok) return checked;
      const verdict = checked.value;
      const held = verdict.verdict === "held";
      // A batch, not a commit, to read whether the guarded move landed.
      const [moved] =
        verdict.verdict === "held"
          ? await ctx.db.batch(holdWrites(ctx, job, verdict.reason))
          : await ctx.db.batch(openWrites(ctx, job, stillDraft(job)));
      if (moved.length === 0) return changed();
      if (!held) await offer(ctx, job.id);
      return ok({ state: held ? ("held" as const) : ("open" as const) });
    },

    /**
     * Changes a posted Job's title, description, photos, Site type, and
     * Preferred start, sent whole. The rest locked at posting. The edit is
     * read by the Content check: a sure hit is refused with the reason; an
     * unsure one waits for the Admin, and the Job shows as it was meanwhile.
     */
    async edit(actor: Actor, input: EditFields & PhotosInput & { jobId: string }) {
      const job = await jobRow(ctx, input.jobId);
      if (!job || job.clientId !== accountIdOf(actor)) return noJob();
      if (!isEditable(job.state)) {
        return refuse("not-editable", "Only an Open or Expired Job can be edited.");
      }
      if (await hasHadQuote(ctx, job.id)) {
        return refuse("not-editable", "A Job that has had a Quote cannot be edited.");
      }
      const parsed = editFields.safeParse(input);
      if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
      const fields = parsed.data;
      const keep = [...new Set(input.keep ?? [])];
      const add = input.add ?? [];
      const problem = postingProblem(
        {
          ...job,
          ...fields,
          // A date given before it passed stays, so the rest can still change.
          preferredStart:
            fields.preferredStart === job.preferredStart ? null : fields.preferredStart,
        },
        keep.length + add.length,
        saDay(ctx.now()),
      );
      if (problem) return refuse("invalid", problem);
      const unchanged =
        add.length === 0 &&
        keep.join() === job.photos.map((photo) => photo.id).join() &&
        (["title", "description", "siteType", "preferredStart"] as const).every(
          (field) => fields[field] === job[field],
        );
      if (unchanged) return refuse("unchanged", "Nothing has changed.");
      if ((await editsStanding(ctx, job.id)).beingChecked) return editBeingChecked();

      const photos = await takePhotos(ctx, job.photos, { keep, add });
      if (!photos.ok) return photos;
      const { kept, added, removed } = photos.value;
      let applied: boolean;
      try {
        // Photos kept were read already.
        const checked = await checkContent(ctx, {
          text: jobText(fields),
          files: added,
          context: { kind: "before-payment" },
        });
        if (!checked.ok) {
          await discardFiles(ctx, added);
          return checked;
        }
        const verdict = checked.value;
        const version = { ...fields, photos: [...kept, ...added] };
        applied = verdict.verdict === "clear";
        if (verdict.verdict === "held") {
          await ctx.commit(holdEditWrites(ctx, job, version, verdict.reason));
        } else {
          // A batch, not a commit, to read whether the guarded update landed.
          const [landed] = await ctx.db.batch(applyWrites(ctx, job, version));
          if (landed.length === 0) {
            await discardFiles(ctx, added);
            return changed();
          }
        }
      } catch (error) {
        // Nothing stored stays behind an edit that was not written.
        await discardFiles(ctx, added);
        if (causedBy(error, "UNIQUE constraint failed: job_edits.job_id")) {
          return editBeingChecked();
        }
        throw error;
      }
      if (applied) await discardFiles(ctx, removed);
      return ok({ edit: applied ? ("applied" as const) : ("being-checked" as const) });
    },

    /**
     * Withdraws what of the Client's Job is being checked: a Held Job, which
     * is a Draft again, or a Held edit, which leaves the Job as it was.
     */
    async withdraw(actor: Actor, input: { jobId: string }) {
      const job = await jobRow(ctx, input.jobId);
      if (!job || job.clientId !== accountIdOf(actor)) return noJob();
      const { beingChecked } = await editsStanding(ctx, job.id);
      if (job.state !== "held" && !beingChecked) {
        return refuse("nothing-held", "Nothing on this Job is being checked.");
      }
      try {
        await ctx.commit(
          job.state === "held"
            ? await withdrawHeldJob(ctx, job.id)
            : await withdrawEdit(ctx, beingChecked!.id),
        );
      } catch (error) {
        if (isAlreadyDecided(error)) return alreadyChecked();
        throw error;
      }
      if (beingChecked && job.state !== "held") await discardFiles(ctx, addedBy(beingChecked, job));
      return ok({});
    },

    /**
     * Closes the Client's Open Job before Hire. Its Sent Quotes are Declined,
     * and their Artisans told; its Held ones are never Sent.
     */
    async close(actor: Actor, input: { jobId: string }) {
      const job = await jobRow(ctx, input.jobId);
      if (!job || job.clientId !== accountIdOf(actor)) return noJob();
      if (job.state !== "open") return notOpen();
      const { beingChecked } = await editsStanding(ctx, job.id);
      try {
        await ctx.commit([
          // Unguarded on purpose: on a Job no longer Open a trigger aborts the batch.
          ctx.db
            .update(jobs)
            .set({ state: "closed", updatedAt: ctx.now() })
            .where(eq(jobs.id, job.id)),
          // An edit waiting on a closed Job has nothing to show on.
          ...(beingChecked ? await withdrawEdit(ctx, beingChecked.id) : []),
          ...(await closeJobWrites(ctx, actor, job)),
        ]);
      } catch (error) {
        if (isRefusedMove(error)) return notOpen();
        if (isAlreadyDecided(error)) return changed();
        throw error;
      }
      if (beingChecked) await discardFiles(ctx, addedBy(beingChecked, job));
      await emailTells(ctx).catch((error: unknown) => {
        console.error("Tell emails did not go", error);
      });
      return ok({});
    },

    /**
     * Renews the Client's Expired Job: it opens for a new 14 days, and its
     * Quotes count from zero.
     */
    async renew(actor: Actor, input: { jobId: string }) {
      const job = await jobRow(ctx, input.jobId);
      if (!job || job.clientId !== accountIdOf(actor)) return noJob();
      if (job.state !== "expired") return notExpired();
      try {
        // Unguarded on purpose: on a Job no longer Expired a trigger aborts the batch.
        await ctx.commit([...openWrites(ctx, job)]);
      } catch (error) {
        if (isRefusedMove(error)) return notExpired();
        throw error;
      }
      await offer(ctx, job.id);
      return ok({});
    },

    /** Discards the Client's Draft and its photos. */
    async discard(actor: Actor, input: { jobId: string }) {
      const draft = await jobRow(ctx, input.jobId);
      if (!draft || draft.clientId !== accountIdOf(actor) || draft.state !== "draft") {
        return noDraft();
      }
      const deleted = await ctx.db
        .delete(jobs)
        .where(and(eq(jobs.id, draft.id), eq(jobs.state, "draft")))
        .returning({ id: jobs.id });
      if (deleted.length === 0) return noDraft();
      await discardFiles(ctx, draft.photos);
      return ok({});
    },

    /** The Client's Jobs: those needing the Client, those in progress, and those finished. */
    async mine(viewer: Actor) {
      if (viewer.kind !== "client") return null;
      const rows = await jobsOf(ctx, viewer.accountId);
      const summaries = rows.map((row) => ({
        jobId: row.id,
        title: row.title,
        state: row.state,
        category: row.category && SERVICE_CATEGORY_NAMES[row.category],
        region: row.regionName,
        updatedAt: row.updatedAt,
        expiresAt: row.expiresAt,
      }));
      return {
        needsYou: summaries.filter((job) => GROUPS[job.state] === "needsYou"),
        inProgress: summaries.filter((job) => GROUPS[job.state] === "inProgress"),
        finished: summaries.filter((job) => GROUPS[job.state] === "finished"),
      };
    },

    /**
     * A Job photo's stored copy, or its thumbnail, a Draft's or an edit's
     * too: to the Job's Client and the Admin. An Artisan who sees the Job
     * sees the photos it shows, never an edit's.
     */
    async photo(viewer: Actor, input: { jobId: string; photoId: string; thumbnail?: boolean }) {
      const onJob = await jobPhotoById(ctx, input.jobId, input.photoId);
      const photo = onJob ?? (await editPhotoById(ctx, input.jobId, input.photoId));
      if (!photo) return null;
      if (viewer.kind !== "admin") {
        const job = await jobRow(ctx, input.jobId);
        const holding =
          !!onJob && !!job && viewer.kind === "artisan" && (await seesJob(ctx, job, viewer));
        if (!job || (job.clientId !== accountIdOf(viewer) && !holding)) return null;
      }
      const object = await ctx.ports.files.get(input.thumbnail ? photo.thumbnailKey : photo.key);
      if (!object) return null;
      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType ?? "image/webp",
        size: object.size,
      };
    },

    /** The Job as its Client sees it, with the street; null for anyone else. */
    async view(viewer: Actor, input: { jobId: string }) {
      const job = await jobRow(ctx, input.jobId);
      if (!job || job.clientId !== accountIdOf(viewer)) return null;
      const [refusal, edits, quoted, takesQuotes, engagement, notHired] = await Promise.all([
        refusalOf(ctx, job),
        editsStanding(ctx, job.id),
        hasHadQuote(ctx, job.id),
        takesQuotesNow(ctx, job.id),
        engagementAsClient(ctx, job),
        notHiredPayments(ctx, job.id),
      ]);
      return {
        jobId: job.id,
        state: job.state,
        category: job.category && { id: job.category, name: SERVICE_CATEGORY_NAMES[job.category] },
        siteType: job.siteType,
        suburb: job.suburbId ? { id: job.suburbId, name: job.suburbName ?? "" } : null,
        region: job.regionId ? { id: job.regionId, name: job.regionName ?? "" } : null,
        street: job.street,
        title: job.title,
        description: job.description,
        photos: job.photos.map((photo) => photoView(job.id, photo)),
        gasWork: job.gasWork,
        preferredStart: job.preferredStart,
        matching: job.matching,
        openedAt: job.openedAt,
        expiresAt: job.expiresAt,
        /** Whether the Client may edit it: Open or Expired, before its first Quote. */
        editable: isEditable(job.state) && !quoted,
        /** Whether the Job takes Quotes, and so Invitations: Open, with fewer than five. */
        takesQuotes,
        /** Why the Admin refused it when it was last posted, while it is a Draft again. */
        refused: refusal === null ? null : { reason: refusal },
        /** An edit being checked, which only the Client and the Admin see, or one refused. */
        edit: {
          beingChecked: edits.beingChecked && versionView(job.id, edits.beingChecked),
          refused: edits.refused && {
            ...versionView(job.id, edits.refused),
            reason: edits.refused.reason,
          },
        },
        /** The Engagement, once a Quote is Hired. */
        engagement,
        /** Payments that arrived but Hired nobody, each refunded whole. */
        notHired,
      };
    },

    /**
     * The Job as an Artisan sees it while they hold a Job Match for it and it
     * is Open, while they hold an Invitation for it, or once they have Quoted
     * on it: the
     * Region, never the suburb or street, and the Client by shown name and
     * record; null for anyone else.
     */
    async viewAsArtisan(viewer: Actor, input: { jobId: string }) {
      if (viewer.kind !== "artisan") return null;
      const job = await jobRow(ctx, input.jobId);
      if (!job) return null;
      const [held, quote, invitation, [client]] = await Promise.all([
        heldOnJob(ctx, job, viewer),
        newestQuote(ctx, job.id, viewer.accountId),
        heldInvitation(ctx, job.id, viewer.accountId),
        ctx.db
          .select({
            name: accounts.name,
            tradingName: accounts.tradingName,
            namesShown: accounts.namesShown,
          })
          .from(accounts)
          .where(eq(accounts.id, job.clientId)),
      ]);
      // A Quote keeps the Job in view, whatever becomes of it or the Job, and
      // so does an Invitation not passed, for its Conversation.
      if (!held && !isLive(quote) && !invitation) return null;
      const engagement = await engagementAsArtisan(ctx, job.id, viewer.accountId);
      return {
        jobId: job.id,
        state: job.state,
        category: job.category && { id: job.category, name: SERVICE_CATEGORY_NAMES[job.category] },
        siteType: job.siteType,
        region: job.regionId ? { id: job.regionId, name: job.regionName ?? "" } : null,
        /** The suburb and street, withheld from every Artisan until Payment, then shown to the Hired one. */
        address: engagement && {
          suburb: job.suburbName ?? "",
          street: job.street,
        },
        title: job.title,
        description: job.description,
        photos: job.photos.map((photo) => photoView(job.id, photo)),
        gasWork: job.gasWork,
        preferredStart: job.preferredStart,
        /** The Engagement, if the Artisan was Hired. */
        engagement,
        /** When a Batch offered it the Artisan, if one did and they have not passed. */
        offeredAt: held?.offeredAt ?? null,
        /** When the Client invited the Artisan, if they did. */
        invitedAt: held?.invitedAt ?? null,
        /** The Artisan's own Quote, if they have one. */
        quote: await ownQuoteView(ctx, quote),
        /** Whether the Job takes Quotes now: Open, with fewer than five. */
        takesQuotes: await takesQuotesNow(ctx, job.id),
        client: {
          // Names the Content check has not passed are nobody else's to see.
          shownName: client?.namesShown ? clientShownName(publicName(client)) : null,
          // Reviews and Completed Engagements come with their tickets (#138, #130).
          reviews: { average: null, count: 0 },
          completed: 0,
        },
      };
    },
  }),
});

const CLIENTS_ONLY = "Only a Client posts a Job.";

/**
 * What the Artisan holds for the Job while it is Open, a Job Match not passed
 * or an Invitation, with when each came; null if neither.
 */
async function heldOnJob(ctx: Context, job: JobRow, artisan: { accountId: string }) {
  if (job.state !== "open") return null;
  const [match, invitation] = await Promise.all([
    heldMatch(ctx, job.id, artisan.accountId),
    heldInvitation(ctx, job.id, artisan.accountId),
  ]);
  if (!match && !invitation) return null;
  return { offeredAt: match?.offeredAt ?? null, invitedAt: invitation?.invitedAt ?? null };
}

/**
 * Whether the Artisan sees the Job: they hold it while it is Open, they hold
 * an Invitation for it, or they have Quoted on it.
 */
async function seesJob(ctx: Context, job: JobRow, artisan: { accountId: string }) {
  const [held, quote, invitation] = await Promise.all([
    heldOnJob(ctx, job, artisan),
    newestQuote(ctx, job.id, artisan.accountId),
    heldInvitation(ctx, job.id, artisan.accountId),
  ]);
  return !!held || isLive(quote) || !!invitation;
}

/** Sends a Job just opened its first Batch, if it is matched, and the Tells' emails. */
async function offer(ctx: Context, jobId: string) {
  await sendDueBatch(ctx, jobId);
  // The Job is open whatever happens to an email; the clocks retry one that did not go.
  await emailTells(ctx).catch((error: unknown) => {
    console.error("Tell emails did not go", error);
  });
}

/**
 * Where each Job sits in My Jobs. An Expired Job is Finished: nothing waits
 * on the Client, who may still Renew it.
 */
const GROUPS: Record<JobState, "needsYou" | "inProgress" | "finished"> = {
  draft: "needsYou",
  held: "inProgress",
  open: "inProgress",
  hired: "inProgress",
  expired: "finished",
  closed: "finished",
};

function notOpen() {
  return refuse("not-open", "Only an Open Job can be closed.");
}

function notExpired() {
  return refuse("not-expired", "Only an Expired Job can be renewed.");
}

/** Whether a batch failed because the Job had moved on, and a trigger refused the move. */
function isRefusedMove(error: unknown) {
  return causedBy(error, "a Job cannot change that way");
}

function noDraft() {
  return refuse("not-found", "That Draft does not exist. Reload the page.");
}

function changed() {
  return refuse(
    "changed",
    "This Job changed while you were working on it. Reload the page and try again.",
  );
}

function editBeingChecked() {
  return refuse(
    "being-checked",
    "Your last edit of this Job is being checked. Withdraw it to send another.",
  );
}

function isEditable(state: JobState) {
  return (EDITABLE_STATES as readonly JobState[]).includes(state);
}

function noJob() {
  return refuse("not-found", "That Job does not exist.");
}

/** What a Job would need from the Client, an incomplete Draft's or an edit's; null if nothing. */
function postingProblem(
  job: Pick<
    JobRow,
    | "category"
    | "gasWork"
    | "siteType"
    | "suburbId"
    | "street"
    | "title"
    | "description"
    | "matching"
    | "preferredStart"
  >,
  photoCount: number,
  today: string,
): string | null {
  if (!job.category) return "Choose a Service Category.";
  if (job.category === "plumbing" && job.gasWork === null) {
    return "Say whether the work installs or removes gas.";
  }
  if (!job.siteType) return "Choose Home or Business.";
  if (!job.suburbId) return "Choose the suburb.";
  if (!job.street) return "Write the street address.";
  if (!job.title) return "Write the title.";
  if (!job.description) return "Write the description.";
  if (photoCount === 0) return "Add at least one photo.";
  if (!job.matching) return 'Choose "Find Artisans for me" or "Only Artisans I invite".';
  if (job.preferredStart && job.preferredStart < today) {
    return "The Preferred start date has passed.";
  }
  return null;
}

async function suburbExists(ctx: Context, suburbId: string) {
  const [row] = await ctx.db
    .select({ id: suburbs.id })
    .from(suburbs)
    .where(eq(suburbs.id, suburbId));
  return !!row;
}

/**
 * Keeps the photos named, in that order, and uploads the new ones. Nothing is
 * stored if the count is over or any file is refused.
 */
async function takePhotos(ctx: Context, holding: JobPhoto[], input: PhotosInput) {
  const keep = [...new Set(input.keep ?? [])];
  const add = input.add ?? [];
  const kept = keep.map((id) => holding.find((photo) => photo.id === id));
  if (kept.some((photo) => !photo)) {
    return refuse("invalid", "That photo is not on this Job. Reload the page.");
  }
  const counted = checkFileCount("jobPhotos", keep.length + add.length);
  if (!counted.ok) return counted;
  const added: JobPhoto[] = [];
  try {
    for (const file of add) {
      const uploaded = await uploadFile(ctx, file, UPLOAD_CONTEXTS.beforePayment);
      if (!uploaded.ok) {
        await discardFiles(ctx, added);
        return uploaded;
      }
      if (uploaded.value.kind === "photo") added.push(uploaded.value);
    }
  } catch (error) {
    await discardFiles(ctx, added);
    throw error;
  }
  return ok({
    kept: kept as JobPhoto[],
    added,
    removed: holding.filter((photo) => !keep.includes(photo.id)),
  });
}
