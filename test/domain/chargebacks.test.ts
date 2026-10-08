import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import type { Actor } from "@/domain/actor";
import type { ChargebackOutcome } from "@/domain/ports";
import { formatRands } from "@/domain/money";
import { createHarness, type Harness } from "../support/harness";

// Chargebacks (#137): a card Payment the bank reverses freezes its
// Engagement, suspends the Client, and goes to the Admin, who, once the bank
// has closed it, decides the unreleased money: released to the Artisan, or
// left to the Client, by the Chargeback as far as the bank sent it back and
// by a Refund beyond that. The decision ends the Engagement. Money already
// released stays the Artisan's; a Payout already sent is the platform's loss.

/** The run's time in the tests: 10:00 in South Africa on the fake clock's first day. */
const RUN_AT = new Date("2026-10-05T08:00:00Z");

describe("a Chargeback opened", () => {
  test("freezes the Engagement, suspends the Client and tells them, tells the Artisan, and raises a Chargebacks item", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    clock.advance({ hours: 1 });

    await opened(given, (await hiredPayment(engagementId))!);

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "work-started",
      canCancel: false,
      chargeback: { frozen: true, openedAt: clock.now(), decision: null },
    });
    expect((await domain.accounts.me(client.actor))?.standing.suspended).toEqual({
      reason: expect.stringMatching(/charged back/),
      since: clock.now(),
    });
    expect(await domain.notices.list(client.actor)).toContainEqual(
      expect.objectContaining({ event: "account.suspended", title: "Your Account is suspended" }),
    );
    expect(await domain.notices.list(client.actor)).toContainEqual(
      expect.objectContaining({ event: "engagement.charged-back" }),
    );
    expect(await domain.notices.list(artisan.actor)).toContainEqual(
      expect.objectContaining({
        event: "engagement.charged-back",
        title:
          "The Client charged back their card Payment. Money already released to you stays yours; nothing more is released until the Admin decides the rest: Paint the lounge",
      }),
    );
    expect((await domain.queues.home(admin.actor, { queue: "chargebacks" }))?.items).toEqual([
      expect.objectContaining({ queue: "chargebacks", title: "Chargeback: Paint the lounge" }),
    ]);
    expect(await chargebackRows(engagementId)).toEqual([
      { kind: "chargeback.opened", amount_cents: 210_000 },
    ]);
    for (const party of [client, artisan]) {
      expect((await rows(domain, party, jobId)).at(-1)).toMatchObject({
        kind: "event",
        event: "chargeback.opened",
      });
    }
  });

  test("shows the Suspension on the People page as the system's", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, engagementId } = await hiredJob(given);

    await opened(given, (await hiredPayment(engagementId))!);

    const person = await domain.people.view(admin.actor, { accountId: client.actor.accountId });
    expect(person?.suspensions).toEqual([
      expect.objectContaining({ bySystem: true, liftedAt: null }),
    ]);
  });

  test("refuses every step of the work, and every Release and Refund, while frozen", async () => {
    const { domain, given } = await createHarness();
    const paid = await hiredJob(given);
    const awaiting = await awaitingApproval(given);
    for (const job of [paid, awaiting])
      await opened(given, (await hiredPayment(job.engagementId))!);
    const frozen = { ok: false, refusal: { reason: "frozen" } };

    const on = { engagementId: paid.engagementId };
    expect(await domain.engagements.workStarted(paid.client.actor, on)).toMatchObject(frozen);
    expect(await domain.engagements.claimStarted(paid.artisan.actor, on)).toMatchObject(frozen);
    expect(await domain.engagements.cancel(paid.client.actor, on)).toMatchObject(frozen);
    expect(
      await domain.engagements.refund(paid.artisan.actor, { ...on, labour: "100" }),
    ).toMatchObject(frozen);
    expect(
      await domain.engagements.proposeUpdatedQuote(paid.artisan.actor, {
        ...on,
        labour: "2000",
        materials: "500",
      }),
    ).toMatchObject(frozen);

    const done = { engagementId: awaiting.engagementId };
    expect(await domain.engagements.approve(awaiting.client.actor, done)).toMatchObject(frozen);
    expect(
      await domain.engagements.requestFix(awaiting.client.actor, { ...done, note: "Redo it." }),
    ).toMatchObject(frozen);
    expect(
      await domain.engagements.dispute(awaiting.client.actor, {
        ...done,
        amount: "500",
        reason: "The east wall is missing a coat.",
      }),
    ).toMatchObject(frozen);
    expect(await money(domain, awaiting)).toMatchObject({ releasedCents: 50_000 });
  });

  test("ends an Updated Quote waiting for the Client; its Payment arriving later is refunded whole", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    const proposed = await domain.engagements.proposeUpdatedQuote(artisan.actor, {
      engagementId,
      labour: "2000",
      materials: "500",
    });
    if (!proposed.ok) throw new Error(proposed.refusal.message);
    const checkout = await domain.engagements.acceptUpdatedQuote(client.actor, {
      updatedQuoteId: proposed.value.updatedQuoteId,
      feeAcknowledged: true,
    });
    if (!checkout.ok) throw new Error(checkout.refusal.message);

    await opened(given, (await hiredPayment(engagementId))!);
    await given.paid(new URL(checkout.value.checkoutUrl).pathname.split("/").at(-1)!);

    const job = await domain.jobs.view(client.actor, { jobId });
    expect(job?.engagement?.updatedQuote).toBeNull();
    expect(job?.notHired).toEqual([
      expect.objectContaining({ reason: "updated-quote-ended", amountCents: 52_500 }),
    ]);
    expect(await money(domain, { client, jobId })).toMatchObject({ paidInCents: 200_000 });
  });
});

