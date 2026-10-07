import { and, eq, exists, isNull, sql } from "drizzle-orm";
import { system, type Actor } from "../actor";
import { startClock, type ClockHandler } from "../clocks";
import type { Context, Write } from "../context";
import { eventWrite } from "../conversations/rows";
import {
  commitFromUnreleased,
  engagementMoney,
  LEDGER_KINDS,
  ledgerWrites,
  releaseRows,
} from "../ledger";
import { ok, refuse } from "../result";
import { formatDay, formatTime, saDay } from "../sa-days";
import { engagements, type WORK_STARTED_BY } from "../schema";
import { emailTells, tellWhile } from "../tells";
import { engagementRow, type EngagementRow } from "./rows";

// Work started (#127, ADR 0006): the moment the Artisan is working on site.
// The Client sets it, or the Artisan says they've started and it is Work
// started unless the Client answers "Not started" within 24 hours, so no
// Client can hold the Materials hostage. It releases the Materials, less the
// Artisan Fee, as a ledger row owed to the Artisan.

/** The clock that makes the Artisan's claim Work started if the Client does not answer. */
export const START_CLAIM_CLOCK = "engagement.start-claim";

/** How long the Client has to answer "Not started". */
const ANSWER_MS = 24 * 60 * 60 * 1000;

type StartedBy = (typeof WORK_STARTED_BY)[number];

/** Whether the Hired Quote's start date has come, in South Africa, so the Artisan may say they've started. */
export function startDayCome(ctx: Context, startOn: string): boolean {
  return startOn <= saDay(ctx.now());
}

/** When the Client must answer the Artisan's claim by. */
export function answerBy(claimedAt: Date): Date {
  return new Date(claimedAt.getTime() + ANSWER_MS);
}

/** The Client marks Work started on their Paid Engagement, releasing the Materials. */
export async function markWorkStarted(ctx: Context, actor: Actor, input: { engagementId: string }) {
  const engagement = await engagementRow(ctx, input.engagementId);
  if (actor.kind !== "client" || !engagement || engagement.clientId !== actor.accountId) {
    return refuse("not-found", "That Engagement does not exist.");
  }
  if (engagement.state !== "paid") return notPaid(engagement);
  // Not while a Chargeback freezes the Engagement, too, once there are Chargebacks (#137).
  await commitFromUnreleased(ctx, () => startWrites(ctx, actor, engagement, "client"));
  await emailTells(ctx).catch((error: unknown) => {
    console.error("Tell emails did not go", error);
  });
  return ok(null);
}

/**
 * The Artisan says they've started on their Paid Engagement. The Client is
 * told, with 24 hours to answer "Not started" before it is Work started.
 */
export async function claimStarted(ctx: Context, actor: Actor, input: { engagementId: string }) {
  const engagement = await engagementRow(ctx, input.engagementId);
  if (actor.kind !== "artisan" || !engagement || engagement.artisanId !== actor.accountId) {
    return refuse("not-found", "That Engagement does not exist.");
  }
  if (engagement.state !== "paid") return notPaid(engagement);
  // The 24 hours of silence stand only once work could be on site; the Client may still mark it sooner.
  if (!startDayCome(ctx, engagement.startOn)) {
    return refuse(
      "before-start",
      `You can say you've started from the Quote's start date, ${formatDay(engagement.startOn)}.`,
    );
  }
  if (engagement.startClaimedAt) {
    return refuse(
      "already-claimed",
      "You already said you've started. The Client has until then to answer.",
    );
  }
  const now = ctx.now();
  const dueAt = answerBy(now);
  await ctx.commit([
    ctx.db
      .update(engagements)
      .set({ startClaimedAt: now })
      .where(
        and(
          eq(engagements.id, engagement.id),
          eq(engagements.state, "paid"),
          isNull(engagements.startClaimedAt),
        ),
      ),
    // A clock whose claim did not land, or was answered, does nothing when it fires.
    startClock(ctx, { kind: START_CLAIM_CLOCK, subjectId: engagement.id, dueAt }),
    ...tellWhile(
      ctx,
      actor,
      [engagement.clientId],
      {
        event: "engagement.start-claimed",
        title: `The Artisan says work has started. Answer Not started by ${formatTime(dueAt)}, or it is Work started: ${engagement.jobTitle}`,
        link: `/jobs/${engagement.jobId}`,
      },
      claimIs(ctx, engagement.id, now),
    ),
  ]);
  await emailTells(ctx).catch((error: unknown) => {
    console.error("Tell emails did not go", error);
  });
  return ok(null);
}

/**
 * The Client answers the Artisan's claim "Not started": the Engagement stays
 * Paid, the Artisan is told, and may say they've started again later.
 */
