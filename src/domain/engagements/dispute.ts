import { and, asc, eq, exists, isNull, sql, type SQL } from "drizzle-orm";
import { system, type Actor, type AdminActor } from "../actor";
import { firstProblem } from "../accounts/inputs";
import { checkContent } from "../content/check";
import type { Context, Write } from "../context";
import { eventWrite } from "../conversations/rows";
import { causedBy } from "../errors";
import { fileLink } from "../file-links";
import { insertWhile } from "../guarded";
import { jobBlocks } from "../jobs/held";
import { jobRow } from "../jobs/rows";
import {
  commitFromUnreleased,
  engagementMoney,
  isOverdrawn,
  LEDGER_KINDS,
  labourUnreleasedIs,
  ledgerWrites,
  releaseRows,
} from "../ledger";
import { formatRands } from "../money";
import { defineQueueItemKind, type Block, type DecisionField } from "../queues";
import { accountSidebar } from "../quotes/held";
import { refundWrites, sendEngagementRefunds } from "../refunds";
import { ok, refuse } from "../result";
import { formatTime } from "../sa-days";
import {
  accounts,
  completions,
  conversations,
  disputes,
  engagements,
  messages,
  queueItems,
  type DISPUTED_BY,
} from "../schema";
import { emailTells, tell, tellWhile } from "../tells";
import {
  checkFileCount,
  discardFiles,
  uploadFile,
  UPLOAD_CONTEXTS,
  type StoredFile,
} from "../uploads";
import { labourRefundAt } from "./cancellation";
import { completionFilePath, completionsOf, unansweredOf } from "./completion";
import { DISPUTE_REASON_MAX, labourAmount } from "./inputs";
import { engagementRow, type EngagementRow } from "./rows";
import { endProposedWrite } from "./updated-quote";

// Disputes (#135): a request that the Admin decide how much of a held amount
// of Labour is released and how much refunded. The Client opens one at
// Awaiting approval for a named amount, and the rest of the Labour is
// released at Approval or when the seven days end; the Artisan opens one for
// all the Labour unreleased, against a Fix request, or within a
// Cancellation's 72 hours, which stops that refund. Only the amount held is
// held, in the ledger. Until the Admin decides, the Client may still release
// and the Artisan may still refund; when nothing is held the Dispute is
// settled. The Admin splits what is held between Release and Refund, with a
// reason to both, and the decision is final. Afterwards the Engagement is
// Cancelled again if the Dispute was against a Cancellation, otherwise
// Completed.

export type DisputeRow = typeof disputes.$inferSelect;
type DisputedBy = (typeof DISPUTED_BY)[number];
type Photo = Extract<StoredFile, { kind: "photo" }>;

/** The path that serves a Dispute's photo, or its thumbnail. */
export function disputeFilePath(disputeId: string, file: { id: string }, thumbnail = false) {
  return `/dispute-files/${disputeId}/${file.id}${thumbnail ? "?size=thumbnail" : ""}`;
}

/**
 * Either party opens a Dispute on their Engagement, with a reason and
 * optional photos: the Client for a named amount of the Labour at Awaiting
 * approval, the Artisan for all the Labour unreleased against a Fix request
 * or within a Cancellation's 72 hours. The reason is read first: a sure hit
 * is refused; an unsure one leaves the Dispute standing, its reason and
 * photos for the Admin only. The Engagement is Disputed, the Admin's queue
 * has it, and the other party is told.
 */
