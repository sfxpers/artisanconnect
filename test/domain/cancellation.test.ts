import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import type { Actor } from "@/domain/actor";
import type { CreateRefund } from "@/domain/ports";
import type { FakePayments } from "@/domain/fakes/payments";
import { formatRands } from "@/domain/money";
import { createHarness, type Harness } from "../support/harness";
import { photo } from "../support/verification";

// Cancellation (#133, ADR 0007): either party ends an Engagement before
// Approval, with an optional reason. Before Work started the Client is
// refunded the Hired Quote at once, never the Protection Fee; after it the
// Materials stay with the Artisan and the unreleased Labour is refunded 72
// hours later, the Artisan reminded 24 hours before. Who cancelled, and the
// reason, go on the Artisan record, which only the Admin reads.

const HOUR = 60 * 60 * 1000;

describe("a Cancellation before Work started", () => {
  test("by the Client refunds the Hired Quote at once, without the Protection Fee, and tells the Artisan", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const { client, artisan, jobId, engagementId, collectionId } = await hiredJob(given);
    clock.advance({ hours: 2 });

    expect(await domain.engagements.cancel(client.actor, { engagementId })).toEqual({
      ok: true,
      value: null,
    });

    const engagement = (await domain.jobs.view(client.actor, { jobId }))?.engagement;
    expect(engagement).toMatchObject({
      state: "cancelled",
      canCancel: false,
      cancellation: {
        by: "client",
        cancelledAt: clock.now(),
        afterWorkStarted: false,
        labourRefund: null,
      },
      money: {
        paidInCents: 200_000,
        releasedCents: 0,
        refundedCents: 200_000,
        unreleasedCents: 0,
        protectionFeeCents: 10_000,
      },
      refunds: [
        {
          amountCents: 200_000,
          materialsCents: 50_000,
          labourCents: 150_000,
          state: "on-its-way",
        },
      ],
    });
    expect(engagement?.activity.slice(-2)).toEqual([
      { event: "cancelled", at: clock.now() },
      { event: "refunded", at: clock.now() },
    ]);
    expect(refundsAsked(payments)).toEqual([
      { id: expect.any(String), collectionId, amountCents: 200_000, reason: "Cancellation" },
    ]);
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({
        event: "engagement.cancelled",
        title: "The Client cancelled before Work started, and was refunded: Paint the lounge",
      }),
    ]);
    expect(await toldOf(domain, client, jobId)).toEqual([]);
  });

  test("by the Artisan tells the Client what is refunded to them", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);

    await cancelled(domain, artisan, engagementId);

    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      state: "cancelled",
      canCancel: false,
      cancellation: { by: "artisan", afterWorkStarted: false },
      money: { refundedCents: 200_000, unreleasedCents: 0 },
    });
    expect(await toldOf(domain, client, jobId)).toEqual([
      expect.objectContaining({
        event: "engagement.cancelled",
        title: `The Artisan cancelled before Work started, and ${formatRands(200_000)} is refunded to you: Paint the lounge`,
      }),
    ]);
    expect(await toldOf(domain, artisan, jobId)).toEqual([]);
  });

  test("refunds only what the Artisan has not refunded already", async () => {
    const { domain, given, payments } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await refunded(domain, artisan, engagementId, { materials: "100", labour: "400" });

    await cancelled(domain, client, engagementId);

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      money: { refundedCents: 200_000, unreleasedCents: 0 },
      refunds: [
        { amountCents: 50_000, materialsCents: 10_000, labourCents: 40_000 },
        { amountCents: 150_000, materialsCents: 40_000, labourCents: 110_000 },
      ],
    });
    // The second waits for the first to be answered: one at a time per Payment.
    expect(refundsAsked(payments).map((each) => each.amountCents)).toEqual([50_000]);
  });

  test("after the Artisan refunded everything makes no Refund", async () => {
    const { domain, given, payments } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await refunded(domain, artisan, engagementId, { materials: "500", labour: "1500" });

    await cancelled(domain, artisan, engagementId);

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "cancelled",
      refunds: [{ amountCents: 200_000 }],
    });
    expect(refundsAsked(payments)).toHaveLength(1);
    expect(await toldOf(domain, client, jobId)).toEqual([
      expect.objectContaining({
        title: "The Artisan cancelled before Work started: Paint the lounge",
      }),
    ]);
  });

  test("ends the Artisan's claim to have started: no Work started 24 hours later", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    const claimed = await domain.engagements.claimStarted(artisan.actor, { engagementId });
    if (!claimed.ok) throw new Error(claimed.refusal.message);

    await cancelled(domain, client, engagementId);
    clock.advance({ hours: 25 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "cancelled",
      workStartedAt: null,
      startClaim: null,
      money: { releasedCents: 0, refundedCents: 200_000 },
    });
    expect(await ledgerKinds(engagementId, "release.")).toEqual([]);
  });

  test("shows in the Conversation as a row that is not speech, then the Refund's", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    clock.advance({ hours: 1 });

    await cancelled(domain, client, engagementId);

    for (const party of [client, artisan]) {
      expect((await rows(domain, party, jobId)).slice(-2)).toEqual([
        { kind: "event", event: "cancelled", at: clock.now() },
        { kind: "event", event: "refund", text: formatRands(200_000), at: clock.now() },
      ]);
    }
  });
});