describe("every clock on a frozen Engagement", () => {
  test("does nothing when the Artisan's claim's 24 hours end", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    const claimed = await domain.engagements.claimStarted(artisan.actor, { engagementId });
    if (!claimed.ok) throw new Error(claimed.refusal.message);
    await opened(given, (await hiredPayment(engagementId))!);

    clock.advance({ hours: 25 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "paid",
      money: { releasedCents: 0, unreleasedCents: 200_000 },
    });
  });

  test("does nothing when a Completion's seven days end, nor reminds the Client", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, jobId, engagementId } = await awaitingApproval(given);
    await opened(given, (await hiredPayment(engagementId))!);

    clock.advance({ days: 6 });
    await domain.system.runDueClocks();
    clock.advance({ days: 2 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "awaiting-approval",
      money: { releasedCents: 50_000, unreleasedCents: 150_000 },
    });
    const told = (await domain.notices.list(client.actor)).map((notice) => notice.event);
    expect(told).not.toContain("engagement.approval-reminder");
    expect(told).not.toContain("engagement.approved");
  });

  test("does nothing when a Cancellation's 72 hours end, nor reminds the Artisan", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    const cancelled = await domain.engagements.cancel(client.actor, { engagementId });
    if (!cancelled.ok) throw new Error(cancelled.refusal.message);
    await opened(given, (await hiredPayment(engagementId))!);

    clock.advance({ hours: 73 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "cancelled",
      refunds: [],
      money: { unreleasedCents: 150_000 },
    });
    expect((await domain.notices.list(artisan.actor)).map((notice) => notice.event)).not.toContain(
      "engagement.cancellation-reminder",
    );
  });
});