export async function openDispute(
  ctx: Context,
  actor: Actor,
  input: { engagementId: string; amount?: string; reason: string; photos?: Blob[] },
) {
  const engagement = await engagementRow(ctx, input.engagementId);
  const by = engagement && partyOf(actor, engagement);
  if (!engagement || !by) return notFound();
  // Not while a Chargeback freezes the Engagement, too, once there are Chargebacks (#137).
  const grounds = await groundsOf(ctx, engagement, by);
  if (!grounds.ok) return grounds;
  const { labour } = await engagementMoney(ctx, engagement.id);
  if (labour.unreleasedCents === 0) {
    return refuse(
      "nothing-unreleased",
      "None of the Labour is unreleased, so none can be disputed.",
    );
  }
  let heldCents = labour.unreleasedCents;
  if (by === "client") {
    const parsed = labourAmount.safeParse(input.amount ?? "");
    if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
    if (parsed.data > labour.unreleasedCents) {
      return refuse(
        "more-than-unreleased",
        `You can dispute at most ${formatRands(labour.unreleasedCents)}, the Labour not yet released.`,
      );
    }
    heldCents = parsed.data;
  }
  const reason = input.reason.trim();
  if (!reason) return refuse("invalid", "Write why you dispute it.");
  if (reason.length > DISPUTE_REASON_MAX) {
    return refuse("invalid", `A reason is at most ${DISPUTE_REASON_MAX} characters.`);
  }
  const blobs = input.photos ?? [];
  const counted = checkFileCount("disputePhotos", blobs.length);
  if (!counted.ok) return counted;

  const stored: StoredFile[] = [];
  try {
    for (const blob of blobs) {
      const uploaded = await uploadFile(ctx, blob, UPLOAD_CONTEXTS.disputePhotos);
      if (!uploaded.ok) return await discarded(ctx, stored, uploaded);
      stored.push(uploaded.value);
    }
    const checked = await checkContent(ctx, {
      text: reason,
      files: stored,
      context: { kind: "engagement-conversation", engagementId: engagement.id },
    });
    if (!checked.ok) return await discarded(ctx, stored, checked);
    const heldFor = checked.value.verdict === "held" ? checked.value.reason : null;

    const now = ctx.now();
    const dispute: DisputeRow = {
      id: ctx.newId(),
      engagementId: engagement.id,
      openedBy: by,
      against: grounds.value.against,
      completionId: grounds.value.completionId,
      heldCents,
      reason,
      photos: stored.filter((file): file is Photo => file.kind === "photo"),
      reasonState: heldFor ? "held" : "shown",
      reasonHeldFor: heldFor,
      state: "open",
      openedAt: now,
      closedAt: null,
      releasedCents: null,
      refundedCents: null,
    };
    const openedNow = disputeIn(ctx, dispute.id, "open");
    const [inserted] = await ctx.db.batch([
      insertWhile(
        ctx,
        disputes,
        dispute,
        and(
          grounds.value.stillDisputable,
          labourUnreleasedIs(ctx, engagement.id, labour.unreleasedCents),
        )!,
      ).returning({ id: disputes.id }),
      ctx.db
        .update(engagements)
        .set({ state: "disputed" })
        .where(
          and(
            eq(engagements.id, engagement.id),
            eq(engagements.state, engagement.state),
            openedNow,
          ),
        ),
      ...ledgerWrites(
        ctx,
        [
          {
            kind: LEDGER_KINDS.disputeHeld,
            amountCents: heldCents,
            paymentId: engagement.paymentId,
            engagementId: engagement.id,
          },
        ],
        openedNow,
      ),
      disputeItem.raise(
        ctx,
        { subjectId: dispute.id, title: `Dispute: ${engagement.jobTitle}` },
        openedNow,
      ).write,
      eventWrite(ctx, engagement, "dispute.opened", openedNow, formatRands(heldCents)),
      // An Updated Quote proposed before a Fix request ends: the price stands (#134).
      endProposedWrite(ctx, engagement.id, openedNow),
      ...tellWhile(
        ctx,
        actor,
        [by === "client" ? engagement.artisanId : engagement.clientId],
        {
          event: "engagement.disputed",
          title: `${openedTitle(grounds.value.against, heldCents)}: ${engagement.jobTitle}`,
          link: `/jobs/${engagement.jobId}`,
        },
        openedNow,
      ),
    ]);
    if (inserted.length === 0) {
      // It moved on between the read and the batch, or its Labour was released or refunded.
      await discardFiles(ctx, stored);
      const after = await engagementRow(ctx, engagement.id);
      const standing = after && (await groundsOf(ctx, after, by));
      return standing && !standing.ok
        ? standing
        : refuse("changed", "The Labour not yet released changed meanwhile. Look again.");
    }
    await emailTells(ctx).catch((error: unknown) => {
      console.error("Tell emails did not go", error);
    });
    return ok({ disputeId: dispute.id });
  } catch (error) {
    await discardFiles(ctx, stored);
    if (causedBy(error, "UNIQUE constraint failed: disputes.engagement_id")) {
      return alreadyDisputed();
    }
    throw error;
  }
}

/** What the other party is told of a Dispute opened against this. */
function openedTitle(against: DisputeRow["against"], heldCents: number): string {
  const held = formatRands(heldCents);
  switch (against) {
    case "completion":
      return `The Client disputed ${held} of the Labour. The Admin decides it`;
    case "fix-request":
      return `The Artisan disputed your Fix request, so the Labour not yet released, ${held}, is held. The Admin decides it`;
    case "cancellation":
      return `The Artisan disputed the Cancellation for work already done, so the Labour not yet released, ${held}, is held, not refunded. The Admin decides it`;
  }
}

/**
 * What the party's Dispute would be against now, and the SQL that is true
 * while it still may be; or why it may not be opened.
 */