describe("a Cancellation after Work started", () => {
  test("leaves the Materials with the Artisan and refunds the Labour 72 hours later", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const { client, artisan, jobId, engagementId, collectionId } = await startedJob(given);

    await cancelled(domain, client, engagementId);

    const dueAt = new Date(clock.now().getTime() + 72 * HOUR);
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "cancelled",
      cancellation: {
        by: "client",
        afterWorkStarted: true,
        labourRefund: { dueAt, amountCents: 150_000 },
      },
      money: { releasedCents: 50_000, refundedCents: 0, unreleasedCents: 150_000 },
      refunds: [],
    });
    expect(refundsAsked(payments)).toEqual([]);
    expect(await toldOf(domain, artisan, jobId)).toContainEqual(
      expect.objectContaining({
        event: "engagement.cancelled",
        title: `The Client cancelled. The Materials stay with you, and the Labour not yet released, ${formatRands(150_000)}, is refunded to them at 08 Oct 2026, 08:00, unless you open a Dispute for work already done before then: Paint the lounge`,
      }),
    );

    clock.advance({ hours: 72 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "cancelled",
      cancellation: { labourRefund: null },
      money: { releasedCents: 50_000, refundedCents: 150_000, unreleasedCents: 0 },
      refunds: [{ amountCents: 150_000, materialsCents: 0, labourCents: 150_000 }],
    });
    expect(refundsAsked(payments)).toEqual([
      { id: expect.any(String), collectionId, amountCents: 150_000, reason: "Cancellation" },
    ]);
    expect(await rows(domain, artisan, jobId)).toContainEqual({
      kind: "event",
      event: "refund",
      text: formatRands(150_000),
      at: clock.now(),
    });
  });

  test("by the Artisan tells the Client when the Labour is refunded to them", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);

    await cancelled(domain, artisan, engagementId);

    expect(await toldOf(domain, client, jobId)).toEqual([
      expect.objectContaining({
        event: "engagement.cancelled",
        title: `The Artisan cancelled. The Materials stay with them, and the Labour not yet released, ${formatRands(150_000)}, is refunded to you at 08 Oct 2026, 08:00: Paint the lounge`,
      }),
    ]);
  });

  test("reminds the Artisan 24 hours before the Labour is refunded", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    await cancelled(domain, client, engagementId);

    clock.advance({ hours: 47 });
    await domain.system.runDueClocks();
    expect(await reminders(domain, artisan)).toEqual([]);

    clock.advance({ hours: 1 });
    await domain.system.runDueClocks();
    expect(await reminders(domain, artisan)).toEqual([
      expect.objectContaining({
        title: `The Labour not yet released, ${formatRands(150_000)}, is refunded to the Client in 24 hours, at 08 Oct 2026, 08:00. Open a Dispute before then for work already done: Paint the lounge`,
        link: `/jobs/${jobId}`,
      }),
    ]);
    expect(await reminders(domain, client)).toEqual([]);
  });

  test("refunds at 72 hours only what the Artisan has not refunded sooner", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    await cancelled(domain, client, engagementId);

    clock.advance({ hours: 10 });
    await refunded(domain, artisan, engagementId, { labour: "1000" });
    clock.advance({ hours: 62 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      money: { releasedCents: 50_000, refundedCents: 150_000, unreleasedCents: 0 },
      refunds: [{ amountCents: 100_000 }, { amountCents: 50_000 }],
    });
    expect(refundsAsked(payments).map((each) => each.reason)).toEqual(["Refund by the Artisan"]);
  });

  test("whose Labour the Artisan refunded in full sooner makes no Refund and no reminder", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    await cancelled(domain, artisan, engagementId);
    await refunded(domain, artisan, engagementId, { labour: "1500" });

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      cancellation: { labourRefund: null },
    });
    clock.advance({ hours: 73 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.refunds).toHaveLength(1);
    expect(refundsAsked(payments)).toHaveLength(1);
    expect(await reminders(domain, artisan)).toEqual([]);
  });

  test("refunds the Labour once, however late or often the clock runs", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, jobId, engagementId } = await startedJob(given);
    await cancelled(domain, client, engagementId);

    clock.advance({ days: 9 });
    await domain.system.runDueClocks();
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      money: { refundedCents: 150_000, unreleasedCents: 0 },
      refunds: [{ amountCents: 150_000 }],
    });
  });

  test("at Awaiting approval stops the seven days: the Labour is refunded, never released", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    await given.markedComplete(artisan, engagementId);

    await cancelled(domain, client, engagementId);
    clock.advance({ days: 8 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "cancelled",
      approval: null,
      completedAt: null,
      money: { releasedCents: 50_000, refundedCents: 150_000 },
    });
    expect(await ledgerKinds(engagementId, "release.labour")).toEqual([]);
    // No reminder of Approval by silence went to the Client either.
    expect((await toldOf(domain, client, jobId)).map((notice) => notice.event)).not.toContain(
      "engagement.approval-reminder",
    );
  });

  test("at Fix requested is allowed, as at Work started", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    await given.markedComplete(artisan, engagementId);
    const fixed = await domain.engagements.requestFix(client.actor, {
      engagementId,
      note: "The skirting is not painted.",
    });
    if (!fixed.ok) throw new Error(fixed.refusal.message);

    await cancelled(domain, artisan, engagementId);

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "cancelled",
      fixRequest: null,
      cancellation: { by: "artisan", afterWorkStarted: true },
    });
  });

  test("leaves a Held Completion unsent once the Admin releases it", async () => {
    const { domain, given, contentReader, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    contentReader.force({ kind: "unsure", reason: "It may ask to pay off the platform." });
    const sent = await domain.engagements.complete(artisan.actor, {
      engagementId,
      note: "Done.",
      photos: [await photo()],
    });
    expect(sent).toEqual({ ok: true, value: { state: "held" } });
    contentReader.force({ kind: "clear" });
    await cancelled(domain, client, engagementId);

    const admin = await given.admin();
    const [item] = (await domain.queues.home(admin.actor, { queue: "pre-checks" }))!.items;
    const decided = await domain.queues.decide(admin.actor, {
      itemId: item!.id,
      decision: "release",
    });
    expect(decided.ok).toBe(true);

    expect(await toldOf(domain, artisan, jobId)).toContainEqual(
      expect.objectContaining({
        event: "held.completion.released",
        title: "Your Completion is checked, but the work can no longer be marked complete",
      }),
    );
    clock.advance({ days: 8 });
    await domain.system.runDueClocks();
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "cancelled",
      completion: null,
      approval: null,
      money: { releasedCents: 50_000, refundedCents: 150_000 },
    });
    expect((await toldOf(domain, client, jobId)).map((notice) => notice.event)).not.toContain(
      "engagement.completion",
    );
  });
});