describe("the Admin's decision", () => {
  test("waits for the bank to close the Chargeback", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { engagementId } = await startedJob(given);
    await opened(given, (await hiredPayment(engagementId))!);

    const item = await itemOf(domain, admin);
    expect(item?.decisions).toEqual([]);
    expect(
      await domain.queues.decide(admin.actor, {
        itemId: item!.id,
        decision: "decide",
        reason: "Fair.",
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-allowed" } });
  });

  test("once the bank closes it, splits each unreleased line, with what it sent back recorded", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { engagementId } = await hiredJob(given);
    const collectionId = (await hiredPayment(engagementId))!;
    await opened(given, collectionId);

    await closed(given, collectionId, "lost", 210_000);

    expect(await chargebackRows(engagementId)).toEqual([
      { kind: "chargeback.opened", amount_cents: 210_000 },
      { kind: "chargeback.reversed", amount_cents: 210_000 },
    ]);
    expect((await itemOf(domain, admin))?.decisions).toEqual([
      expect.objectContaining({
        key: "decide",
        reason: "required",
        fields: [
          expect.objectContaining({
            key: "materialsReleasedCents",
            type: "split",
            value: "0",
            totalCents: 50_000,
          }),
          expect.objectContaining({
            key: "labourReleasedCents",
            type: "split",
            value: "0",
            totalCents: 150_000,
          }),
        ],
      }),
    ]);
  });

  test("releases what the Admin gives the Artisan and leaves the rest with the Chargeback: the Engagement is Cancelled, and the platform's loss recorded", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    const collectionId = (await hiredPayment(engagementId))!;
    await opened(given, collectionId);
    await closed(given, collectionId, "lost", 210_000);

    await decided(
      domain,
      admin,
      { labourReleasedCents: "60000" },
      "The Artisan did a third of it.",
    );

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "cancelled",
      cancellation: null,
      refunds: [],
      money: { releasedCents: 110_000, unreleasedCents: 0 },
      chargeback: {
        frozen: false,
        decision: {
          releasedCents: 60_000,
          chargedBackCents: 90_000,
          refundedCents: 0,
          reason: "The Artisan did a third of it.",
        },
      },
    });
    expect(await chargebackRows(engagementId)).toEqual([
      { kind: "chargeback.opened", amount_cents: 210_000 },
      { kind: "chargeback.reversed", amount_cents: 210_000 },
      // The bank sent back R2 100; the platform held back R900 of it.
      { kind: "chargeback.loss", amount_cents: 120_000 },
      { kind: "chargeback.labour", amount_cents: 90_000 },
    ]);
    expect(await kindRows(engagementId, "release.labour")).toEqual([
      { kind: "release.labour", amount_cents: 60_000 },
    ]);
    expect(await domain.notices.list(artisan.actor)).toContainEqual(
      expect.objectContaining({
        event: "engagement.chargeback-decided",
        title: `The Admin decided the money the Chargeback froze: ${formatRands(60_000)} is released to you, and ${formatRands(90_000)} goes back to the Client: Paint the lounge`,
      }),
    );
    expect(await domain.notices.list(client.actor)).toContainEqual(
      expect.objectContaining({
        event: "engagement.chargeback-decided",
        title: `The Admin decided the money your Chargeback froze: ${formatRands(60_000)} is released to the Artisan, ${formatRands(90_000)} stays with your bank's Chargeback: Paint the lounge`,
      }),
    );
    expect((await rows(domain, client, jobId)).at(-1)).toMatchObject({
      event: "chargeback.decided",
    });
    const record = await domain.engagements.artisanRecord(admin.actor, {
      artisanId: artisan.actor.accountId,
    });
    expect(record?.cancellations).toEqual([]);
  });

  test("refunds what is left to the Client beyond what the bank sent back, as when the platform won", async () => {
    const { domain, given, payments } = await createHarness();
    const admin = await given.admin();
    const { client, jobId, engagementId } = await startedJob(given);
    const collectionId = (await hiredPayment(engagementId))!;
    await opened(given, collectionId);
    await closed(given, collectionId, "won", 0);

    await decided(domain, admin, { labourReleasedCents: "100000" }, "Half the work is missing.");

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "cancelled",
      refunds: [expect.objectContaining({ labourCents: 50_000, materialsCents: 0 })],
      chargeback: {
        decision: { releasedCents: 100_000, chargedBackCents: 0, refundedCents: 50_000 },
      },
    });
    expect(payments.calls.filter((call) => call.operation === "refund")).toEqual([
      {
        operation: "refund",
        input: expect.objectContaining({
          collectionId,
          amountCents: 50_000,
          reason: "Chargeback decision",
        }),
      },
    ]);
    expect(await kindRows(engagementId, "chargeback.loss")).toEqual([]);
  });

  test("makes an Engagement awaiting approval Completed", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, jobId, engagementId } = await awaitingApproval(given);
    const collectionId = (await hiredPayment(engagementId))!;
    await opened(given, collectionId);
    await closed(given, collectionId, "lost", 210_000);

    await decided(domain, admin, { labourReleasedCents: "150000" }, "The work was done.");

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "completed",
      completedAt: expect.any(Date),
      money: { releasedCents: 200_000, unreleasedCents: 0 },
    });
    expect(await kindRows(engagementId, "chargeback.loss")).toEqual([
      { kind: "chargeback.loss", amount_cents: 210_000 },
    ]);
  });

  test("a Completion it made does not lower the Artisan Fee on the Client Relationship's later work", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, engagementId } = await awaitingApproval(given);
    const collectionId = (await hiredPayment(engagementId))!;
    await opened(given, collectionId);
    await closed(given, collectionId, "lost", 210_000);
    await decided(domain, admin, {}, "The work was not done.");
    await domain.people.lift(admin.actor, { accountId: client.actor.accountId });

    const second = await given.openJob(client, {
      matching: "invite-only",
      title: "Paint the stoep",
    });
    await domain.invitations.invite(client.actor, {
      jobId: second,
      artisanId: artisan.actor.accountId,
    });
    await given.hired(client, await given.sentQuote(artisan, second));

    expect(
      (await domain.jobs.viewAsArtisan(artisan.actor, { jobId: second }))?.engagement?.money,
    ).toMatchObject({ artisanFeePercent: 10 });
  });

  test("decides what a Dispute holds too, closing it and its item", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, jobId, engagementId } = await awaitingApproval(given);
    const disputed = await domain.engagements.dispute(client.actor, {
      engagementId,
      amount: "600",
      reason: "The second coat is missing on the east wall.",
    });
    if (!disputed.ok) throw new Error(disputed.refusal.message);
    const collectionId = (await hiredPayment(engagementId))!;
    await opened(given, collectionId);
    await closed(given, collectionId, "lost", 210_000);
    const [disputeItem] = (await domain.queues.home(admin.actor, { queue: "disputes" }))!.items;
    expect((await domain.queues.item(admin.actor, { itemId: disputeItem!.id }))?.decisions).toEqual(
      [],
    );

    await decided(domain, admin, { labourReleasedCents: "120000" }, "Most of it was done.");

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "completed",
      dispute: { state: "decided", heldCents: 0 },
      money: { releasedCents: 170_000, unreleasedCents: 0, heldCents: 0 },
    });
    expect(
      (await domain.queues.item(admin.actor, { itemId: disputeItem!.id }))?.decided,
    ).toMatchObject({ decision: "chargeback", label: "Decided with the Chargeback" });
  });

  test("may release part of the Materials before Work started, leaving the rest with the Chargeback", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, jobId, engagementId } = await hiredJob(given);
    const collectionId = (await hiredPayment(engagementId))!;
    await opened(given, collectionId);
    await closed(given, collectionId, "lost", 210_000);

    await decided(domain, admin, { materialsReleasedCents: "20000" }, "Some paint was bought.");

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "cancelled",
      workStartedAt: null,
      money: { releasedCents: 20_000, unreleasedCents: 0 },
      chargeback: { decision: { releasedCents: 20_000, chargedBackCents: 180_000 } },
    });
    expect(await kindRows(engagementId, "chargeback.loss")).toEqual([
      { kind: "chargeback.loss", amount_cents: 30_000 },
    ]);
  });

  test("decides the Engagement's money once for every Chargeback on it, once the bank closed each", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    const proposed = await domain.engagements.proposeUpdatedQuote(artisan.actor, {
      engagementId,
      labour: "2000",
      materials: "500",
    });
    if (!proposed.ok) throw new Error(proposed.refusal.message);
    const checkout = await domain.engagements.acceptUpdatedQuote(client.actor, {
      updatedQuoteId: proposed.value.updatedQuoteId,
      feeAcknowledged: true,
    });
    if (!checkout.ok) throw new Error(checkout.refusal.message);
    const updatedId = new URL(checkout.value.checkoutUrl).pathname.split("/").at(-1)!;
    await given.paid(updatedId);
    const hireId = (await hiredPayment(engagementId))!;
    await opened(given, hireId);
    await opened(given, updatedId);
    await closed(given, hireId, "lost", 210_000);
    const [first, second] = (await domain.queues.home(admin.actor, { queue: "chargebacks" }))!
      .items;
    expect((await domain.queues.item(admin.actor, { itemId: first!.id }))?.decisions).toEqual([]);

    await closed(given, updatedId, "lost", 52_500);
    await decided(domain, admin, {}, "No work after the Materials.");

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "cancelled",
      money: { releasedCents: 50_000, unreleasedCents: 0, paidInCents: 250_000 },
      chargeback: {
        frozen: false,
        decision: { releasedCents: 0, chargedBackCents: 200_000, refundedCents: 0 },
      },
    });
    expect((await domain.queues.item(admin.actor, { itemId: second!.id }))?.decided).toMatchObject({
      decision: "together",
    });
    // R2 625 sent back; R2 000 of it held back.
    const loss = await kindRows(engagementId, "chargeback.loss");
    expect(loss.reduce((sum, row) => sum + row.amount_cents, 0)).toBe(62_500);
  });

  test("lets the Admin read the Conversation on a logged click", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { engagementId } = await startedJob(given);
    await opened(given, (await hiredPayment(engagementId))!);
    const item = await itemOf(domain, admin);
    expect(item?.tabs).toContainEqual({
      key: "conversation",
      label: "The Conversation",
      read: "conversation",
    });

    const read = await domain.queues.open(admin.actor, { itemId: item!.id, read: "conversation" });

    expect(read.ok).toBe(true);
    expect((await domain.admins.auditLog(admin.actor))!.rows).toContainEqual(
      expect.objectContaining({
        action: "read",
        summary: "Opened the Conversation: Chargeback: Paint the lounge",
      }),
    );
  });

  test("is final", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { engagementId } = await startedJob(given);
    const collectionId = (await hiredPayment(engagementId))!;
    await opened(given, collectionId);
    await closed(given, collectionId, "lost", 210_000);
    const item = await itemOf(domain, admin);
    await decided(domain, admin, {}, "Fair.");

    expect(
      await domain.queues.decide(admin.actor, {
        itemId: item!.id,
        decision: "decide",
        reason: "Again.",
        fields: { labourReleasedCents: "0", "labourReleasedCents.of": "150000" },
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "already-decided" } });
  });
});