async function groundsOf(ctx: Context, engagement: EngagementRow, by: DisputedBy) {
  const still = (...conditions: SQL[]) =>
    exists(
      ctx.db
        .select({ one: sql`1` })
        .from(engagements)
        .where(and(eq(engagements.id, engagement.id), ...conditions)),
    );
  if (engagement.state === "disputed") return alreadyDisputed();
  if (by === "client") {
    const completion = await unansweredOf(ctx, engagement);
    if (engagement.state !== "awaiting-approval" || !completion) {
      return refuse(
        "not-disputable",
        engagement.state === "completed"
          ? "This Engagement is Completed."
          : "You can dispute the Labour only while a Completion awaits your approval.",
      );
    }
    return ok({
      against: "completion" as const,
      completionId: completion.id,
      stillDisputable: and(
        still(eq(engagements.state, "awaiting-approval")),
        exists(
          ctx.db
            .select({ one: sql`1` })
            .from(completions)
            .where(
              and(
                eq(completions.id, completion.id),
                eq(completions.state, "made"),
                isNull(completions.answer),
              ),
            ),
        ),
      )!,
    });
  }
  if (engagement.state === "fix-requested") {
    const asked = (await completionsOf(ctx, engagement.id))
      .filter((completion) => completion.answer === "fix-requested")
      .at(-1);
    return ok({
      against: "fix-request" as const,
      completionId: asked?.id ?? null,
      stillDisputable: still(eq(engagements.state, "fix-requested")),
    });
  }
  if (engagement.state === "cancelled" && engagement.workStartedAt && engagement.cancelledAt) {
    const refundAt = labourRefundAt(engagement.cancelledAt);
    if (ctx.now().getTime() >= refundAt.getTime()) {
      return refuse(
        "not-disputable",
        "The 72 hours after the Cancellation have ended, so it can no longer be disputed.",
      );
    }
    return ok({
      against: "cancellation" as const,
      completionId: null,
      stillDisputable: still(
        eq(engagements.state, "cancelled"),
        eq(engagements.cancelledAt, engagement.cancelledAt),
      ),
    });
  }
  return refuse(
    "not-disputable",
    engagement.state === "cancelled"
      ? "It was cancelled before Work started, so there is no work to dispute."
      : "You can open a Dispute against a Fix request, or within 72 hours of a Cancellation after Work started.",
  );
}

/**
 * The Client releases an amount of the Labour a Dispute holds to the
 * Artisan, less the Artisan Fee, to settle it. The Artisan is told; once
 * nothing is held the Dispute is settled.
 */
export async function releaseHeld(
  ctx: Context,
  actor: Actor,
  input: { engagementId: string; amount: string },
) {
  const engagement = await engagementRow(ctx, input.engagementId);
  if (actor.kind !== "client" || !engagement || engagement.clientId !== actor.accountId) {
    return notFound();
  }
  const parsed = labourAmount.safeParse(input.amount);
  if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
  const amountCents = parsed.data;
  // Not while a Chargeback freezes the Engagement's money, too, once there are Chargebacks (#137).
  let refused: ReturnType<typeof refuse> | null = null;
  await commitFromUnreleased(ctx, async () => {
    refused = null;
    const dispute = await openDisputeOf(ctx, engagement.id);
    const { heldCents } = await engagementMoney(ctx, engagement.id);
    if (!dispute || heldCents === 0) {
      refused = refuse("nothing-held", "Nothing is held in a Dispute on this Job.");
      return [];
    }
    if (amountCents > heldCents) {
      refused = refuse(
        "more-than-held",
        `You can release at most ${formatRands(heldCents)}, what the Dispute holds.`,
      );
      return [];
    }
    return [
      // What it takes of the Dispute first: the ledger checks each row as it is written.
      ...ledgerWrites(ctx, [
        {
          kind: LEDGER_KINDS.disputeReleased,
          amountCents,
          paymentId: engagement.paymentId,
          engagementId: engagement.id,
        },
        ...releaseRows(engagement, LEDGER_KINDS.labourReleased, amountCents),
      ]),
      eventWrite(ctx, engagement, "dispute.released", sql`1`, formatRands(amountCents)),
      ...tell(ctx, actor, [engagement.artisanId], {
        event: "engagement.dispute-released",
        title: `The Client released ${formatRands(amountCents)} of the Labour in Dispute: ${engagement.jobTitle}`,
        link: `/jobs/${engagement.jobId}`,
      }),
    ];
  });
  if (refused) return refused;
  await settleIfNothingHeld(ctx, engagement.id);
  await emailTells(ctx).catch((error: unknown) => {
    console.error("Tell emails did not go", error);
  });
  return ok(null);
}