describe("a Cancellation", () => {
  test("is only before Approval", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await startedJob(given);
    await given.markedComplete(artisan, engagementId);
    const approved = await domain.engagements.approve(client.actor, { engagementId });
    if (!approved.ok) throw new Error(approved.refusal.message);

    for (const party of [client, artisan]) {
      expect(await domain.engagements.cancel(party.actor, { engagementId })).toEqual({
        ok: false,
        refusal: {
          reason: "not-cancellable",
          message: "This Engagement is Completed, so it can no longer be cancelled.",
        },
      });
    }
  });

  test("is once", async () => {
    const { domain, given, payments } = await createHarness();
    const { client, artisan, engagementId } = await hiredJob(given);
    await cancelled(domain, artisan, engagementId);

    for (const party of [client, artisan]) {
      expect(await domain.engagements.cancel(party.actor, { engagementId })).toEqual({
        ok: false,
        refusal: { reason: "not-cancellable", message: "This Engagement is already Cancelled." },
      });
    }
    expect(refundsAsked(payments)).toHaveLength(1);
  });

  test("is final: the database refuses any move out of Cancelled, or a second Cancellation", async () => {
    const { domain, given } = await createHarness();
    const { client, engagementId } = await hiredJob(given);
    await cancelled(domain, client, engagementId, "Never arrived.");

    for (const change of [
      "state = 'paid'",
      "state = 'work-started', work_started_at = 1, work_started_by = 'client'",
      "cancelled_by = 'artisan'",
      "cancellation_reason = 'Changed my mind.'",
    ]) {
      await expect(
        env.DB.prepare(`UPDATE engagements SET ${change} WHERE id = ?`).bind(engagementId).run(),
      ).rejects.toThrow("an Engagement cannot change that way");
    }
  });

  test("finishes the Job in the Client's Jobs, and both lists show the Engagement's state", async () => {
    const { domain, given } = await createHarness();
    const paid = await hiredJob(given);
    const ended = await hiredJob(given, paid.artisan, paid.client);

    await cancelled(domain, ended.client, ended.engagementId);

    expect(await domain.jobs.mine(paid.client.actor)).toMatchObject({
      inProgress: [{ jobId: paid.jobId, state: "hired", engagementState: "paid" }],
      finished: [{ jobId: ended.jobId, state: "hired", engagementState: "cancelled" }],
    });
    expect(await domain.quotes.mine(paid.artisan.actor)).toMatchObject([
      { jobId: ended.jobId, state: "hired", engagementState: "cancelled" },
      { jobId: paid.jobId, state: "hired", engagementState: "paid" },
    ]);
  });

  test("is only its parties' to make", async () => {
    const { domain, given } = await createHarness();
    const { engagementId } = await hiredJob(given);
    const otherClient = await given.client();
    const otherArtisan = await given.verifiedArtisan();
    const admin = await given.admin();

    for (const actor of [
      otherClient.actor,
      otherArtisan.actor,
      admin.actor,
      { kind: "visitor" } as const,
    ]) {
      expect(await domain.engagements.cancel(actor, { engagementId })).toEqual({
        ok: false,
        refusal: { reason: "not-found", message: "That Engagement does not exist." },
      });
    }
  });

  test("takes a reason of at most 500 characters", async () => {
    const { domain, given } = await createHarness();
    const { client, engagementId } = await hiredJob(given);

    expect(
      await domain.engagements.cancel(client.actor, { engagementId, reason: "x".repeat(501) }),
    ).toEqual({
      ok: false,
      refusal: { reason: "invalid", message: "A reason is at most 500 characters." },
    });
  });

  test("ends the Conversation: it goes read-only, and its messages stay", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    const [conversation] = (await domain.conversations.forJob(client.actor, { jobId }))!;
    const conversationId = conversation!.conversationId;
    await domain.conversations.send(client.actor, { conversationId, text: "See you Monday." });

    await cancelled(domain, client, engagementId);

    for (const party of [client, artisan]) {
      expect(await domain.conversations.view(party.actor, { conversationId })).toMatchObject({
        takesMessages: false,
        items: expect.arrayContaining([
          expect.objectContaining({ text: "See you Monday." }),
          expect.objectContaining({ kind: "event", event: "cancelled" }),
        ]),
      });
      expect(
        await domain.conversations.send(party.actor, { conversationId, text: "Why?" }),
      ).toEqual({
        ok: false,
        refusal: { reason: "read-only", message: "This Conversation has ended." },
      });
    }
  });

  test("on a clock that ticks between reads, as a real one does, still refunds and tells", async () => {
    const { domain, given, clock, payments } = await createHarness();
    const before = await hiredJob(given);
    const after = await startedJob(given);
    const frozen = clock.now;
    clock.now = () => {
      clock.advance({ minutes: 0.001 });
      return frozen();
    };

    await cancelled(domain, before.client, before.engagementId);
    await cancelled(domain, after.client, after.engagementId);
    clock.advance({ hours: 73 });
    await domain.system.runDueClocks();

    expect(refundsAsked(payments).map((each) => each.amountCents)).toEqual([200_000, 150_000]);
    for (const { artisan, jobId } of [before, after]) {
      expect((await toldOf(domain, artisan, jobId)).map((notice) => notice.event)).toContain(
        "engagement.cancelled",
      );
    }
    expect(await reminders(domain, after.artisan)).toHaveLength(1);
  });
});