describe("on a clock that ticks between reads, as a real one does", () => {
  test("a Chargeback opens, closes, and is decided, ending the Engagement", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const { client, jobId, engagementId } = await startedJob(given);
    const collectionId = (await hiredPayment(engagementId))!;
    const frozen = clock.now;
    clock.now = () => {
      clock.advance({ minutes: 0.001 });
      return frozen();
    };

    await opened(given, collectionId);
    await closed(given, collectionId, "lost", 210_000);
    await decided(domain, admin, { labourReleasedCents: "60000" }, "A third was done.");

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "cancelled",
      money: { releasedCents: 110_000, unreleasedCents: 0 },
      chargeback: { frozen: false, decision: { releasedCents: 60_000, chargedBackCents: 90_000 } },
    });
    expect(await chargebackRows(engagementId)).toEqual([
      { kind: "chargeback.opened", amount_cents: 210_000 },
      { kind: "chargeback.reversed", amount_cents: 210_000 },
      { kind: "chargeback.loss", amount_cents: 120_000 },
      { kind: "chargeback.labour", amount_cents: 90_000 },
    ]);
  });
});

describe("money already released", () => {
  test("stays the Artisan's: its Payout still goes in the daily run, and once sent is the platform's loss", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { engagementId } = await startedJob(given);
    const collectionId = (await hiredPayment(engagementId))!;
    await opened(given, collectionId);

    clock.set(RUN_AT);
    expect(await domain.system.runPayouts()).toEqual({ ran: true, sent: 1, floatShort: false });
    const [payout] = payments.calls.filter((call) => call.operation === "createPayout");
    await domain.system.receivePaymentEvent(
      await payments.succeedPayout((payout!.input as { id: string }).id),
    );
    await closed(given, collectionId, "lost", 210_000);
    const item = await itemOf(domain, admin);

    expect(item?.sidebar.find((each) => each.title === "Money")?.blocks).toContainEqual(
      expect.objectContaining({
        facts: expect.arrayContaining([
          { label: "Paid out to the Artisan", value: formatRands(45_000) },
          { label: "The Artisan's Payouts", value: "Not held. Hold them on the People page." },
        ]),
      }),
    );
    await decided(domain, admin, {}, "Nothing was done after the Materials.");
    // R2 100 sent back, R1 500 of it held back: the Materials released and the Protection Fee lost.
    expect(await kindRows(engagementId, "chargeback.loss")).toEqual([
      { kind: "chargeback.loss", amount_cents: 60_000 },
    ]);
  });

  test("waits while the Admin holds the Artisan's Payouts", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const { artisan, engagementId } = await startedJob(given);
    await opened(given, (await hiredPayment(engagementId))!);
    const held = await domain.payouts.hold(admin.actor, { artisanId: artisan.actor.accountId });
    if (!held.ok) throw new Error(held.refusal.message);

    clock.set(RUN_AT);

    expect(await domain.system.runPayouts()).toEqual({ ran: true, sent: 0, floatShort: false });
  });
});