/**
 * The ledger row that takes what an Artisan's Refund of Labour refunds out of
 * what a Dispute holds, first: refunding during a Dispute settles it. None if
 * nothing is held.
 */
export function heldRefundRows(
  engagement: { id: string; paymentId: string },
  labourCents: number,
  heldCents: number,
) {
  return [
    {
      kind: LEDGER_KINDS.disputeRefunded,
      amountCents: Math.min(labourCents, heldCents),
      paymentId: engagement.paymentId,
      engagementId: engagement.id,
    },
  ];
}

/**
 * Settles the Engagement's open Dispute once nothing is held: the Client
 * released it, or the Artisan refunded it. The Engagement is Completed if
 * there was a Completion, the rest of the Labour released, or Cancelled; the
 * Admin's item closes, and both parties are told.
 */
export async function settleIfNothingHeld(ctx: Context, engagementId: string) {
  await commitFromUnreleased(ctx, async () => {
    const dispute = await openDisputeOf(ctx, engagementId);
    const engagement = await engagementRow(ctx, engagementId);
    if (!dispute || !engagement) return [];
    const { labour, heldCents } = await engagementMoney(ctx, engagementId);
    if (heldCents > 0) return [];
    const now = ctx.now();
    const settledNow = disputeIn(ctx, dispute.id, "settled", now);
    const ends = endsAs(dispute);
    const told =
      ends === "completed" ? "and the work is Completed" : "and the Engagement stays Cancelled";
    return [
      ctx.db
        .update(disputes)
        .set({ state: "settled", closedAt: now })
        .where(
          and(
            eq(disputes.id, dispute.id),
            eq(disputes.state, "open"),
            labourUnreleasedIs(ctx, engagementId, labour.unreleasedCents),
          ),
        ),
      ...endWrites(ctx, engagement, ends, labour.unreleasedCents, settledNow),
      // Unguarded on decided_at's trigger: an Admin's decision first leaves the Dispute decided.
      ctx.db
        .update(queueItems)
        .set({ decision: SETTLED, decidedAt: now })
        .where(
          and(
            eq(queueItems.kind, disputeItem.kind),
            eq(queueItems.subjectId, dispute.id),
            isNull(queueItems.decidedAt),
            settledNow,
          ),
        ),
      eventWrite(ctx, engagement, "dispute.settled", settledNow),
      ...tellWhile(
        ctx,
        system,
        [engagement.clientId, engagement.artisanId],
        {
          event: "engagement.dispute-settled",
          title: `The Dispute is settled, as nothing is held any more, ${told}: ${engagement.jobTitle}`,
          link: `/jobs/${engagement.jobId}`,
        },
        settledNow,
      ),
    ];
  });
}

/**
 * Settles every open Dispute that holds nothing, whose settling did not go
 * when its last Release or Refund did. Called every minute.
 */
export async function settleDisputesHoldingNothing(ctx: Context) {
  const open = await ctx.db
    .select({ engagementId: disputes.engagementId })
    .from(disputes)
    .where(eq(disputes.state, "open"));
  for (const { engagementId } of open) await settleIfNothingHeld(ctx, engagementId);
}

/**
 * How the Engagement ends once its Dispute does: Cancelled again after a
 * Cancellation, even one that followed a Completion, as the parties had ended
 * it, and a Completed Engagement would open Reviews and lower the Artisan Fee
 * on the Client Relationship's later work (ADR 0009); otherwise Completed, as
 * a Client's Dispute and one against a Fix request follow a Completion.
 */
function endsAs(dispute: DisputeRow) {
  return dispute.against === "cancellation" ? ("cancelled" as const) : ("completed" as const);
}

/**
 * The writes that end a Disputed Engagement once its Dispute closes: Completed,
 * with the rest of the Labour not yet released released, or back to Cancelled,
 * its Cancellation as it was. Each only while the Dispute closed by this batch.
 */
function endWrites(
  ctx: Context,
  engagement: EngagementRow,
  ends: "completed" | "cancelled",
  restCents: number,
  closedNow: SQL,
): Write[] {
  const now = ctx.now();
  if (ends === "cancelled") {
    return [
      ctx.db
        .update(engagements)
        .set({ state: "cancelled" })
        .where(
          and(eq(engagements.id, engagement.id), eq(engagements.state, "disputed"), closedNow),
        ),
    ];
  }
  return [
    ctx.db
      .update(engagements)
      .set({ state: "completed", completedAt: now })
      .where(and(eq(engagements.id, engagement.id), eq(engagements.state, "disputed"), closedNow)),
    ...ledgerWrites(
      ctx,
      releaseRows(engagement, LEDGER_KINDS.labourReleased, restCents),
      closedNow,
    ),
  ];
}