describe("the Artisan record", () => {
  test("holds who cancelled, when, and the reason, for the Admin only", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const first = await hiredJob(given);
    clock.advance({ hours: 1 });
    await cancelled(domain, first.client, first.engagementId, "Never arrived.");
    const firstAt = clock.now();

    const second = await startedJob(given, first.artisan);
    clock.advance({ hours: 1 });
    await cancelled(domain, first.artisan, second.engagementId, "Sick.");
    const secondAt = clock.now();

    const third = await startedJob(given, first.artisan);
    clock.advance({ hours: 1 });
    await cancelled(domain, third.client, third.engagementId);
    const thirdAt = clock.now();

    const artisanId = first.artisan.actor.accountId;
    expect(await domain.engagements.artisanRecord(admin.actor, { artisanId })).toEqual({
      cancelledByArtisan: 1,
      cancelledByClientsBeforeWorkStarted: 1,
      cancellations: [
        {
          jobId: third.jobId,
          jobTitle: "Paint the lounge",
          cancelledAt: thirdAt,
          by: "client",
          afterWorkStarted: true,
          reason: null,
        },
        {
          jobId: second.jobId,
          jobTitle: "Paint the lounge",
          cancelledAt: secondAt,
          by: "artisan",
          afterWorkStarted: true,
          reason: "Sick.",
        },
        {
          jobId: first.jobId,
          jobTitle: "Paint the lounge",
          cancelledAt: firstAt,
          by: "client",
          afterWorkStarted: false,
          reason: "Never arrived.",
        },
      ],
      disputesDecidedAgainst: 0,
      disputes: [],
    });
    for (const party of [first.client, first.artisan]) {
      expect(await domain.engagements.artisanRecord(party.actor, { artisanId })).toBeNull();
    }
  });

  test("shows beside the Artisan's items in the Admin's queues", async () => {
    const { domain, given, contentReader } = await createHarness();
    const admin = await given.admin();
    const first = await hiredJob(given);
    await cancelled(domain, first.client, first.engagementId, "Never arrived.");
    const second = await startedJob(given, first.artisan);
    contentReader.force({ kind: "unsure", reason: "It may ask to pay off the platform." });
    await domain.engagements.complete(first.artisan.actor, {
      engagementId: second.engagementId,
      note: "Done.",
      photos: [await photo()],
    });

    const [held] = (await domain.queues.home(admin.actor, { queue: "pre-checks" }))!.items;
    const item = await domain.queues.item(admin.actor, { itemId: held!.id });

    expect(item?.sidebar).toContainEqual({
      title: "Artisan record",
      blocks: [
        {
          kind: "facts",
          facts: [
            { label: "Cancelled by the Artisan", value: "0" },
            { label: "Cancelled by Clients before Work started", value: "1" },
            { label: "Disputes decided against the Artisan", value: "0" },
          ],
        },
        {
          kind: "text",
          text: "05 Oct 2026, 08:00 · Paint the lounge: cancelled by the Client before Work started. “Never arrived.”",
        },
      ],
    });
  });
});