describe("repeated and out-of-order Chargeback events", () => {
  test("change nothing twice", async () => {
    const { domain, given, payments } = await createHarness();
    const admin = await given.admin();
    const { client, engagementId } = await startedJob(given);
    const collectionId = (await hiredPayment(engagementId))!;
    const opening = await payments.openChargeback(collectionId);
    const closing = await payments.closeChargeback(collectionId, {
      outcome: "lost",
      reversedCents: 210_000,
    });

    for (const event of [opening, opening, closing, closing, opening]) {
      expect(await domain.system.receivePaymentEvent(event)).toEqual({ ok: true, value: {} });
    }

    expect(await chargebackRows(engagementId)).toEqual([
      { kind: "chargeback.opened", amount_cents: 210_000 },
      { kind: "chargeback.reversed", amount_cents: 210_000 },
    ]);
    expect((await domain.queues.home(admin.actor, { queue: "chargebacks" }))?.items).toHaveLength(
      1,
    );
    expect(
      (await domain.notices.list(client.actor)).filter(
        (each) => each.event === "account.suspended",
      ),
    ).toHaveLength(1);
  });

  test("a closing that arrives first opens it, closed, and its opening then changes nothing", async () => {
    const { domain, given, payments } = await createHarness();
    const admin = await given.admin();
    const { client, jobId, engagementId } = await startedJob(given);
    const collectionId = (await hiredPayment(engagementId))!;
    const opening = await payments.openChargeback(collectionId);
    const closing = await payments.closeChargeback(collectionId, {
      outcome: "partially_accepted",
      reversedCents: 100_000,
    });

    await domain.system.receivePaymentEvent(closing);
    await domain.system.receivePaymentEvent(opening);

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.chargeback).toMatchObject(
      { frozen: true },
    );
    expect((await domain.accounts.me(client.actor))?.standing.suspended).not.toBeNull();
    expect(await chargebackRows(engagementId)).toEqual([
      { kind: "chargeback.opened", amount_cents: 210_000 },
      { kind: "chargeback.reversed", amount_cents: 100_000 },
    ]);
    expect((await itemOf(domain, admin))?.decisions).toEqual([
      expect.objectContaining({ key: "decide" }),
    ]);
  });

  test("an opening before its Payment's own event is left for the provider to send again", async () => {
    const { domain, given, payments } = await createHarness();
    const client = await given.client();
    const artisan = await given.matchableArtisan({ name: "Sipho Dlamini" });
    const jobId = await given.openJob(client);
    const quoteId = await given.sentQuote(artisan, jobId, { startOn: "2026-10-05" });
    const collectionId = await given.checkout(client, quoteId);
    const arrived = await payments.succeedCollection(collectionId);
    const opening = await payments.openChargeback(collectionId);

    await expect(domain.system.receivePaymentEvent(opening)).rejects.toThrow(/before it arrived/);
    await domain.system.receivePaymentEvent(arrived);
    await domain.system.receivePaymentEvent(opening);

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.chargeback).toMatchObject(
      { frozen: true },
    );
  });
});