export async function answerNotStarted(
  ctx: Context,
  actor: Actor,
  input: { engagementId: string },
) {
  const engagement = await engagementRow(ctx, input.engagementId);
  if (actor.kind !== "client" || !engagement || engagement.clientId !== actor.accountId) {
    return refuse("not-found", "That Engagement does not exist.");
  }
  if (engagement.state !== "paid") return notPaid(engagement);
  if (!engagement.startClaimedAt) {
    return refuse(
      "no-claim",
      "The Artisan has not said they've started, so there is nothing to answer.",
    );
  }
  await ctx.commit([
    ctx.db
      .update(engagements)
      .set({ startClaimedAt: null })
      .where(
        and(
          eq(engagements.id, engagement.id),
          eq(engagements.state, "paid"),
          eq(engagements.startClaimedAt, engagement.startClaimedAt),
        ),
      ),
    ...tellWhile(
      ctx,
      actor,
      [engagement.artisanId],
      {
        event: "engagement.not-started",
        title: `The Client says work has not started: ${engagement.jobTitle}`,
        link: `/jobs/${engagement.jobId}`,
      },
      claimIs(ctx, engagement.id, null),
    ),
  ]);
  // The 24 hours may have ended between the read and the batch, which then changed nothing.
  const after = await engagementRow(ctx, engagement.id);
  if (after?.state !== "paid") return notPaid(after!);
  await emailTells(ctx).catch((error: unknown) => {
    console.error("Tell emails did not go", error);
  });
  return ok(null);
}

/**
 * Makes the Artisan's claim Work started once the Client has not answered in
 * 24 hours. Not while a Chargeback freezes the Engagement, too, once there
 * are Chargebacks (#137): the clock pauses and nothing is released.
 */
const startClaim: ClockHandler = async (ctx, clock) => {
  const engagement = await engagementRow(ctx, clock.subjectId);
  if (
    engagement?.state !== "paid" ||
    !engagement.startClaimedAt ||
    answerBy(engagement.startClaimedAt).getTime() !== clock.dueAt.getTime()
  ) {
    return [];
  }
  return startWrites(ctx, system, engagement, "artisan");
};

export const workStartedClocks = { [START_CLAIM_CLOCK]: startClaim } satisfies Record<
  string,
  ClockHandler
>;

/**
 * The writes of Work started, in one batch: the Engagement Work started; the
 * Release of the Materials not yet released, with the Artisan Fee, in the
 * ledger (nothing if there are none); the row in the Conversation; and the
 * Tells. Everything after the first is written only if the first landed, so
 * a Client's tap and the clock never both release.
 */
async function startWrites(
  ctx: Context,
  actor: Actor,
  engagement: EngagementRow,
  by: StartedBy,
): Promise<Write[]> {
  const now = ctx.now();
  const { materials } = await engagementMoney(ctx, engagement.id);
  // Extra Materials an Updated Quote pays in are released here too, once there are some (#134).
  const materialsCents = materials.unreleasedCents;
  const startedNow = exists(
    ctx.db
      .select({ one: sql`1` })
      .from(engagements)
      .where(
        and(
          eq(engagements.id, engagement.id),
          eq(engagements.state, "work-started"),
          eq(engagements.workStartedAt, now),
          eq(engagements.workStartedBy, by),
        ),
      ),
  );
  const link = `/jobs/${engagement.jobId}`;
  return [
    ctx.db
      .update(engagements)
      .set({ state: "work-started", workStartedAt: now, workStartedBy: by, startClaimedAt: null })
      .where(
        and(
          eq(engagements.id, engagement.id),
          eq(engagements.state, "paid"),
          // The clock's claim must still be the one it was started for.
          by === "artisan" ? eq(engagements.startClaimedAt, engagement.startClaimedAt!) : undefined,
        ),
      ),
    ...ledgerWrites(
      ctx,
      releaseRows(engagement, LEDGER_KINDS.materialsReleased, materialsCents),
      startedNow,
    ),
    eventWrite(ctx, engagement, "work.started", startedNow),
    ...tellWhile(
      ctx,
      actor,
      [engagement.artisanId],
      {
        event: "engagement.work-started",
        title:
          materialsCents > 0
            ? `Work started, and the Materials were released: ${engagement.jobTitle}`
            : `Work started: ${engagement.jobTitle}`,
        link,
      },
      startedNow,
    ),
    ...(by === "artisan"
      ? tellWhile(
          ctx,
          actor,
          [engagement.clientId],
          {
            event: "engagement.work-started",
            title: `Work started, as you did not answer Not started in 24 hours: ${engagement.jobTitle}`,
            link,
          },
          startedNow,
        )
      : []),
  ];
}

/** The SQL that is true while the Engagement is Paid with this claim, or none. */
function claimIs(ctx: Context, engagementId: string, claimedAt: Date | null) {
  return exists(
    ctx.db
      .select({ one: sql`1` })
      .from(engagements)
      .where(
        and(
          eq(engagements.id, engagementId),
          eq(engagements.state, "paid"),
          claimedAt
            ? eq(engagements.startClaimedAt, claimedAt)
            : isNull(engagements.startClaimedAt),
        ),
      ),
  );
}

function notPaid(engagement: EngagementRow) {
  return refuse(
    "not-paid",
    engagement.workStartedAt
      ? "Work has already started on this Job."
      : "This Engagement is no longer Paid.",
  );
}