type Artisan = Awaited<ReturnType<Harness["given"]["matchableArtisan"]>>;
type Client = Awaited<ReturnType<Harness["given"]["client"]>>;

/**
 * A Client's Painting Job Hired from the default Quote: R1 500 Labour and
 * R500 Materials, starting today (5 October 2026). The Artisan given, or a
 * new one, Quotes it.
 */
async function hiredJob(given: Harness["given"], by?: Artisan, of?: Client) {
  const client = of ?? (await given.client());
  const artisan = by ?? (await given.matchableArtisan({ name: "Sipho Dlamini" }));
  const jobId = await given.openJob(client);
  const quoteId = await given.sentQuote(artisan, jobId, { startOn: "2026-10-05" });
  const collectionId = await given.hired(client, quoteId);
  const engagementId = await given.engagementOf(client, jobId);
  return { client, artisan, jobId, quoteId, engagementId, collectionId };
}

/** As `hiredJob`, with Work started by the Client, which released the Materials. */
async function startedJob(given: Harness["given"], by?: Artisan) {
  const hired = await hiredJob(given, by);
  await given.workStarted(hired.client, hired.engagementId);
  return hired;
}

async function cancelled(
  domain: Harness["domain"],
  party: { actor: Actor },
  engagementId: string,
  reason?: string,
) {
  const made = await domain.engagements.cancel(party.actor, { engagementId, reason });
  if (!made.ok) throw new Error(made.refusal.message);
}

