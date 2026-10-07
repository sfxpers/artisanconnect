import { and, asc, desc, eq, exists, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { system, type Actor } from "../actor";
import { startClock, type ClockHandler } from "../clocks";
import { checkContent, readFiles } from "../content/check";
import { alreadyChecked, defineHeldKind, isAlreadyDecided } from "../content/held";
import { patternHit, type PatternHit } from "../content/patterns";
import type { Context, Write } from "../context";
import { causedBy } from "../errors";
import { eventWrite } from "../conversations/rows";
import { insertWhile } from "../guarded";
import { jobBlocks } from "../jobs/held";
import { jobRow } from "../jobs/rows";
import { engagementMoney, LEDGER_KINDS, ledgerWrites, releaseRows } from "../ledger";
import type { Block } from "../queues";
import { accountSidebar } from "../quotes/held";
import { ok, refuse, type Result } from "../result";
import { formatTime } from "../sa-days";
import {
  completions,
  engagements,
  queueItems,
  verificationChecks,
  type CompletionDocument,
  type ENGAGEMENT_STATES,
} from "../schema";
import { emailTells, tellWhile } from "../tells";
import {
  checkFileCount,
  uploadFile,
  UPLOAD_CONTEXTS,
  type StoredFile,
  type UploadContext,
} from "../uploads";
import type { CheckKind } from "../verification/checks";
import { found } from "../verification/reading";
import { CERTIFICATES, certificateNeeded, NOTE_MAX, type CertificateKind } from "./inputs";
import { engagementRow, type EngagementRow } from "./rows";

// Completion, Approval, and Fix requests (#130, ADR 0006). After Work started
// the Artisan marks the work complete, with a note, after-work photos, and any
// documents, the certificate the law requires among them. The Client
// approves it, asks for a fix, or says nothing for seven days, which is
// Approval; Approval releases the Labour, less the Artisan Fee, and the
// Engagement is Completed. A Fix request stops the clock, and the next
// Completion starts a new seven days, with no limit on rounds.
//
// Everything sent is read first (ADR 0011): a sure hit is refused; an unsure
// one, or a certificate not surely read as its kind with the Artisan's
// registration number, Holds the Completion for the Admin (ADR 0020), and
// the seven days start only once it is released.

/** The clock that makes a Completion's silence Approval. Its subject is the Completion. */
export const APPROVAL_CLOCK = "engagement.approval";
/** The clock that reminds the Client 24 hours before Approval by silence. */
export const APPROVAL_REMINDER_CLOCK = "engagement.approval-reminder";

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long the Client has to answer a Completion before its silence is Approval. */
const APPROVAL_MS = 7 * DAY_MS;

/** The states an Engagement may be marked complete from. */
const COMPLETABLE = ["work-started", "fix-requested"] as const;

export type CompletionRow = typeof completions.$inferSelect;
type EngagementState = (typeof ENGAGEMENT_STATES)[number];
type Photo = Extract<StoredFile, { kind: "photo" }>;

/** When a Completion made at this time is Approved by silence. */
export function approvalAt(madeAt: Date): Date {
  return new Date(madeAt.getTime() + APPROVAL_MS);
}

/** The path that serves a Completion's file, or a photo's thumbnail. */
export function completionFilePath(file: { id: string }, thumbnail = false): string {
  return `/completion-files/${file.id}${thumbnail ? "?size=thumbnail" : ""}`;
}

/**
 * The Artisan marks the work complete on their Engagement. A Completion the
 * checks pass makes the Engagement Awaiting approval, and the Client is told
 * when its silence will be Approval; one they are unsure of is Held.
 */
export async function markComplete(
  ctx: Context,
  actor: Actor,
  input: {
    engagementId: string;
    note: string;
    photos: Blob[];
    documents?: Blob[];
    /** The certificate of compliance, or of conformity, a Job that needs one requires. */
    certificate?: Blob;
  },
) {
  const engagement = await engagementRow(ctx, input.engagementId);
  if (actor.kind !== "artisan" || !engagement || engagement.artisanId !== actor.accountId) {
    return notFound();
  }
  const completable = canMarkComplete(engagement);
  if (!completable.ok) return completable;
  if (await heldCompletionOf(ctx, engagement.id)) {
    return refuse(
      "being-checked",
      "Your Completion is being checked. Withdraw it to send another.",
    );
  }
  const note = input.note.trim();
  if (!note) return refuse("invalid", "Write a note on what was done.");
  if (note.length > NOTE_MAX) {
    return refuse("invalid", `A note is at most ${NOTE_MAX} characters.`);
  }
  if (input.photos.length === 0) {
    return refuse("invalid", "Add at least one photo of the finished work.");
  }
  const documents = input.documents ?? [];
  const counted = [
    checkFileCount("completionPhotos", input.photos.length),
    checkFileCount("completionDocuments", documents.length + (input.certificate ? 1 : 0)),
  ].find((result) => !result.ok);
  if (counted) return counted;
  const needed = certificateNeeded(engagement);
  if (needed && !input.certificate) {
    const { name, neededOn } = CERTIFICATES[needed];
    return refuse("certificate-needed", `Add the ${name}: ${neededOn} needs it at Completion.`);
  }
  if (!needed && input.certificate) {
    return refuse(
      "certificate-not-needed",
      "This Job needs no certificate. Add it as a document instead.",
    );
  }

  const stored: StoredFile[] = [];
  try {
    const photos = await take(ctx, input.photos, UPLOAD_CONTEXTS.afterWorkPhotos, stored);
    if (!photos.ok) return await discarded(ctx, stored, photos);
    const others = await take(ctx, documents, UPLOAD_CONTEXTS.completionDocuments, stored);
    if (!others.ok) return await discarded(ctx, stored, others);
    const certificate = input.certificate
      ? await take(ctx, [input.certificate], UPLOAD_CONTEXTS.completionDocuments, stored)
      : ok([]);
    if (!certificate.ok) return await discarded(ctx, stored, certificate);

    // The certificate is read for what it is below; a long number on it is no reason to refuse it.
    const checked = await checkContent(ctx, {
      text: note,
      files: [...photos.value, ...others.value],
      context: { kind: "engagement-conversation", engagementId: engagement.id },
    });
    if (!checked.ok) return await discarded(ctx, stored, checked);
    const [certificateFile] = certificate.value;
    const reading =
      needed && certificateFile
        ? await readCertificate(ctx, engagement, needed, certificateFile)
        : { reasons: [], facts: [] };
    const reasons = [
      ...(checked.value.verdict === "held" ? [checked.value.reason] : []),
      ...reading.reasons,
    ];

    const now = ctx.now();
    const completion: CompletionRow = {
      id: ctx.newId(),
      engagementId: engagement.id,
      note,
      photos: photos.value.filter((file): file is Photo => file.kind === "photo"),
      documents: [
        ...others.value.map((file) => documentOf(file, false)),
        ...certificate.value.map((file) => documentOf(file, true)),
      ],
      state: "held",
      heldFor: reasons.length > 0 ? reasons.join("\n") : null,
      certificateFacts: reading.facts,
      sentAt: now,
      madeAt: null,
      answer: null,
      answeredAt: null,
      fixNote: null,
      fixNoteState: null,
      fixNoteHeldFor: null,
    };
    const stillCompletable = engagementIn(ctx, engagement.id, COMPLETABLE);
    const held = reasons.length > 0;
    const [inserted] = await ctx.db.batch([
      insertWhile(
        ctx,
        completions,
        held ? completion : { ...completion, state: "made", madeAt: now },
        stillCompletable,
      ).returning({ id: completions.id }),
      ...(held
        ? [
            heldCompletion.raise(
              ctx,
              { subjectId: completion.id, title: `Completion: ${engagement.jobTitle}` },
              completionIn(ctx, completion.id, "held"),
            ).write,
          ]
        : madeWrites(ctx, actor, engagement, completion.id, now)),
    ]);
    // The Engagement moved on between the read and the batch.
    if (inserted.length === 0) {
      await discardFiles(ctx, stored);
      const standing = canMarkComplete((await engagementRow(ctx, engagement.id))!);
      return standing.ok
        ? refuse("not-open", "This Engagement can no longer be marked complete.")
        : standing;
    }
    if (held) return ok({ state: "held" as const });
  } catch (error) {
    await discardFiles(ctx, stored);
    // Another Completion landed between the read and the batch, as a second tap's would.
    if (causedBy(error, "UNIQUE constraint failed: completions.engagement_id")) {
      return refuse("already-sent", "Your Completion was already sent.");
    }
    throw error;
  }
  await emailTells(ctx).catch((error: unknown) => {
    console.error("Tell emails did not go", error);
  });
  return ok({ state: "made" as const });
}

/** The Artisan withdraws their Completion being checked. Nobody is told. */
export async function withdrawCompletion(
  ctx: Context,
  actor: Actor,
  input: { engagementId: string },
) {
  const engagement = await engagementRow(ctx, input.engagementId);
  if (actor.kind !== "artisan" || !engagement || engagement.artisanId !== actor.accountId) {
    return notFound();
  }
  const held = await heldCompletionOf(ctx, engagement.id);
  if (!held) return refuse("nothing-held", "No Completion of yours is being checked.");
  try {
    await ctx.commit([
      ctx.db
        .update(completions)
        .set({ state: "withdrawn" })
        .where(and(eq(completions.id, held.id), eq(completions.state, "held"))),
      ...(await heldCompletion.withdraw(ctx, held.id)),
    ]);
  } catch (error) {
    if (isAlreadyDecided(error)) return alreadyChecked();
    throw error;
  }
  // The Admin may have decided it between the read and the batch, which then changed nothing.
  if ((await completionRow(ctx, held.id))?.state !== "withdrawn") return alreadyChecked();
  await discardFiles(ctx, [...held.photos, ...held.documents]);
  return ok({});
}

/** The Client approves the Completion, which releases the Labour and makes the Engagement Completed. */
export async function approve(ctx: Context, actor: Actor, input: { engagementId: string }) {
  const engagement = await engagementRow(ctx, input.engagementId);
  if (actor.kind !== "client" || !engagement || engagement.clientId !== actor.accountId) {
    return notFound();
  }
  const completion = await unansweredOf(ctx, engagement);
  if (!completion) {
    return refuse(
      "not-awaiting",
      engagement.state === "completed"
        ? "This Engagement is Completed."
        : "There is no Completion to approve.",
    );
  }
  await ctx.commit(await approvalWrites(ctx, actor, engagement, completion, "approved"));
  // The seven days may have ended between the read and the batch, which then changed nothing.
  if ((await completionRow(ctx, completion.id))?.answer !== "approved") {
    return refuse("not-awaiting", "This Engagement is Completed.");
  }
  await emailTells(ctx).catch((error: unknown) => {
    console.error("Tell emails did not go", error);
  });
  return ok(null);
}

/**
 * The Client asks for a fix, with a note: the clock stops, the Engagement is
 * Fix requested, and the Artisan is told. The note is read first: a sure hit
 * is refused; an unsure one leaves the Fix request standing, its note shown
 * to the Artisan only once the Admin releases it.
 */
export async function requestFix(
  ctx: Context,
  actor: Actor,
  input: { engagementId: string; note: string },
) {
  const engagement = await engagementRow(ctx, input.engagementId);
  if (actor.kind !== "client" || !engagement || engagement.clientId !== actor.accountId) {
    return notFound();
  }
  const completion = await unansweredOf(ctx, engagement);
  if (!completion) {
    return refuse(
      "not-awaiting",
      engagement.state === "fix-requested"
        ? "You already asked for a fix."
        : engagement.state === "completed"
          ? "This Engagement is Completed."
          : "There is no Completion to answer.",
    );
  }
  const note = input.note.trim();
  if (!note) return refuse("invalid", "Write what needs fixing.");
  if (note.length > NOTE_MAX) {
    return refuse("invalid", `A note is at most ${NOTE_MAX} characters.`);
  }
  const checked = await checkContent(ctx, {
    text: note,
    context: { kind: "engagement-conversation", engagementId: engagement.id },
  });
  if (!checked.ok) return checked;
  const heldFor = checked.value.verdict === "held" ? checked.value.reason : null;

  const now = ctx.now();
  const fixedNow = exists(
    ctx.db
      .select({ one: sql`1` })
      .from(completions)
      .where(
        and(
          eq(completions.id, completion.id),
          eq(completions.answer, "fix-requested"),
          eq(completions.answeredAt, now),
        ),
      ),
  );
  const link = `/jobs/${engagement.jobId}`;
  await ctx.commit([
    ctx.db
      .update(completions)
      .set({
        answer: "fix-requested",
        answeredAt: now,
        fixNote: note,
        fixNoteState: heldFor ? "held" : "shown",
        fixNoteHeldFor: heldFor,
      })
      .where(
        and(unanswered(completion.id), engagementIn(ctx, engagement.id, ["awaiting-approval"])),
      ),
    ctx.db
      .update(engagements)
      .set({ state: "fix-requested" })
      .where(
        and(
          eq(engagements.id, engagement.id),
          eq(engagements.state, "awaiting-approval"),
          fixedNow,
        ),
      ),
    eventWrite(ctx, engagement, "fix.requested", fixedNow),
    ...tellWhile(
      ctx,
      actor,
      [engagement.artisanId],
      {
        event: "engagement.fix-requested",
        title: `The Client asked for a fix: ${engagement.jobTitle}`,
        link,
      },
      fixedNow,
    ),
    ...(heldFor
      ? [
          heldFixNote.raise(
            ctx,
            { subjectId: completion.id, title: `Fix request note: ${engagement.jobTitle}` },
            fixedNow,
          ).write,
        ]
      : []),
  ]);
  // Seven days may have ended between the read and the batch, which then changed nothing.
  const after = await completionRow(ctx, completion.id);
  if (after?.answer !== "fix-requested" || after.answeredAt?.getTime() !== now.getTime()) {
    return refuse("not-awaiting", "This Engagement is Completed.");
  }
  await emailTells(ctx).catch((error: unknown) => {
    console.error("Tell emails did not go", error);
  });
  return ok({ noteState: heldFor ? ("held" as const) : ("shown" as const) });
}

/**
 * A file of a Completion, or a photo's thumbnail: to its Artisan, to its
 * Client once it is made, and to the Admin for a Completion that was Held,
 * which they read to decide it. Null for anyone else.
 */
export async function completionFile(
  ctx: Context,
  viewer: Actor,
  input: { fileId: string; thumbnail?: boolean },
) {
  const [row] = await ctx.db
    .select({ completion: completions, engagement: engagements })
    .from(completions)
    .innerJoin(engagements, eq(engagements.id, completions.engagementId))
    .where(
      sql`exists (select 1 from json_each(${completions.photos}) where json_extract(value, '$.id') = ${input.fileId})
        or exists (select 1 from json_each(${completions.documents}) where json_extract(value, '$.id') = ${input.fileId})`,
    );
  if (!row) return null;
  const { completion, engagement } = row;
  const sees =
    viewer.kind === "admin"
      ? completion.heldFor !== null
      : viewer.kind === "artisan"
        ? viewer.accountId === engagement.artisanId
        : viewer.kind === "client" &&
          viewer.accountId === engagement.clientId &&
          completion.state === "made";
  if (!sees) return null;
  const file = [...completion.photos, ...completion.documents].find(
    (each) => each.id === input.fileId,
  )!;
  if (input.thumbnail && file.kind !== "photo") return null;
  const object = await ctx.ports.files.get(
    input.thumbnail && file.kind === "photo" ? file.thumbnailKey : file.key,
  );
  if (!object) return null;
  return {
    body: object.body,
    contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
    size: object.size,
  };
}

/** The Engagement's Completions, oldest first. */
export async function completionsOf(ctx: Context, engagementId: string) {
  return ctx.db
    .select()
    .from(completions)
    .where(eq(completions.engagementId, engagementId))
    .orderBy(asc(completions.sentAt), asc(sql.raw(`"completions"."rowid"`)));
}

/** Why the Admin refused the item of this kind about this subject, if they did. */
export async function refusalOf(ctx: Context, kind: string, subjectId: string) {
  const [newest] = await ctx.db
    .select({ decision: queueItems.decision, reason: queueItems.reason })
    .from(queueItems)
    .where(and(eq(queueItems.kind, kind), eq(queueItems.subjectId, subjectId)))
    .orderBy(desc(queueItems.raisedAt))
    .limit(1);
  return newest?.decision === "refuse" ? (newest.reason ?? "") : null;
}

/**
 * Makes a Completion's silence Approval seven days after it was made, once
 * the Client has not answered it. Not while a Chargeback freezes the
 * Engagement, too, once there are Chargebacks (#137).
 */
const approvalBySilence: ClockHandler = async (ctx, clock) => {
  const found = await answerable(ctx, clock.subjectId);
  if (!found || approvalAt(found.completion.madeAt!).getTime() !== clock.dueAt.getTime()) {
    return [];
  }
  return approvalWrites(ctx, system, found.engagement, found.completion, "approved-by-silence");
};

/** Reminds the Client, 24 hours before, that their silence will be Approval. */
const approvalReminder: ClockHandler = async (ctx, clock) => {
  const found = await answerable(ctx, clock.subjectId);
  if (!found) return [];
  const { engagement, completion } = found;
  return tellWhile(
    ctx,
    system,
    [engagement.clientId],
    {
      event: "engagement.approval-reminder",
      title: `Approved by silence in 24 hours, at ${formatTime(approvalAt(completion.madeAt!))}. Approve or ask for a fix before then: ${engagement.jobTitle}`,
      link: `/jobs/${engagement.jobId}`,
    },
    and(
      exists(
        ctx.db
          .select({ one: sql`1` })
          .from(completions)
          .where(unanswered(completion.id)),
      ),
      engagementIn(ctx, engagement.id, ["awaiting-approval"]),
    )!,
  );
};

export const completionClocks = {
  [APPROVAL_CLOCK]: approvalBySilence,
  [APPROVAL_REMINDER_CLOCK]: approvalReminder,
} satisfies Record<string, ClockHandler>;

/**
 * A Completion the Content check or the certificate's reading was unsure of
 * (ADR 0020): "being checked" to its Artisan, nothing to the Client, and the
 * Engagement stays where it was. Released while it may still be marked
 * complete, it is made then, and the seven days start; otherwise it is unsent.
 */
export const heldCompletion = defineHeldKind("held.completion", {
  async sender(ctx, subjectId) {
    return (await withEngagement(ctx, subjectId))?.engagement.artisanId ?? null;
  },
  async release(ctx, _admin, subjectId) {
    const found = await withEngagement(ctx, subjectId);
    if (!found) return [];
    const now = ctx.now();
    const held = and(eq(completions.id, subjectId), eq(completions.state, "held"));
    return [
      ctx.db
        .update(completions)
        .set({ state: "made", madeAt: now })
        .where(and(held, engagementIn(ctx, found.engagement.id, COMPLETABLE))),
      ctx.db.update(completions).set({ state: "unsent" }).where(held),
      ...madeWrites(ctx, system, found.engagement, subjectId, now),
    ];
  },
  async refuse(ctx, _admin, subjectId) {
    return [
      ctx.db
        .update(completions)
        .set({ state: "refused" })
        .where(and(eq(completions.id, subjectId), eq(completions.state, "held"))),
    ];
  },
  told: {
    async released(ctx, subjectId) {
      const found = await withEngagement(ctx, subjectId);
      return found && canMarkComplete(found.engagement).ok
        ? "Your Completion is checked, and the Client was told"
        : "Your Completion is checked, but the work can no longer be marked complete";
    },
    refused: "Your Completion was refused",
    async link(ctx, subjectId) {
      const found = await withEngagement(ctx, subjectId);
      return found ? `/jobs/${found.engagement.jobId}` : "/";
    },
  },
  async view(ctx, item) {
    const found = await withEngagement(ctx, item.subjectId);
    const job = found && (await jobRow(ctx, found.engagement.jobId));
    if (!found || !job) return { tabs: [], sidebar: [] };
    const { completion } = found;
    const files = [
      ...completion.photos.map((photo, index) => ({
        kind: "photo" as const,
        label: `Photo ${index + 1}`,
        href: completionFilePath(photo),
      })),
      ...completion.documents.map((document, index) => ({
        kind: document.kind,
        label: document.certificate
          ? capitalised(CERTIFICATES[certificateNeeded(found.engagement) ?? "compliance"].name)
          : `Document ${index + 1}`,
        href: completionFilePath(document),
      })),
    ];
    const checks: Block[] = (completion.heldFor ?? "The checks could not run.")
      .split("\n")
      .map((text) => ({ kind: "text", text }));
    if (completion.certificateFacts.length > 0) {
      checks.push({ kind: "facts", facts: completion.certificateFacts });
    }
    return {
      tabs: [
        {
          key: "completion",
          label: "The Completion",
          blocks: [
            { kind: "text", text: completion.note },
            { kind: "files", files },
          ],
        },
        { key: "job", label: "The Job", blocks: jobBlocks(job) },
        { key: "checks", label: "Checks", blocks: checks },
      ],
      sidebar: await accountSidebar(ctx, found.engagement.artisanId, "Artisan"),
    };
  },
});

/**
 * A Fix request's note the Content check was unsure of: the Fix request
 * stands, and the note is shown to the Artisan only once the Admin releases it.
 */
export const heldFixNote = defineHeldKind("held.fix-note", {
  async sender(ctx, subjectId) {
    return (await withEngagement(ctx, subjectId))?.engagement.clientId ?? null;
  },
  async release(ctx, _admin, subjectId) {
    const found = await withEngagement(ctx, subjectId);
    if (!found) return [];
    const { engagement } = found;
    return [
      ctx.db
        .update(completions)
        .set({ fixNoteState: "shown" })
        .where(and(eq(completions.id, subjectId), eq(completions.fixNoteState, "held"))),
      ...tellWhile(
        ctx,
        system,
        [engagement.artisanId],
        {
          event: "engagement.fix-note-shown",
          title: `The Client's note on their Fix request is checked: ${engagement.jobTitle}`,
          link: `/jobs/${engagement.jobId}`,
        },
        exists(
          ctx.db
            .select({ one: sql`1` })
            .from(completions)
            .where(and(eq(completions.id, subjectId), eq(completions.fixNoteState, "shown"))),
        ),
      ),
    ];
  },
  async refuse(ctx, _admin, subjectId) {
    return [
      ctx.db
        .update(completions)
        .set({ fixNoteState: "refused" })
        .where(and(eq(completions.id, subjectId), eq(completions.fixNoteState, "held"))),
    ];
  },
  told: {
    released: "Your note on the Fix request is checked and shown to the Artisan",
    refused: "Your note on the Fix request was refused",
    async link(ctx, subjectId) {
      const found = await withEngagement(ctx, subjectId);
      return found ? `/jobs/${found.engagement.jobId}` : "/";
    },
  },
  async view(ctx, item) {
    const found = await withEngagement(ctx, item.subjectId);
    const job = found && (await jobRow(ctx, found.engagement.jobId));
    if (!found || !job) return { tabs: [], sidebar: [] };
    const { completion } = found;
    return {
      tabs: [
        {
          key: "note",
          label: "The note",
          blocks: [{ kind: "text", text: completion.fixNote ?? "" }],
        },
        { key: "job", label: "The Job", blocks: jobBlocks(job) },
        {
          key: "check",
          label: "Content check",
          blocks: [
            { kind: "text", text: completion.fixNoteHeldFor ?? "The Content check could not run." },
          ],
        },
      ],
      sidebar: await accountSidebar(ctx, found.engagement.clientId, "Client"),
    };
  },
});

/**
 * The writes that follow a Completion being made by the same batch, each only
 * if it was: the Engagement Awaiting approval, the seven days and the
 * reminder before them, the row in the Conversation, and the Client told when
 * Approval by silence will be.
 */
function madeWrites(
  ctx: Context,
  actor: Actor,
  engagement: EngagementRow,
  completionId: string,
  /** When the batch makes it: the very time it writes, which the guard compares. */
  now: Date,
): Write[] {
  const dueAt = approvalAt(now);
  const madeNow = exists(
    ctx.db
      .select({ one: sql`1` })
      .from(completions)
      .where(
        and(
          eq(completions.id, completionId),
          eq(completions.state, "made"),
          eq(completions.madeAt, now),
        ),
      ),
  );
  return [
    ctx.db
      .update(engagements)
      .set({ state: "awaiting-approval" })
      .where(
        and(eq(engagements.id, engagement.id), inArray(engagements.state, COMPLETABLE), madeNow),
      ),
    // A clock whose Completion was not made, or was answered, does nothing when it fires.
    startClock(ctx, { kind: APPROVAL_CLOCK, subjectId: completionId, dueAt }),
    startClock(ctx, {
      kind: APPROVAL_REMINDER_CLOCK,
      subjectId: completionId,
      dueAt: new Date(dueAt.getTime() - DAY_MS),
    }),
    eventWrite(ctx, engagement, "completion.made", madeNow),
    ...tellWhile(
      ctx,
      actor,
      [engagement.clientId],
      {
        event: "engagement.completion",
        title: `The Artisan marked the work complete. Approve or ask for a fix by ${formatTime(dueAt)}, or it is Approved then: ${engagement.jobTitle}`,
        link: `/jobs/${engagement.jobId}`,
      },
      madeNow,
    ),
  ];
}

/**
 * The writes of Approval, by the Client or by silence, in one batch: the
 * Completion answered; the Engagement Completed; the Release of the Labour not
 * yet released, with the Artisan Fee, in the ledger; the row in the
 * Conversation; and the Tells. Everything after the first is written only if
 * the Engagement was Completed by this batch, so a Client's tap and the clock
 * never both release.
 */
async function approvalWrites(
  ctx: Context,
  actor: Actor,
  engagement: EngagementRow,
  completion: CompletionRow,
  answer: "approved" | "approved-by-silence",
): Promise<Write[]> {
  const now = ctx.now();
  const { labour } = await engagementMoney(ctx, engagement.id);
  // Extra Labour an Updated Quote pays in is released here too, once there is some (#134).
  const labourCents = labour.paidInCents - labour.releasedCents - labour.refundedCents;
  const completedNow = exists(
    ctx.db
      .select({ one: sql`1` })
      .from(engagements)
      .where(
        and(
          eq(engagements.id, engagement.id),
          eq(engagements.state, "completed"),
          eq(engagements.completedAt, now),
        ),
      ),
  );
  const answeredNow = exists(
    ctx.db
      .select({ one: sql`1` })
      .from(completions)
      .where(
        and(
          eq(completions.id, completion.id),
          eq(completions.answer, answer),
          eq(completions.answeredAt, now),
        ),
      ),
  );
  const link = `/jobs/${engagement.jobId}`;
  const bySilence = answer === "approved-by-silence";
  return [
    ctx.db
      .update(completions)
      .set({ answer, answeredAt: now })
      .where(
        and(unanswered(completion.id), engagementIn(ctx, engagement.id, ["awaiting-approval"])),
      ),
    ctx.db
      .update(engagements)
      .set({ state: "completed", completedAt: now })
      .where(
        and(
          eq(engagements.id, engagement.id),
          eq(engagements.state, "awaiting-approval"),
          answeredNow,
        ),
      ),
    ...ledgerWrites(
      ctx,
      releaseRows(engagement, LEDGER_KINDS.labourReleased, labourCents),
      completedNow,
    ),
    eventWrite(ctx, engagement, "approved", completedNow),
    ...tellWhile(
      ctx,
      actor,
      [engagement.artisanId],
      {
        event: "engagement.approved",
        title: bySilence
          ? `Approved, as the Client did not answer in seven days, and the Labour was released: ${engagement.jobTitle}`
          : `The Client approved the work, and the Labour was released: ${engagement.jobTitle}`,
        link,
      },
      completedNow,
    ),
    ...(bySilence
      ? tellWhile(
          ctx,
          actor,
          [engagement.clientId],
          {
            event: "engagement.approved",
            title: `Approved, as you did not answer in seven days, and the Labour was released to the Artisan: ${engagement.jobTitle}`,
            link,
          },
          completedNow,
        )
      : []),
  ];
}

/**
 * Reads the certificate for its kind and the Artisan's registration number
 * from Verification. A sure reading passes; anything less Holds the
 * Completion for the Admin, with the reasons and what was found. So does
 * what looks like a payment detail, which on a certificate may be its own
 * number, so it is the Admin's to judge rather than refused.
 */
async function readCertificate(
  ctx: Context,
  engagement: EngagementRow,
  kind: CertificateKind,
  file: StoredFile,
): Promise<{ reasons: string[]; facts: { label: string; value: string }[] }> {
  const read = await readFiles(ctx, [file]);
  const text = read.texts.join("\n\n");
  const numbers = await registrationNumbers(ctx, engagement.artisanId, kind);
  const { name } = CERTIFICATES[kind];
  const kindFound = found(name, text);
  const numberFound = numbers.some((number) => found(number, text) === "Yes")
    ? "Yes"
    : text.trim()
      ? "No"
      : "Nothing read";
  const reasons: string[] = [];
  if (read.unread) reasons.push(read.unread);
  if (kindFound !== "Yes") reasons.push(`The certificate does not read as a ${name}.`);
  else if (numberFound !== "Yes") {
    reasons.push("The certificate does not show the Artisan's registration number.");
  }
  const hit = patternHit(text, { kind: "engagement-conversation", engagementId: engagement.id });
  if (hit) reasons.push(`The certificate seems to hold ${HIT_NAMES[hit]}.`);
  return {
    reasons,
    facts: [
      ...(read.unread ? [{ label: "Could not read", value: read.unread }] : []),
      { label: `${capitalised(name)} in the text`, value: kindFound },
      {
        label: `Registration number in the text (${numbers.join(", ") || "none on record"})`,
        value: numberFound,
      },
    ],
  };
}

const HIT_NAMES: Record<PatternHit, string> = {
  "bank-account": "a bank account or card number",
  link: "a link",
  phone: "a phone number",
  email: "an email address",
};

/** The Credentials whose registration numbers a certificate of each kind may carry. */
const REGISTRATIONS: Record<CertificateKind, CheckKind[]> = {
  compliance: ["registered-person", "electrical-contractor"],
  conformity: ["gas-practitioner"],
};

/** The Artisan's registration numbers the Admin accepted for the certificate's trade. */
async function registrationNumbers(ctx: Context, artisanId: string, kind: CertificateKind) {
  const rows = await ctx.db
    .select({ details: verificationChecks.details })
    .from(verificationChecks)
    .where(
      and(
        eq(verificationChecks.artisanId, artisanId),
        inArray(verificationChecks.kind, REGISTRATIONS[kind]),
        eq(verificationChecks.state, "accepted"),
      ),
    );
  return rows
    .flatMap((row) => (row.details.registrationNumber ? [row.details.registrationNumber] : []))
    .sort();
}

/** Whether the Artisan may mark the work complete now, by the Engagement's state. */
function canMarkComplete(engagement: { state: EngagementState }): Result<null> {
  switch (engagement.state) {
    case "work-started":
    case "fix-requested":
      return ok(null);
    case "paid":
      return refuse("not-started", "Work has not started yet, so it cannot be marked complete.");
    case "awaiting-approval":
      return refuse("awaiting-approval", "The work is already marked complete.");
    default:
      return refuse("not-open", "This Engagement can no longer be marked complete.");
  }
}

/** The Engagement's Completion being checked, if there is one. */
async function heldCompletionOf(ctx: Context, engagementId: string) {
  const [row] = await ctx.db
    .select()
    .from(completions)
    .where(and(eq(completions.engagementId, engagementId), eq(completions.state, "held")));
  return row ?? null;
}

/** The made Completion the Client has not answered, while the Engagement is Awaiting approval. */
async function unansweredOf(ctx: Context, engagement: EngagementRow) {
  if (engagement.state !== "awaiting-approval") return null;
  const [row] = await ctx.db
    .select()
    .from(completions)
    .where(
      and(
        eq(completions.engagementId, engagement.id),
        eq(completions.state, "made"),
        isNull(completions.answer),
      ),
    );
  return row ?? null;
}

/** The Completion and its Engagement, while the Client may still answer it; null otherwise. */
async function answerable(ctx: Context, completionId: string) {
  const found = await withEngagement(ctx, completionId);
  if (
    !found ||
    found.completion.state !== "made" ||
    found.completion.answer !== null ||
    found.engagement.state !== "awaiting-approval"
  ) {
    return null;
  }
  return found;
}

async function completionRow(ctx: Context, completionId: string) {
  const [row] = await ctx.db.select().from(completions).where(eq(completions.id, completionId));
  return row ?? null;
}

/** The Completion with its Engagement; null if there is none. */
async function withEngagement(ctx: Context, completionId: string) {
  const completion = await completionRow(ctx, completionId);
  const engagement = completion && (await engagementRow(ctx, completion.engagementId));
  return completion && engagement ? { completion, engagement } : null;
}

/** The SQL that is true of a made Completion the Client has not answered. */
function unanswered(completionId: string) {
  return and(
    eq(completions.id, completionId),
    eq(completions.state, "made"),
    isNull(completions.answer),
  )!;
}

/** The SQL that is true while the Completion is in this state. */
function completionIn(ctx: Context, completionId: string, state: CompletionRow["state"]) {
  return exists(
    ctx.db
      .select({ one: sql`1` })
      .from(completions)
      .where(and(eq(completions.id, completionId), eq(completions.state, state))),
  );
}

/** The SQL that is true while the Engagement is in one of these states. */
function engagementIn(ctx: Context, engagementId: string, states: readonly EngagementState[]): SQL {
  return exists(
    ctx.db
      .select({ one: sql`1` })
      .from(engagements)
      .where(and(eq(engagements.id, engagementId), inArray(engagements.state, states))),
  );
}

/** Uploads files to one place, adding each to what is stored so far. */
async function take(ctx: Context, files: Blob[], where: UploadContext, stored: StoredFile[]) {
  const taken: StoredFile[] = [];
  for (const file of files) {
    const uploaded = await uploadFile(ctx, file, where);
    if (!uploaded.ok) return uploaded;
    stored.push(uploaded.value);
    taken.push(uploaded.value);
  }
  return ok(taken);
}

/** Deletes what was stored, then gives the refusal. */
async function discarded<R>(ctx: Context, stored: StoredFile[], refusal: R): Promise<R> {
  await discardFiles(ctx, stored);
  return refusal;
}

/** Deletes stored files nothing holds any more; one that will not go is left. */
async function discardFiles(ctx: Context, files: readonly StoredFile[]) {
  const keys = files.flatMap((file) =>
    file.kind === "photo" ? [file.key, file.thumbnailKey] : [file.key],
  );
  if (keys.length > 0) await ctx.ports.files.delete(keys).catch(() => {});
}

function documentOf(file: StoredFile, certificate: boolean): CompletionDocument {
  // Documents are taken as photos or PDFs only.
  return { ...(file as Extract<StoredFile, { kind: "photo" | "pdf" }>), certificate };
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function notFound() {
  return refuse("not-found", "That Engagement does not exist.");
}