describe("a Refund waiting on a charged-back Payment", () => {
  test("is not sent while frozen, and the decision marks it sent back by the bank, lowering the loss", async () => {
    const { domain, given, payments } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    // One Refund at a time per Payment: the second waits while the first is with the adapter.
    for (const labour of ["200", "300"]) {
      const made = await domain.engagements.refund(artisan.actor, { engagementId, labour });
      if (!made.ok) throw new Error(made.refusal.message);
    }
    const collectionId = (await hiredPayment(engagementId))!;
    await opened(given, collectionId);
    const [first] = refundsAsked(payments);
    await domain.system.receivePaymentEvent(await payments.succeedRefund(first!.id));
    await domain.system.runDueClocks();

    expect(refundsAsked(payments)).toHaveLength(1);

    await closed(given, collectionId, "lost", 210_000);
    await decided(domain, admin, {}, "The work was not done.");
    await domain.system.runDueClocks();

    expect(refundsAsked(payments)).toHaveLength(1);
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.refunds).toEqual([
      expect.objectContaining({ amountCents: 20_000, state: "paid" }),
      expect.objectContaining({ amountCents: 30_000, state: "charged-back" }),
    ]);
    // What the bank sent back, less the R1 000 of Labour left with it and the R300 Refund it paid instead.
    expect(await kindRows(engagementId, "chargeback.loss")).toEqual([
      { kind: "chargeback.loss", amount_cents: 80_000 },
    ]);
    expect(await kindRows(engagementId, "refund.charged-back")).toEqual([
      { kind: "refund.charged-back", amount_cents: 30_000 },
    ]);
    expect(await domain.notices.list(client.actor)).toContainEqual(
      expect.objectContaining({
        event: "engagement.chargeback-decided",
        title: expect.stringContaining(
          `${formatRands(30_000)} of your Refunds is not sent, as your bank sent it back`,
        ),
      }),
    );
  });
});