/** The decision recorded on a Dispute's item when the parties settle it; never offered to the Admin. */
const SETTLED = "settled";

/**
 * A Dispute in the Admin's Disputes queue: the Job, the Completion, and the
 * Conversation on a logged click as evidence, the parties, the money, and
 * the Artisan record. The Admin splits what is held between Release and
 * Refund, with a reason both parties read; the decision is final.
 */
export const disputeItem = defineQueueItemKind("dispute", {
  queue: "disputes",
  decisions: {
    split: {
      label: "Split the held amount",
      told: "Both parties, with the reason",
      reason: "required",
      reasonLabel: "Reason, for both parties",
    },
    // Recorded when the parties settle it, never offered to the Admin.
    [SETTLED]: { label: "Settled by the parties", told: "Both parties", reason: "none" },
  },
  // Not while a Chargeback freezes the Engagement, too, once there are Chargebacks (#137).
  async allowed(ctx, item) {
    const dispute = await disputeRow(ctx, item.subjectId);
    if (dispute?.state !== "open") return [];
    const { heldCents } = await engagementMoney(ctx, dispute.engagementId);
    return heldCents > 0 ? ["split"] : [];
  },
  async fields(ctx, item): Promise<Record<string, DecisionField[]>> {
    const dispute = await disputeRow(ctx, item.subjectId);
    if (!dispute) return {};
    const { heldCents } = await engagementMoney(ctx, dispute.engagementId);
    return {
      split: [
        {
          key: "releasedCents",
          label: "Released to the Artisan",
          value: String(heldCents),
          type: "split",
          required: true,
          totalCents: heldCents,
        },
      ],
    };
  },
  async decide(ctx, admin, item, choice) {
    const dispute = await disputeRow(ctx, item.subjectId);
    const engagement = dispute && (await engagementRow(ctx, dispute.engagementId));
    if (!dispute || !engagement || dispute.state !== "open") {
      return refuse("not-open", "This Dispute is no longer open.");
    }
    const { labour, heldCents } = await engagementMoney(ctx, engagement.id);
    const given = choice.fields.releasedCents ?? "";
    const releasedCents = Number(given);
    if (!/^\d+$/.test(given) || releasedCents > heldCents) {
      return refuse(
        "invalid",
        `Release between ${formatRands(0)} and ${formatRands(heldCents)}, what is held.`,
      );
    }
    return ok(
      await decisionWrites(ctx, admin, engagement, dispute, {
        heldCents,
        releasedCents,
        labourCents: labour.unreleasedCents,
        reason: choice.reason ?? "",
      }),
    );
  },
  refusalOf(error) {
    return isOverdrawn(error)
      ? refuse("changed", "What the Dispute holds changed meanwhile. Look again.")
      : null;
  },
  async after(ctx, item) {
    const dispute = await disputeRow(ctx, item.subjectId);
    if (dispute) await sendEngagementRefunds(ctx, dispute.engagementId);
  },
  async view(ctx, item) {
    const dispute = await disputeRow(ctx, item.subjectId);
    const engagement = dispute && (await engagementRow(ctx, dispute.engagementId));
    const job = engagement && (await jobRow(ctx, engagement.jobId));
    if (!dispute || !engagement || !job) return { tabs: [], sidebar: [] };
    const [money, completions] = await Promise.all([
      engagementMoney(ctx, engagement.id),
      completionsOf(ctx, engagement.id),
    ]);
    const completion =
      completions.find((each) => each.id === dispute.completionId) ??
      completions.filter((each) => each.state === "made").at(-1);
    const completionBlocks: Block[] = completion
      ? [
          { kind: "text", text: `Made ${formatTime(completion.madeAt ?? completion.sentAt)}.` },
          { kind: "text", text: completion.note },
          {
            kind: "files",
            files: [
              ...completion.photos.map((photo, index) => ({
                kind: "photo" as const,
                label: `Photo ${index + 1}`,
                href: completionFilePath(completion.id, photo),
              })),
              ...completion.documents.map((document, index) => ({
                kind: document.kind,
                label: document.certificate ? "Certificate" : `Document ${index + 1}`,
                href: completionFilePath(completion.id, document),
              })),
            ],
          },
          ...(completion.answer === "fix-requested" && completion.fixNote
            ? [{ kind: "text" as const, text: `Fix request: ${completion.fixNote}` }]
            : []),
        ]
      : [{ kind: "text", text: "No Completion was made." }];
    return {
      tabs: [
        { key: "dispute", label: "The Dispute", blocks: disputeBlocks(dispute) },
        { key: "completion", label: "The Completion", blocks: completionBlocks },
        { key: "conversation", label: "The Conversation", read: "conversation" },
        { key: "job", label: "The Job", blocks: jobBlocks(job) },
      ],
      sidebar: [
        {
          title: "Money",
          blocks: [
            {
              kind: "facts",
              facts: [
                { label: "Held in Dispute", value: formatRands(money.heldCents) },
                {
                  label: "Labour not yet released",
                  value: formatRands(money.labour.unreleasedCents),
                },
                { label: "Paid in", value: formatRands(money.paidInCents) },
                { label: "Released", value: formatRands(money.releasedCents) },
                { label: "Refunded", value: formatRands(money.refundedCents) },
                { label: "Artisan Fee", value: `${engagement.artisanFeePercent}%` },
              ],
            },
          ],
        },
        ...(await accountSidebar(ctx, engagement.clientId, "Client")),
        ...(await accountSidebar(ctx, engagement.artisanId, "Artisan")),
      ],
      timeline: [
        { at: engagement.hiredAt, text: "Hired" },
        ...(engagement.workStartedAt
          ? [{ at: engagement.workStartedAt, text: "Work started" }]
          : []),
        ...completions.flatMap((each) =>
          each.state === "made" && each.madeAt
            ? [
                { at: each.madeAt, text: "Marked complete" },
                ...(each.answer === "fix-requested" && each.answeredAt
                  ? [{ at: each.answeredAt, text: "Fix requested" }]
                  : []),
              ]
            : [],
        ),
        ...(engagement.cancelledAt
          ? [
              {
                at: engagement.cancelledAt,
                text: `Cancelled by the ${engagement.cancelledBy === "client" ? "Client" : "Artisan"}`,
              },
            ]
          : []),
        {
          at: dispute.openedAt,
          text: `Disputed by the ${dispute.openedBy === "client" ? "Client" : "Artisan"}`,
        },
      ],
    };
  },
  reads: {
    conversation: {
      label: "the Conversation",
      async open(ctx, item) {
        const dispute = await disputeRow(ctx, item.subjectId);
        const engagement = dispute && (await engagementRow(ctx, dispute.engagementId));
        return engagement ? conversationBlocks(ctx, engagement) : [];
      },
    },
  },
});