async function refunded(
  domain: Harness["domain"],
  artisan: { actor: Actor },
  engagementId: string,
  amounts: { materials?: string; labour?: string },
) {
  const made = await domain.engagements.refund(artisan.actor, { engagementId, ...amounts });
  if (!made.ok) throw new Error(made.refusal.message);
}

/** Every Refund the payment adapter was asked for, oldest first. */
function refundsAsked(payments: FakePayments): CreateRefund[] {
  return payments.calls
    .filter((call) => call.operation === "refund")
    .map((call) => call.input as CreateRefund);
}

/** The rows of the Job's one Conversation, as the party sees it. */
async function rows(domain: Harness["domain"], party: { actor: Actor }, jobId: string) {
  const [conversation] = (await domain.conversations.forJob(party.actor, { jobId }))!;
  return (await domain.conversations.view(party.actor, {
    conversationId: conversation!.conversationId,
  }))!.items;
}

/** What the Account was told of the Job since it was Hired, newest first. */
async function toldOf(domain: Harness["domain"], account: { actor: Actor }, jobId: string) {
  const notices = await domain.notices.list(account.actor);
  return notices.filter(
    (notice) =>
      notice.link === `/jobs/${jobId}` &&
      !["job.matched", "job.invited", "quote.sent", "engagement.hired"].includes(notice.event),
  );
}

/** The reminders the Account was given that a Cancellation's Labour is about to be refunded. */
async function reminders(domain: Harness["domain"], account: { actor: Actor }) {
  return (await domain.notices.list(account.actor)).filter(
    (notice) => notice.event === "engagement.cancellation-reminder",
  );
}

/** The kinds of the Engagement's ledger rows whose kind starts so. */
async function ledgerKinds(engagementId: string, kind: string) {
  const { results } = await env.DB.prepare(
    "SELECT kind FROM ledger_entries WHERE engagement_id = ? AND kind LIKE ?",
  )
    .bind(engagementId, `${kind}%`)
    .all<{ kind: string }>();
  return results.map((row) => row.kind);
}