describe("a Chargeback on other Payments", () => {
  test("on an Updated Quote's Payment freezes its Engagement", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    const proposed = await domain.engagements.proposeUpdatedQuote(artisan.actor, {
      engagementId,
      labour: "2000",
      materials: "500",
    });
    if (!proposed.ok) throw new Error(proposed.refusal.message);
    const checkout = await domain.engagements.acceptUpdatedQuote(client.actor, {
      updatedQuoteId: proposed.value.updatedQuoteId,
      feeAcknowledged: true,
    });
    if (!checkout.ok) throw new Error(checkout.refusal.message);
    const collectionId = new URL(checkout.value.checkoutUrl).pathname.split("/").at(-1)!;
    await given.paid(collectionId);

    await opened(given, collectionId);

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.chargeback).toMatchObject(
      { frozen: true },
    );
    expect(await chargebackRows(engagementId)).toEqual([
      { kind: "chargeback.opened", amount_cents: 52_500 },
    ]);
  });

  test("on the Hire's Payment refunds what the bank did not send back from an Updated Quote's Payment", async () => {
    const { domain, given, payments } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    const proposed = await domain.engagements.proposeUpdatedQuote(artisan.actor, {
      engagementId,
      labour: "2000",
      materials: "500",
    });
    if (!proposed.ok) throw new Error(proposed.refusal.message);
    const checkout = await domain.engagements.acceptUpdatedQuote(client.actor, {
      updatedQuoteId: proposed.value.updatedQuoteId,
      feeAcknowledged: true,
    });
    if (!checkout.ok) throw new Error(checkout.refusal.message);
    const extraId = new URL(checkout.value.checkoutUrl).pathname.split("/").at(-1)!;
    await given.paid(extraId);
    const hireId = (await hiredPayment(engagementId))!;
    await opened(given, hireId);
    // The bank sent back the Hire's Labour; the extra R500 of Labour is the Updated Quote's.
    await closed(given, hireId, "lost", 150_000);

    await decided(domain, admin, {}, "None of the work was done.");

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      chargeback: {
        decision: { releasedCents: 0, chargedBackCents: 150_000, refundedCents: 50_000 },
      },
    });
    expect(payments.calls.filter((call) => call.operation === "refund")).toEqual([
      {
        operation: "refund",
        input: expect.objectContaining({ collectionId: extraId, amountCents: 50_000 }),
      },
    ]);
  });

  test("on a Payment that Hired nobody suspends the Client, and the Admin records the loss", async () => {
    const { domain, given, payments } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    const artisan = await given.matchableArtisan({ name: "Sipho Dlamini" });
    const jobId = await given.openJob(client);
    const quoteId = await given.sentQuote(artisan, jobId, { startOn: "2026-10-05" });
    const collectionId = await given.checkout(client, quoteId);
    const withdrawn = await domain.quotes.withdraw(artisan.actor, { jobId });
    if (!withdrawn.ok) throw new Error(withdrawn.refusal.message);
    await given.paid(collectionId);

    await domain.system.receivePaymentEvent(await payments.openChargeback(collectionId));
    await domain.system.receivePaymentEvent(
      await payments.closeChargeback(collectionId, { outcome: "lost", reversedCents: 210_000 }),
    );

    expect((await domain.accounts.me(client.actor))?.standing.suspended).not.toBeNull();
    const item = await itemOf(domain, admin);
    expect(item?.decisions).toEqual([expect.objectContaining({ key: "decide", fields: [] })]);
    await decided(domain, admin, {}, "Refunded whole already.");
    const { results } = await env.DB.prepare(
      "SELECT kind, amount_cents FROM ledger_entries WHERE payment_id = ? AND kind = 'chargeback.loss'",
    )
      .bind(collectionId)
      .all();
    expect(results).toEqual([{ kind: "chargeback.loss", amount_cents: 210_000 }]);
  });

  test("on a Payment that Hired nobody whose Refund was not sent yet never sends it, and tells the Client", async () => {
    const { domain, given, payments } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    const artisan = await given.matchableArtisan({ name: "Sipho Dlamini" });
    const jobId = await given.openJob(client);
    const quoteId = await given.sentQuote(artisan, jobId, { startOn: "2026-10-05" });
    const collectionId = await given.checkout(client, quoteId);
    const withdrawn = await domain.quotes.withdraw(artisan.actor, { jobId });
    if (!withdrawn.ok) throw new Error(withdrawn.refusal.message);
    // The provider is down as the Payment arrives, so its whole Refund waits.
    const refund = payments.refund;
    payments.refund = () => Promise.reject(new Error("The provider is down"));
    await expect(given.paid(collectionId)).rejects.toThrow("The provider is down");
    payments.refund = refund;
    await opened(given, collectionId);
    await domain.system.runDueClocks();

    expect(refundsAsked(payments)).toEqual([]);

    await closed(given, collectionId, "lost", 210_000);
    await decided(domain, admin, {}, "The bank sent it all back.");
    await domain.system.runDueClocks();

    expect(refundsAsked(payments)).toEqual([]);
    expect((await domain.jobs.view(client.actor, { jobId }))?.notHired).toEqual([
      expect.objectContaining({ refund: "charged-back" }),
    ]);
    expect(await domain.notices.list(client.actor)).toContainEqual(
      expect.objectContaining({
        title: `${formatRands(210_000)} of your Refund is not sent, as your bank sent it back by your Chargeback: Paint the lounge`,
      }),
    );
    const { results } = await env.DB.prepare(
      "SELECT kind, amount_cents FROM ledger_entries WHERE payment_id = ? AND kind IN ('chargeback.loss', 'refund.charged-back')",
    )
      .bind(collectionId)
      .all();
    expect(results).toEqual([{ kind: "refund.charged-back", amount_cents: 210_000 }]);
  });

  test("on a Client already Suspended leaves that Suspension standing, and still tells them", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, engagementId } = await startedJob(given);
    const suspended = await domain.people.suspend(admin.actor, {
      accountId: client.actor.accountId,
      reason: "Asked an Artisan to be paid in cash.",
    });
    if (!suspended.ok) throw new Error(suspended.refusal.message);

    await opened(given, (await hiredPayment(engagementId))!);

    expect((await domain.accounts.me(client.actor))?.standing.suspended).toMatchObject({
      reason: "Asked an Artisan to be paid in cash.",
    });
    expect(await domain.notices.list(client.actor)).toContainEqual(
      expect.objectContaining({
        event: "engagement.charged-back",
        title:
          "Your card Payment was charged back through your bank, so this Job is frozen until the Admin decides the money not yet released: Paint the lounge",
      }),
    );
    expect((await domain.queues.home(admin.actor, { queue: "chargebacks" }))?.items).toHaveLength(
      1,
    );
  });
});