/**
 * The writes of the Admin's decision of a Dispute, in one batch with it: the
 * held amount split, the part released to the Artisan less the Artisan Fee,
 * the rest refunded to the Client; the Engagement Completed, with any Labour
 * not held released, or Cancelled; its row in the Conversation; and both
 * parties told. The ledger aborts the batch if a party's Release or Refund
 * took what is held meanwhile.
 */
async function decisionWrites(
  ctx: Context,
  admin: AdminActor,
  engagement: EngagementRow,
  dispute: DisputeRow,
  of: { heldCents: number; releasedCents: number; labourCents: number; reason: string },
): Promise<Write[]> {
  const now = ctx.now();
  const refundedCents = of.heldCents - of.releasedCents;
  const decidedNow = disputeIn(ctx, dispute.id, "decided", now);
  const ends = endsAs(dispute);
  const row = (kind: (typeof LEDGER_KINDS)[keyof typeof LEDGER_KINDS], amountCents: number) => ({
    kind,
    amountCents,
    paymentId: engagement.paymentId,
    engagementId: engagement.id,
  });
  const link = `/jobs/${engagement.jobId}`;
  const released = formatRands(of.releasedCents);
  const refunded = formatRands(refundedCents);
  return [
    ctx.db
      .update(disputes)
      .set({ state: "decided", closedAt: now, releasedCents: of.releasedCents, refundedCents })
      .where(and(eq(disputes.id, dispute.id), eq(disputes.state, "open"))),
    ...ledgerWrites(
      ctx,
      // What it takes of the Dispute first, then the Release and the Refund.
      [
        row(LEDGER_KINDS.disputeReleased, of.releasedCents),
        row(LEDGER_KINDS.disputeRefunded, refundedCents),
        ...releaseRows(engagement, LEDGER_KINDS.labourReleased, of.releasedCents),
      ],
      decidedNow,
    ),
    ...(refundedCents > 0
      ? (
          await refundWrites(
            ctx,
            engagement,
            "dispute",
            { materials: 0, labour: refundedCents },
            decidedNow,
          )
        ).writes
      : []),
    ...endWrites(ctx, engagement, ends, of.labourCents - of.heldCents, decidedNow),
    eventWrite(ctx, engagement, "dispute.decided", decidedNow),
    ...tellWhile(
      ctx,
      admin,
      [engagement.clientId],
      {
        event: "engagement.dispute-decided",
        title: `The Admin decided the Dispute: ${refunded} is refunded to you and ${released} released to the Artisan: ${engagement.jobTitle}`,
        link,
      },
      decidedNow,
    ),
    ...tellWhile(
      ctx,
      admin,
      [engagement.artisanId],
      {
        event: "engagement.dispute-decided",
        title: `The Admin decided the Dispute: ${released} is released to you and ${refunded} refunded to the Client: ${engagement.jobTitle}`,
        link,
      },
      decidedNow,
    ),
  ];
}