type Party = { actor: Actor };
type Admin = Awaited<ReturnType<Harness["given"]["admin"]>>;

/** The bank opens a Chargeback on the collection, and its event arrives. */
async function opened(given: Harness["given"], collectionId: string) {
  await given.chargedBack(collectionId);
}

/** The bank closes the collection's Chargeback, and its event arrives. */
async function closed(
  given: Harness["given"],
  collectionId: string,
  outcome: ChargebackOutcome,
  reversedCents: number,
) {
  await given.chargebackClosed(collectionId, { outcome, reversedCents });
}

/** The open Chargeback item, as the Admin sees it. */
async function itemOf(domain: Harness["domain"], admin: Admin) {
  const [open] = (await domain.queues.home(admin.actor, { queue: "chargebacks" }))!.items;
  return domain.queues.item(admin.actor, { itemId: open!.id });
}

/** The Admin decides the open Chargeback, releasing these cents of each line, by field. */
async function decided(
  domain: Harness["domain"],
  admin: Admin,
  released: Record<string, string>,
  reason: string,
) {
  const item = await itemOf(domain, admin);
  const fields = Object.fromEntries(
    item!.decisions[0]!.fields.flatMap((field) => [
      [field.key, released[field.key] ?? "0"],
      [`${field.key}.of`, String(field.totalCents)],
    ]),
  );
  const made = await domain.queues.decide(admin.actor, {
    itemId: item!.id,
    decision: "decide",
    reason,
    fields,
  });
  if (!made.ok) throw new Error(made.refusal.message);
}

/** The Engagement's Hire's Payment: its collection's id. */
async function hiredPayment(engagementId: string) {
  const row = await env.DB.prepare("SELECT payment_id FROM engagements WHERE id = ?")
    .bind(engagementId)
    .first<{ payment_id: string }>();
  return row?.payment_id;
}

/** The Refunds asked of the payment adapter, oldest first. */
function refundsAsked(payments: Harness["payments"]) {
  return payments.calls
    .filter((call) => call.operation === "refund")
    .map((call) => call.input as { id: string; amountCents: number });
}

/** The Engagement's Chargeback rows in the ledger, oldest first. */
async function chargebackRows(engagementId: string) {
  return kindRows(engagementId, "chargeback.");
}

/** The Engagement's ledger rows whose kind starts so, oldest first. */
async function kindRows(engagementId: string, kind: string) {
  const { results } = await env.DB.prepare(
    "SELECT kind, amount_cents FROM ledger_entries WHERE engagement_id = ? AND kind LIKE ? ORDER BY recorded_at, rowid",
  )
    .bind(engagementId, `${kind}%`)
    .all<{ kind: string; amount_cents: number }>();
  return results;
}

/** The Engagement's money, as its Client sees it. */
async function money(domain: Harness["domain"], job: { client: Party; jobId: string }) {
  return (await domain.jobs.view(job.client.actor, { jobId: job.jobId }))?.engagement?.money;
}

/** A Client's Painting Job Hired from the default Quote (R1 500 Labour, R500 Materials) by card. */
async function hiredJob(given: Harness["given"]) {
  const client = await given.client();
  const artisan = await given.matchableArtisan({ name: "Sipho Dlamini" });
  const jobId = await given.openJob(client);
  const quoteId = await given.sentQuote(artisan, jobId, { startOn: "2026-10-05" });
  await given.hired(client, quoteId);
  const engagementId = await given.engagementOf(client, jobId);
  return { client, artisan, jobId, engagementId };
}

/** As `hiredJob`, with Work started by the Client, which released the Materials. */
async function startedJob(given: Harness["given"]) {
  const hired = await hiredJob(given);
  await given.workStarted(hired.client, hired.engagementId);
  return hired;
}

/** As `startedJob`, with the work marked complete: Awaiting approval. */
async function awaitingApproval(given: Harness["given"]) {
  const started = await startedJob(given);
  await given.markedComplete(started.artisan, started.engagementId);
  return started;
}

/** The rows of the Job's one Conversation, as the party sees it. */
async function rows(domain: Harness["domain"], party: Party, jobId: string) {
  const [conversation] = (await domain.conversations.forJob(party.actor, { jobId }))!;
  return (await domain.conversations.view(party.actor, {
    conversationId: conversation!.conversationId,
  }))!.items;
}