/** What the Admin reads of the Dispute itself. */
function disputeBlocks(dispute: DisputeRow): Block[] {
  const by = dispute.openedBy === "client" ? "the Client" : "the Artisan";
  const against = {
    completion: "the Completion",
    "fix-request": "the Fix request",
    cancellation: "the Cancellation's refund of the Labour",
  }[dispute.against];
  return [
    {
      kind: "text",
      text: `Opened by ${by} against ${against}, ${formatTime(dispute.openedAt)}, holding ${formatRands(dispute.heldCents)} of the Labour.`,
    },
    { kind: "text", text: dispute.reason },
    ...(dispute.photos.length > 0
      ? [
          {
            kind: "files" as const,
            files: dispute.photos.map((photo, index) => ({
              kind: "photo" as const,
              label: `Photo ${index + 1}`,
              href: disputeFilePath(dispute.id, photo),
            })),
          },
        ]
      : []),
    ...(dispute.reasonState === "held"
      ? [
          {
            kind: "text" as const,
            text: `The Content check was unsure of it, so the other party does not see it: ${dispute.reasonHeldFor ?? "it could not run."}`,
          },
        ]
      : []),
  ];
}

/** What a row that is not speech says, for the Admin. */
const EVENT_NAMES: Record<string, string> = {
  "quote.sent": "Quote sent",
  hire: "Hired",
  "work.started": "Work started",
  "completion.made": "Marked complete",
  "fix.requested": "Fix requested",
  approved: "Approved",
  refund: "Refund",
  cancelled: "Cancelled",
  "dispute.opened": "Dispute opened",
  "dispute.released": "Released in Dispute",
  "dispute.settled": "Dispute settled",
  "dispute.decided": "Dispute decided",
};

/**
 * The Engagement's Conversation as the Admin reads it on a logged click: every
 * delivered message and event row, oldest first, with each file on a link
 * that works for a while. Messages Held or refused are not in it.
 */
async function conversationBlocks(ctx: Context, engagement: EngagementRow): Promise<Block[]> {
  const rows = await ctx.db
    .select({ message: messages, sender: accounts.name, senderKind: accounts.kind })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .leftJoin(accounts, eq(accounts.id, messages.senderId))
    .where(
      and(
        eq(conversations.jobId, engagement.jobId),
        eq(conversations.artisanId, engagement.artisanId),
        eq(messages.state, "delivered"),
      ),
    )
    .orderBy(asc(messages.deliveredAt), asc(sql.raw(`"messages"."rowid"`)));
  if (rows.length === 0) return [{ kind: "text", text: "Nothing was said." }];
  const blocks: Block[] = [];
  for (const { message, sender, senderKind } of rows) {
    const at = formatTime(message.deliveredAt ?? message.sentAt);
    if (message.event) {
      const name = EVENT_NAMES[message.event] ?? message.event;
      blocks.push({
        kind: "text",
        text: `${at} · ${name}${message.text ? `: ${message.text}` : ""}`,
      });
      continue;
    }
    const who = `${sender ?? ""} (${senderKind === "client" ? "Client" : "Artisan"})`;
    blocks.push({ kind: "text", text: `${at} · ${who}: ${message.text}` });
    const files = [...message.photos, ...message.files];
    if (files.length > 0) {
      blocks.push({
        kind: "files",
        files: await Promise.all(
          files.map(async (file, index) => ({
            kind: file.kind,
            label: `${FILE_NAMES[file.kind]} ${index + 1}`,
            href: await fileLink(ctx, file.key),
          })),
        ),
      });
    }
  }
  return blocks;
}

const FILE_NAMES: Record<StoredFile["kind"], string> = {
  photo: "Photo",
  pdf: "PDF",
  "voice-note": "Voice note",
};

/**
 * The Engagement's Dispute as a party sees it: who opened it and against
 * what, what it named and holds now, its reason and photos (the opener's
 * own, and the other party's once the Content check passed them), and how it
 * closed. Null if there is none.
 */
export async function disputeView(
  ctx: Context,
  dispute: DisputeRow | null,
  party: DisputedBy,
  heldCents: number,
) {
  if (!dispute) return null;
  const shown = dispute.reasonState === "shown" || dispute.openedBy === party;
  const decision =
    dispute.state === "decided"
      ? {
          releasedCents: dispute.releasedCents ?? 0,
          refundedCents: dispute.refundedCents ?? 0,
          reason: await decisionReason(ctx, dispute.id),
        }
      : null;
  return {
    disputeId: dispute.id,
    by: dispute.openedBy,
    against: dispute.against,
    openedAt: dispute.openedAt,
    /** What it held when opened. */
    namedCents: dispute.heldCents,
    /** What it holds now. */
    heldCents: dispute.state === "open" ? heldCents : 0,
    reason: shown ? dispute.reason : null,
    /** Whether the Content check was unsure of the reason, for its opener: only the Admin reads it. */
    reasonHeld: dispute.openedBy === party && dispute.reasonState === "held",
    photos: shown
      ? dispute.photos.map((photo) => ({
          id: photo.id,
          width: photo.width,
          height: photo.height,
          href: disputeFilePath(dispute.id, photo),
          thumbnailHref: disputeFilePath(dispute.id, photo, true),
        }))
      : [],
    state: dispute.state,
    closedAt: dispute.closedAt,
    decision,
  };
}

/** The reason the Admin gave for deciding the Dispute. */
async function decisionReason(ctx: Context, disputeId: string) {
  const [row] = await ctx.db
    .select({ reason: queueItems.reason })
    .from(queueItems)
    .where(and(eq(queueItems.kind, disputeItem.kind), eq(queueItems.subjectId, disputeId)));
  return row?.reason ?? "";
}

/**
 * A Dispute's photo, or its thumbnail: to its opener, to the other party once
 * the Content check passed it, and to the Admin. Null for anyone else.
 */
export async function disputeFile(
  ctx: Context,
  viewer: Actor,
  input: { disputeId: string; fileId: string; thumbnail?: boolean },
) {
  const dispute = await disputeRow(ctx, input.disputeId);
  const engagement = dispute && (await engagementRow(ctx, dispute.engagementId));
  const photo = dispute?.photos.find((each) => each.id === input.fileId);
  if (!dispute || !engagement || !photo) return null;
  const party = viewer.kind === "admin" ? null : partyOf(viewer, engagement);
  const sees =
    viewer.kind === "admin" ||
    (party !== null && (party === dispute.openedBy || dispute.reasonState === "shown"));
  if (!sees) return null;
  const object = await ctx.ports.files.get(input.thumbnail ? photo.thumbnailKey : photo.key);
  if (!object) return null;
  return {
    body: object.body,
    contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
    size: object.size,
  };
}

/** The Engagement's Dispute, if it has one. */
export async function disputeOf(ctx: Context, engagementId: string) {
  const [row] = await ctx.db.select().from(disputes).where(eq(disputes.engagementId, engagementId));
  return row ?? null;
}

/** The Engagement's Dispute while it is open, if it has one. */
export async function openDisputeOf(ctx: Context, engagementId: string) {
  const dispute = await disputeOf(ctx, engagementId);
  return dispute?.state === "open" ? dispute : null;
}

async function disputeRow(ctx: Context, disputeId: string) {
  const [row] = await ctx.db.select().from(disputes).where(eq(disputes.id, disputeId));
  return row ?? null;
}

/**
 * The SQL that is true while the Dispute is in this state, and, given a time,
 * was closed then: by the very batch that closes it.
 */
function disputeIn(ctx: Context, disputeId: string, state: DisputeRow["state"], closedAt?: Date) {
  return exists(
    ctx.db
      .select({ one: sql`1` })
      .from(disputes)
      .where(
        and(
          eq(disputes.id, disputeId),
          eq(disputes.state, state),
          closedAt ? eq(disputes.closedAt, closedAt) : undefined,
        ),
      ),
  );
}

/** Which party of the Engagement the actor is; null for anyone else. */
function partyOf(actor: Actor, engagement: EngagementRow): DisputedBy | null {
  if (actor.kind === "client" && actor.accountId === engagement.clientId) return "client";
  if (actor.kind === "artisan" && actor.accountId === engagement.artisanId) return "artisan";
  return null;
}

/** Deletes what was stored, then gives the refusal. */
async function discarded<R>(ctx: Context, stored: StoredFile[], refusal: R): Promise<R> {
  await discardFiles(ctx, stored);
  return refusal;
}

function alreadyDisputed() {
  return refuse("already-disputed", "This Engagement is Disputed: the Admin decides it.");
}

function notFound() {
  return refuse("not-found", "That Engagement does not exist.");
}
