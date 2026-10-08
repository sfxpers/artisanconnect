import { describe, expect, test } from "vitest";
import type { Actor } from "@/domain/actor";
import { formatRands } from "@/domain/money";
import { createHarness, type Harness } from "../support/harness";
import { photo } from "../support/verification";

// Disputes (#135): the Client disputes a named part of the Labour at
// Completion; the Artisan disputes the unreleased Labour against a Fix
// request or within a Cancellation's 72 hours. Only the disputed amount is
// held; the parties may still settle it, the Client by releasing and the
// Artisan by refunding, and otherwise the Admin splits it between Release and
// Refund, finally. Afterwards the Engagement is Cancelled again if the
// Dispute was against a Cancellation, otherwise Completed.

describe("a Client's Dispute", () => {
  test("holds the named amount of the Labour: the Engagement is Disputed, the Admin's queue has it, and the Artisan is told", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, jobId, engagementId } = await awaitingApproval(given);
    clock.advance({ hours: 1 });

    expect(
      await domain.engagements.dispute(client.actor, {
        engagementId,
        amount: "600",
        reason: "The second coat is missing on the east wall.",
      }),
    ).toEqual({ ok: true, value: { disputeId: expect.any(String) } });

    const engagement = (await domain.jobs.view(client.actor, { jobId }))?.engagement;
    expect(engagement).toMatchObject({
      state: "disputed",
      canCancel: false,
      dispute: {
        by: "client",
        against: "completion",
        openedAt: clock.now(),
        namedCents: 60_000,
        heldCents: 60_000,
        reason: "The second coat is missing on the east wall.",
        state: "open",
      },
      money: { releasedCents: 50_000, unreleasedCents: 150_000, heldCents: 60_000 },
    });
    expect(engagement?.activity.at(-1)).toEqual({ event: "dispute.opened", at: clock.now() });
    expect(await toldOf(domain, artisan, jobId)).toContainEqual(
      expect.objectContaining({
        event: "engagement.disputed",
        title: `The Client disputed ${formatRands(60_000)} of the Labour. The Admin decides it: Paint the lounge`,
      }),
    );
    expect(await toldOf(domain, client, jobId)).toEqual([]);
    const home = await domain.queues.home(admin.actor, { queue: "disputes" });
    expect(home?.items).toEqual([
      expect.objectContaining({ queue: "disputes", title: "Dispute: Paint the lounge" }),
    ]);
    for (const party of [client, artisan]) {
      expect((await rows(domain, party, jobId)).at(-1)).toEqual({
        kind: "event",
        event: "dispute.opened",
        text: formatRands(60_000),
        at: clock.now(),
      });
    }
  });

  test("releases the rest of the Labour when the Client approves it, and stays Disputed", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await awaitingApproval(given);
    await disputed(domain, client, engagementId, "600");
    clock.advance({ hours: 1 });

    expect(await domain.engagements.approve(client.actor, { engagementId })).toEqual({
      ok: true,
      value: null,
    });

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "disputed",
      completedAt: null,
      dispute: { heldCents: 60_000, state: "open" },
      money: { releasedCents: 140_000, unreleasedCents: 60_000, heldCents: 60_000 },
    });
    expect((await toldOf(domain, artisan, jobId))[0]).toMatchObject({
      event: "engagement.approved",
      title: `The Client approved the work but for the ${formatRands(60_000)} in Dispute, and the rest of the Labour was released: Paint the lounge`,
    });
    expect(await domain.engagements.approve(client.actor, { engagementId })).toMatchObject({
      ok: false,
      refusal: { reason: "not-awaiting" },
    });
  });

  test("releases the rest of the Labour when the seven days end, telling both", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await awaitingApproval(given);
    await disputed(domain, client, engagementId, "600");

    // The reminder fires first: Tells written at one instant sort by id.
    clock.advance({ days: 6 });
    await domain.system.runDueClocks();
    clock.advance({ days: 1 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "disputed",
      money: { releasedCents: 140_000, unreleasedCents: 60_000, heldCents: 60_000 },
    });
    for (const party of [client, artisan]) {
      expect((await toldOf(domain, party, jobId))[0]).toMatchObject({
        event: "engagement.approved",
        title: `Seven days passed, so the Labour not in Dispute was released; the ${formatRands(60_000)} in Dispute stays held: Paint the lounge`,
      });
    }
  });

  test("reminds the Client 24 hours before the rest of the Labour is released", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, engagementId } = await awaitingApproval(given);
    await disputed(domain, client, engagementId, "600");

    clock.advance({ days: 6 });
    await domain.system.runDueClocks();

    expect(
      (await domain.notices.list(client.actor)).filter(
        (notice) => notice.event === "engagement.approval-reminder",
      ),
    ).toEqual([
      expect.objectContaining({
        title:
          "The Labour not in Dispute is released to the Artisan in 24 hours, at 12 Oct 2026, 08:00: Paint the lounge",
      }),
    ]);
  });

  test("of all the Labour leaves nothing to release at Approval", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, jobId, engagementId } = await awaitingApproval(given);
    await disputed(domain, client, engagementId, "1500");

    clock.advance({ days: 7 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "disputed",
      money: { releasedCents: 50_000, unreleasedCents: 150_000, heldCents: 150_000 },
    });
  });
});

describe("an Artisan's Dispute against a Fix request", () => {
  test("holds all the Labour not yet released, ends an Updated Quote waiting, and tells the Client", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await fixRequested(given, domain);
    const proposed = await domain.engagements.proposeUpdatedQuote(artisan.actor, {
      engagementId,
      labour: "1800",
      materials: "500",
    });
    if (!proposed.ok) throw new Error(proposed.refusal.message);
    clock.advance({ hours: 1 });

    expect(
      await domain.engagements.dispute(artisan.actor, {
        engagementId,
        amount: "1",
        reason: "The wall was finished as quoted; the new crack is in the plaster.",
      }),
    ).toMatchObject({ ok: true });

    const engagement = (await domain.jobs.view(client.actor, { jobId }))?.engagement;
    expect(engagement).toMatchObject({
      state: "disputed",
      updatedQuote: null,
      dispute: { by: "artisan", against: "fix-request", namedCents: 150_000, heldCents: 150_000 },
      money: { unreleasedCents: 150_000, heldCents: 150_000 },
    });
    expect((await toldOf(domain, client, jobId))[0]).toMatchObject({
      event: "engagement.disputed",
      title: `The Artisan disputed your Fix request, so the Labour not yet released, ${formatRands(150_000)}, is held. The Admin decides it: Paint the lounge`,
    });
    expect(
      await domain.engagements.complete(artisan.actor, { engagementId, note: "Done.", photos: [] }),
    ).toMatchObject({
      ok: false,
      refusal: { reason: "not-open" },
    });
  });

  test("decided, the Engagement is Completed", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, jobId, engagementId } = await fixRequested(given, domain);
    await disputed(domain, artisan, engagementId);

    await decided(domain, admin, "150000");

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "completed",
      money: { releasedCents: 200_000, refundedCents: 0, unreleasedCents: 0 },
      refunds: [],
    });
    expect(
      await domain.engagements.artisanRecord(admin.actor, { artisanId: artisan.actor.accountId }),
    ).toMatchObject({ disputesDecidedAgainst: 0, disputes: [] });
  });

  test("settled by the Artisan refunding it all, the Engagement is Completed", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await fixRequested(given, domain);
    await disputed(domain, artisan, engagementId);

    await refunded(domain, artisan, engagementId, "1500");

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "completed",
      dispute: { state: "settled" },
      money: { releasedCents: 50_000, refundedCents: 150_000, unreleasedCents: 0 },
    });
  });
});

describe("an Artisan's Dispute within a Cancellation's 72 hours", () => {
  test("stops the refund of the Labour and its reminder, and tells the Client", async () => {
    const { domain, given, clock, payments } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    await cancelled(domain, client, engagementId);
    clock.advance({ hours: 47 });

    await disputed(
      domain,
      artisan,
      engagementId,
      undefined,
      "I painted both walls before they cancelled.",
    );

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "disputed",
      cancellation: null,
      dispute: { by: "artisan", against: "cancellation", heldCents: 150_000 },
    });
    expect((await toldOf(domain, client, jobId))[0]).toMatchObject({
      event: "engagement.disputed",
      title: `The Artisan disputed the Cancellation for work already done, so the Labour not yet released, ${formatRands(150_000)}, is held, not refunded. The Admin decides it: Paint the lounge`,
    });

    clock.advance({ hours: 26 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "disputed",
      money: { refundedCents: 0, unreleasedCents: 150_000, heldCents: 150_000 },
    });
    expect(payments.calls.filter((call) => call.operation === "refund")).toEqual([]);
    expect(
      (await domain.notices.list(artisan.actor)).filter(
        (notice) => notice.event === "engagement.cancellation-reminder",
      ),
    ).toEqual([]);
  });

  test("decided, the Engagement is Cancelled again, its Cancellation as it was", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    await cancelled(domain, client, engagementId, "Never came back.");
    const cancelledAt = clock.now();
    clock.advance({ hours: 1 });
    await disputed(domain, artisan, engagementId);

    await decided(domain, admin, "100000");
    clock.advance({ hours: 72 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "cancelled",
      cancellation: { by: "client", cancelledAt, afterWorkStarted: true, labourRefund: null },
      dispute: { state: "decided", decision: { releasedCents: 100_000, refundedCents: 50_000 } },
      money: { releasedCents: 150_000, refundedCents: 50_000, unreleasedCents: 0 },
    });
    expect(
      await domain.engagements.artisanRecord(admin.actor, { artisanId: artisan.actor.accountId }),
    ).toMatchObject({
      cancellations: [{ by: "client", reason: "Never came back.", afterWorkStarted: true }],
      disputesDecidedAgainst: 1,
    });
  });

  test("after a Completion, decided, the Engagement is Cancelled again, and the seven days release nothing meanwhile", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, jobId, engagementId } = await awaitingApproval(given);
    await cancelled(domain, client, engagementId);
    await disputed(domain, artisan, engagementId);

    clock.advance({ days: 7 });
    await domain.system.runDueClocks();
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "disputed",
      money: { releasedCents: 50_000, heldCents: 150_000 },
    });

    await decided(domain, admin, "150000");

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "cancelled",
      completedAt: null,
      cancellation: { by: "client", afterWorkStarted: true, labourRefund: null },
      money: { releasedCents: 200_000, unreleasedCents: 0 },
    });
  });

  test("not once the 72 hours end, nor after a Cancellation before Work started", async () => {
    const { domain, given, clock } = await createHarness();
    const started = await startedJob(given);
    const hired = await hiredJob(given);
    await cancelled(domain, started.client, started.engagementId);
    clock.advance({ hours: 72 });

    expect(
      await domain.engagements.dispute(started.artisan.actor, {
        engagementId: started.engagementId,
        reason: "Too late.",
      }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "not-disputable",
        message: "The 72 hours after the Cancellation have ended, so it can no longer be disputed.",
      },
    });

    await cancelled(domain, hired.client, hired.engagementId);
    expect(
      await domain.engagements.dispute(hired.artisan.actor, {
        engagementId: hired.engagementId,
        reason: "Nothing started.",
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-disputable" } });
  });
});

describe("settling a Dispute", () => {
  test("the Client may release part of what is held, less the Artisan Fee, and the Artisan is told", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await awaitingApproval(given);
    await disputed(domain, client, engagementId, "600");
    clock.advance({ hours: 1 });

    expect(
      await domain.engagements.releaseHeld(client.actor, { engagementId, amount: "200" }),
    ).toEqual({ ok: true, value: null });

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "disputed",
      dispute: { namedCents: 60_000, heldCents: 40_000, state: "open" },
      money: { releasedCents: 70_000, unreleasedCents: 130_000, heldCents: 40_000 },
    });
    expect((await toldOf(domain, artisan, jobId))[0]).toMatchObject({
      event: "engagement.dispute-released",
      title: `The Client released ${formatRands(20_000)} of the Labour in Dispute: Paint the lounge`,
    });
    expect((await rows(domain, artisan, jobId)).at(-1)).toEqual({
      kind: "event",
      event: "dispute.released",
      text: formatRands(20_000),
      at: clock.now(),
    });
    expect(
      await domain.engagements.releaseHeld(client.actor, { engagementId, amount: "400.01" }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "more-than-held",
        message: `You can release at most ${formatRands(40_000)}, what the Dispute holds.`,
      },
    });
    expect(
      await domain.engagements.releaseHeld(artisan.actor, { engagementId, amount: "1" }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-found" } });
  });

  test("released whole by the Client, it is settled: Completed, the rest of the Labour released, both told, and the Admin's item closed", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, jobId, engagementId } = await awaitingApproval(given);
    await disputed(domain, client, engagementId, "600");
    clock.advance({ hours: 1 });

    await released(domain, client, engagementId, "600");

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "completed",
      completedAt: clock.now(),
      dispute: { heldCents: 0, state: "settled", closedAt: clock.now(), decision: null },
      money: { releasedCents: 200_000, unreleasedCents: 0, heldCents: 0 },
    });
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.activity.at(-1)).toEqual({
      event: "dispute.settled",
      at: clock.now(),
    });
    for (const party of [client, artisan]) {
      expect(await toldOf(domain, party, jobId)).toContainEqual(
        expect.objectContaining({
          event: "engagement.dispute-settled",
          title:
            "The Dispute is settled, as nothing is held any more, and the work is Completed: Paint the lounge",
        }),
      );
    }
    expect((await domain.queues.home(admin.actor, { queue: "disputes" }))?.items).toEqual([]);
    expect(
      await domain.engagements.releaseHeld(client.actor, { engagementId, amount: "1" }),
    ).toMatchObject({ ok: false, refusal: { reason: "nothing-held" } });
  });

  test("the Artisan's Refund of Labour takes from what is held first; refunded whole, it is settled", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const { client, artisan, jobId, engagementId, collectionId } = await awaitingApproval(given);
    await disputed(domain, client, engagementId, "600");
    clock.advance({ hours: 1 });

    await refunded(domain, artisan, engagementId, "250");
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "disputed",
      dispute: { heldCents: 35_000, state: "open" },
      money: { refundedCents: 25_000, unreleasedCents: 125_000, heldCents: 35_000 },
    });

    clock.advance({ hours: 1 });
    await refunded(domain, artisan, engagementId, "350");

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "completed",
      dispute: { heldCents: 0, state: "settled" },
      money: { releasedCents: 140_000, refundedCents: 60_000, unreleasedCents: 0, heldCents: 0 },
    });
    expect(
      payments.calls.filter((call) => call.operation === "refund").map((call) => call.input),
    ).toEqual([expect.objectContaining({ collectionId, amountCents: 25_000 })]);
  });

  test("a Refund of more Labour than is held settles it and refunds the rest from the Labour not held", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await awaitingApproval(given);
    await disputed(domain, client, engagementId, "600");

    await refunded(domain, artisan, engagementId, "1000");

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "completed",
      dispute: { state: "settled" },
      money: { releasedCents: 100_000, refundedCents: 100_000, unreleasedCents: 0, heldCents: 0 },
    });
  });
});

describe("the Admin's Dispute item", () => {
  test("offers one decision, a split of what is held, with the Job, the Completion, the parties, the money, and the Artisan record", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, engagementId } = await awaitingApproval(given);
    await disputed(domain, client, engagementId, "600");

    const item = await disputeItemOf(domain, admin);

    expect(item).toMatchObject({
      queue: "disputes",
      title: "Dispute: Paint the lounge",
      decided: null,
      decisions: [
        {
          key: "split",
          told: "Both parties, with the reason",
          reason: "required",
          fields: [
            {
              key: "releasedCents",
              type: "split",
              value: "60000",
              totalCents: 60_000,
              required: true,
            },
          ],
        },
      ],
    });
    expect(item?.tabs.map((tab) => tab.key)).toEqual([
      "dispute",
      "completion",
      "conversation",
      "job",
    ]);
    expect(item?.tabs[2]).toEqual({
      key: "conversation",
      label: "The Conversation",
      read: "conversation",
    });
    expect(item?.tabs[1]).toMatchObject({
      blocks: expect.arrayContaining([
        { kind: "text", text: "Both walls have two coats, and the room is cleaned." },
      ]),
    });
    expect(item?.sidebar.map((section) => section.title)).toEqual([
      "Money",
      "Client",
      "Artisan",
      "Artisan record",
    ]);
    expect(item?.sidebar[0]?.blocks[0]).toMatchObject({
      facts: expect.arrayContaining([
        { label: "Held in Dispute", value: formatRands(60_000) },
        { label: "Labour not yet released", value: formatRands(150_000) },
      ]),
    });
  });

  test("shows the Completion's files to the Admin, and the Conversation on a logged click", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, jobId, engagementId } = await awaitingApproval(given);
    await said(domain, client, jobId, "The east wall still shows the old colour.");
    await disputed(domain, client, engagementId, "600");
    const item = await disputeItemOf(domain, admin);
    const files = item!.tabs[1]!;
    const href = "blocks" in files ? files.blocks.find((block) => block.kind === "files") : null;
    const [completionId, fileId] = (href as { files: { href: string }[] }).files[0]!.href.split(
      "/",
    ).slice(-2);

    expect(
      await domain.engagements.completionFile(admin.actor, {
        completionId: completionId!,
        fileId: fileId!,
      }),
    ).toMatchObject({ contentType: "image/webp" });

    const opened = await domain.queues.open(admin.actor, {
      itemId: item!.id,
      read: "conversation",
    });

    expect(opened).toMatchObject({
      ok: true,
      value: expect.arrayContaining([
        {
          kind: "text",
          text: expect.stringMatching(
            /· Thandi Mokoena \(Client\): The east wall still shows the old colour\.$/,
          ),
        },
        { kind: "text", text: expect.stringMatching(/· Dispute opened: R\s600,00$/) },
      ]),
    });
    expect((await domain.admins.auditLog(admin.actor))!.rows).toContainEqual(
      expect.objectContaining({
        action: "read",
        summary: "Opened the Conversation: Dispute: Paint the lounge",
        subjectId: item!.id,
      }),
    );
  });

  test("splits what is held: Released less the Artisan Fee, Refunded to the Client, Completed with the rest released, and both told with the reason", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, jobId, engagementId, collectionId } = await awaitingApproval(given);
    await disputed(domain, client, engagementId, "600");
    const item = await disputeItemOf(domain, admin);
    clock.advance({ days: 2 });

    expect(
      await domain.queues.decide(admin.actor, {
        itemId: item!.id,
        decision: "split",
        reason: "The east wall needs one more coat; two thirds is fair.",
        fields: { releasedCents: "40000", "releasedCents.of": "60000" },
      }),
    ).toEqual({ ok: true, value: { itemId: item!.id, decision: "split" } });

    const engagement = (await domain.jobs.view(client.actor, { jobId }))?.engagement;
    expect(engagement).toMatchObject({
      state: "completed",
      completedAt: clock.now(),
      dispute: {
        state: "decided",
        heldCents: 0,
        closedAt: clock.now(),
        decision: {
          releasedCents: 40_000,
          refundedCents: 20_000,
          reason: "The east wall needs one more coat; two thirds is fair.",
        },
      },
      money: { releasedCents: 180_000, refundedCents: 20_000, unreleasedCents: 0, heldCents: 0 },
      refunds: [{ amountCents: 20_000, labourCents: 20_000, state: "on-its-way" }],
    });
    expect(engagement?.activity.slice(-2)).toEqual([
      { event: "dispute.decided", at: clock.now() },
      { event: "refunded", at: clock.now() },
    ]);
    expect(
      payments.calls.filter((call) => call.operation === "refund").map((call) => call.input),
    ).toEqual([
      { id: expect.any(String), collectionId, amountCents: 20_000, reason: "Dispute decision" },
    ]);
    expect((await toldOf(domain, client, jobId))[0]).toMatchObject({
      event: "engagement.dispute-decided",
      title: `The Admin decided the Dispute: ${formatRands(20_000)} is refunded to you and ${formatRands(40_000)} released to the Artisan: Paint the lounge`,
    });
    expect((await toldOf(domain, artisan, jobId))[0]).toMatchObject({
      event: "engagement.dispute-decided",
      title: `The Admin decided the Dispute: ${formatRands(40_000)} is released to you and ${formatRands(20_000)} refunded to the Client: Paint the lounge`,
    });
    expect((await rows(domain, client, jobId)).slice(-2)).toEqual([
      { kind: "event", event: "refund", text: formatRands(20_000), at: clock.now() },
      { kind: "event", event: "dispute.decided", at: clock.now() },
    ]);
    // What the Artisan is owed: R1 800 released, less the 10% Artisan Fee.
    expect(await domain.payouts.mine(artisan.actor)).toMatchObject({ unpaidCents: 162_000 });
  });

  test("is final, needs a reason, and splits no more than is held", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, engagementId } = await awaitingApproval(given);
    await disputed(domain, client, engagementId, "600");
    const item = await disputeItemOf(domain, admin);
    const decide = (fields: Record<string, string>, reason = "Fair.") =>
      domain.queues.decide(admin.actor, {
        itemId: item!.id,
        decision: "split",
        reason,
        fields: { "releasedCents.of": "60000", ...fields },
      });

    expect(await decide({ releasedCents: "60000" }, " ")).toMatchObject({
      ok: false,
      refusal: { reason: "reason-required" },
    });
    for (const releasedCents of ["60001", "-1", "1.5", ""]) {
      expect(await decide({ releasedCents })).toMatchObject({ ok: false });
    }
    expect(await decide({ releasedCents: "60000" })).toMatchObject({ ok: true });
    expect(await decide({ releasedCents: "0" })).toMatchObject({
      ok: false,
      refusal: { reason: "already-decided" },
    });
    expect(
      await domain.queues.decide(admin.actor, {
        itemId: item!.id,
        decision: "settled",
        fields: {},
      }),
    ).toMatchObject({ ok: false });
  });

  test("refuses a split of a held amount the parties changed since the Admin read it", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, jobId, engagementId } = await awaitingApproval(given);
    await disputed(domain, client, engagementId, "600");
    const item = await disputeItemOf(domain, admin);

    await released(domain, client, engagementId, "200");

    expect(
      await domain.queues.decide(admin.actor, {
        itemId: item!.id,
        decision: "split",
        reason: "Fair.",
        fields: { releasedCents: "40000", "releasedCents.of": "60000" },
      }),
    ).toEqual({
      ok: false,
      refusal: { reason: "changed", message: "What is being split changed meanwhile. Look again." },
    });
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "disputed",
      dispute: { heldCents: 40_000, state: "open" },
    });
  });

  test("offers nothing once the parties settled it", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, engagementId } = await awaitingApproval(given);
    await disputed(domain, client, engagementId, "600");
    const item = await disputeItemOf(domain, admin);

    await released(domain, client, engagementId, "600");

    expect(await domain.queues.item(admin.actor, { itemId: item!.id })).toMatchObject({
      decided: { decision: "settled", label: "Settled by the parties", by: null },
      decisions: [],
    });
  });

  test("a Refund it decides goes on the Artisan record", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, engagementId } = await awaitingApproval(given);
    await disputed(domain, client, engagementId, "600");
    await decided(domain, admin, "40000");

    expect(
      await domain.engagements.artisanRecord(admin.actor, { artisanId: artisan.actor.accountId }),
    ).toMatchObject({
      disputesDecidedAgainst: 1,
      disputes: [
        {
          jobTitle: "Paint the lounge",
          heldCents: 60_000,
          refundedCents: 20_000,
        },
      ],
    });
  });
});

describe("on a clock that ticks between reads, as a real one does", () => {
  test("a Dispute opens, is settled, and is decided", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const first = await awaitingApproval(given);
    const second = await fixRequested(given, domain);
    const frozen = clock.now;
    clock.now = () => {
      clock.advance({ minutes: 0.001 });
      return frozen();
    };

    await disputed(domain, first.client, first.engagementId, "600");
    await approved(domain, first.client, first.engagementId);
    await released(domain, first.client, first.engagementId, "600");
    await disputed(domain, second.artisan, second.engagementId);
    await decided(domain, admin, "75000");

    for (const { client, jobId } of [first, second]) {
      expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
        state: "completed",
        dispute: { state: expect.stringMatching(/settled|decided/), heldCents: 0 },
        money: { unreleasedCents: 0, heldCents: 0 },
      });
    }
  });
});

describe("what each party may do on the Job page", () => {
  test("the Client may dispute up to the Labour not yet released while a Completion awaits them, and release what is held", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await awaitingApproval(given);
    const asClient = async () => (await domain.jobs.view(client.actor, { jobId }))?.engagement;
    const asArtisan = async () =>
      (await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement;

    expect(await asClient()).toMatchObject({
      disputable: { labourCents: 150_000 },
      releasable: null,
    });
    expect(await asArtisan()).toMatchObject({ disputable: null });

    await disputed(domain, client, engagementId, "600");

    expect(await asClient()).toMatchObject({
      disputable: null,
      releasable: { heldCents: 60_000 },
      // The seven days still run for the Labour not held.
      approval: { dueAt: expect.any(Date) },
    });
    expect(await asArtisan()).toMatchObject({
      disputable: null,
      refundable: { labourCents: 150_000 },
    });
  });

  test("the Artisan may dispute all the Labour not yet released against a Fix request, or within a Cancellation's 72 hours", async () => {
    const { domain, given, clock } = await createHarness();
    const fixed = await fixRequested(given, domain);
    const started = await startedJob(given);
    await cancelled(domain, started.client, started.engagementId);
    const refundAt = new Date(clock.now().getTime() + 72 * 60 * 60 * 1000);

    expect(
      (await domain.jobs.viewAsArtisan(fixed.artisan.actor, { jobId: fixed.jobId }))?.engagement,
    ).toMatchObject({ disputable: { labourCents: 150_000, until: null } });
    expect(
      (await domain.jobs.viewAsArtisan(started.artisan.actor, { jobId: started.jobId }))
        ?.engagement,
    ).toMatchObject({ disputable: { labourCents: 150_000, until: refundAt } });
    expect(
      (await domain.jobs.view(fixed.client.actor, { jobId: fixed.jobId }))?.engagement,
    ).toMatchObject({ disputable: null });
  });
});

describe("opening a Dispute", () => {
  test("the Client may only at Awaiting approval, for an amount of the Labour not yet released", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await hiredJob(given);
    const reason = "Not done.";

    expect(
      await domain.engagements.dispute(client.actor, { engagementId, amount: "100", reason }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "not-disputable",
        message: "You can dispute the Labour only while a Completion awaits your approval.",
      },
    });
    await given.workStarted(client, engagementId);
    await given.markedComplete(artisan, engagementId);
    for (const [amount, message] of [
      [undefined, "Give the amount in rands, like 1500.00."],
      ["0", "Name an amount above zero."],
      ["1500.01", `You can dispute at most ${formatRands(150_000)}, the Labour not yet released.`],
    ] as const) {
      expect(
        await domain.engagements.dispute(client.actor, { engagementId, amount, reason }),
      ).toMatchObject({ ok: false, refusal: { message } });
    }
    expect(
      await domain.engagements.dispute(client.actor, { engagementId, amount: "100", reason: " " }),
    ).toEqual({ ok: false, refusal: { reason: "invalid", message: "Write why you dispute it." } });
  });

  test("the Artisan may not at Awaiting approval, and nobody else may at all", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await awaitingApproval(given);
    const stranger = await given.client();
    const reason = "Not done.";

    expect(await domain.engagements.dispute(artisan.actor, { engagementId, reason })).toEqual({
      ok: false,
      refusal: {
        reason: "not-disputable",
        message:
          "You can open a Dispute against a Fix request, or within 72 hours of a Cancellation after Work started.",
      },
    });
    for (const party of [stranger, { actor: { kind: "visitor" } as Actor }]) {
      expect(
        await domain.engagements.dispute(party.actor, { engagementId, amount: "100", reason }),
      ).toMatchObject({ ok: false, refusal: { reason: "not-found" } });
    }
    expect(
      await domain.engagements.dispute(client.actor, { engagementId: "nope", amount: "1", reason }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-found" } });
  });

  test("once: a Disputed Engagement may not be disputed again, answered, or cancelled", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await awaitingApproval(given);
    await disputed(domain, client, engagementId, "600");
    const disputedAlready = {
      ok: false,
      refusal: {
        reason: "already-disputed",
        message: "This Engagement is Disputed: the Admin decides it.",
      },
    };

    expect(
      await domain.engagements.dispute(client.actor, {
        engagementId,
        amount: "1",
        reason: "Again.",
      }),
    ).toEqual(disputedAlready);
    expect(
      await domain.engagements.dispute(artisan.actor, { engagementId, reason: "Again." }),
    ).toEqual(disputedAlready);
    expect(
      await domain.engagements.requestFix(client.actor, { engagementId, note: "Fix it." }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "not-awaiting",
        message: "This Engagement is Disputed: the Admin decides it.",
      },
    });
    for (const party of [client, artisan]) {
      expect(await domain.engagements.cancel(party.actor, { engagementId })).toEqual({
        ok: false,
        refusal: {
          reason: "not-cancellable",
          message: "This Engagement is Disputed: the Admin decides it.",
        },
      });
    }
  });

  test("is refused when the Labour not yet released changed while it was being read", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { client, artisan, jobId, engagementId } = await awaitingApproval(given);
    const read = contentReader.read.bind(contentReader);
    contentReader.read = async (content) => {
      contentReader.read = read;
      // The Artisan refunds while the Client's reason is being read.
      await refunded(domain, artisan, engagementId, "1000");
      return read(content);
    };

    expect(
      await domain.engagements.dispute(client.actor, {
        engagementId,
        amount: "600",
        reason: "Not done.",
      }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "changed",
        message: "The Labour not yet released changed meanwhile. Look again.",
      },
    });
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "awaiting-approval",
      dispute: null,
      money: { unreleasedCents: 50_000, heldCents: 0 },
    });
  });

  test("its reason and photos are read: a sure hit is refused with the reason, and nothing is opened", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { client, jobId, engagementId } = await awaitingApproval(given);
    contentReader.force({ kind: "sure-hit", reason: "It asks to be paid in cash." });

    expect(
      await domain.engagements.dispute(client.actor, {
        engagementId,
        amount: "600",
        reason: "Give me R600 back in cash.",
        photos: [await photo()],
      }),
    ).toEqual({
      ok: false,
      refusal: { reason: "content", message: "It asks to be paid in cash." },
    });
    expect(contentReader.reads.at(-1)).toMatchObject({
      text: expect.stringContaining("Give me R600 back in cash."),
      context: { kind: "engagement-conversation", engagementId },
    });
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "awaiting-approval",
      dispute: null,
    });
  });

  test("an unsure reason leaves the Dispute standing, its reason and photos for the Admin only", async () => {
    const { domain, given, contentReader } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, jobId, engagementId } = await awaitingApproval(given);
    contentReader.force({ kind: "unsure", reason: "It may be a threat." });

    const disputeId = await domain.engagements.dispute(client.actor, {
      engagementId,
      amount: "600",
      reason: "You will regret this.",
      photos: [await photo()],
    });

    expect(disputeId).toMatchObject({ ok: true });
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.dispute).toMatchObject({
      reason: "You will regret this.",
      reasonHeld: true,
      photos: [expect.objectContaining({ href: expect.any(String) })],
    });
    const asArtisan = (await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement;
    expect(asArtisan).toMatchObject({
      state: "disputed",
      dispute: { heldCents: 60_000, reason: null, reasonHeld: false, photos: [] },
    });
    const [item] = (await domain.queues.home(admin.actor, { queue: "disputes" }))!.items;
    const tab = (await domain.queues.item(admin.actor, { itemId: item!.id }))?.tabs[0];
    expect(tab).toMatchObject({
      key: "dispute",
      blocks: expect.arrayContaining([
        { kind: "text", text: "You will regret this." },
        {
          kind: "text",
          text: "The Content check was unsure of it, so the other party does not see it: It may be a threat.",
        },
      ]),
    });
  });

  test("its photos are served to its opener, the other party once checked, and the Admin", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, jobId, engagementId } = await awaitingApproval(given);
    const stranger = await given.client();
    const disputeId = (await domain.engagements.dispute(client.actor, {
      engagementId,
      amount: "600",
      reason: "See the east wall.",
      photos: [await photo()],
    })) as { ok: true; value: { disputeId: string } };

    const [shown] = (await domain.jobs.view(client.actor, { jobId }))!.engagement!.dispute!.photos;
    const fileId = shown!.href.split("/").at(-1)!;
    const file = { disputeId: disputeId.value.disputeId, fileId };
    for (const party of [client, artisan, admin]) {
      expect(await domain.engagements.disputeFile(party.actor, file)).toMatchObject({
        contentType: "image/webp",
      });
    }
    expect(
      await domain.engagements.disputeFile(artisan.actor, { ...file, thumbnail: true }),
    ).toMatchObject({ contentType: "image/webp" });
    expect(await domain.engagements.disputeFile(stranger.actor, file)).toBeNull();
  });
});

type Party = { actor: Actor };
type Admin = Awaited<ReturnType<Harness["given"]["admin"]>>;

/** The open Dispute item, as the Admin sees it. */
async function disputeItemOf(domain: Harness["domain"], admin: Admin) {
  const [open] = (await domain.queues.home(admin.actor, { queue: "disputes" }))!.items;
  return domain.queues.item(admin.actor, { itemId: open!.id });
}

/** The Admin splits the open Dispute, releasing this many cents of it. */
async function decided(domain: Harness["domain"], admin: Admin, releasedCents: string) {
  const item = await disputeItemOf(domain, admin);
  const made = await domain.queues.decide(admin.actor, {
    itemId: item!.id,
    decision: "split",
    reason: "Fair.",
    fields: {
      releasedCents,
      "releasedCents.of": String(item!.decisions[0]!.fields[0]!.totalCents),
    },
  });
  if (!made.ok) throw new Error(made.refusal.message);
}

/** The party says something in the Job's one Conversation. */
async function said(domain: Harness["domain"], party: Party, jobId: string, text: string) {
  const [conversation] = (await domain.conversations.forJob(party.actor, { jobId }))!;
  const sent = await domain.conversations.send(party.actor, {
    conversationId: conversation!.conversationId,
    text,
  });
  if (!sent.ok) throw new Error(sent.refusal.message);
}

async function approved(domain: Harness["domain"], client: Party, engagementId: string) {
  const made = await domain.engagements.approve(client.actor, { engagementId });
  if (!made.ok) throw new Error(made.refusal.message);
}

/** The Client releases an amount, in rands, of what their Dispute holds. */
async function released(
  domain: Harness["domain"],
  client: Party,
  engagementId: string,
  amount: string,
) {
  const made = await domain.engagements.releaseHeld(client.actor, { engagementId, amount });
  if (!made.ok) throw new Error(made.refusal.message);
}

/** The Artisan refunds an amount of the Labour, in rands. */
async function refunded(
  domain: Harness["domain"],
  artisan: Party,
  engagementId: string,
  labour: string,
) {
  const made = await domain.engagements.refund(artisan.actor, { engagementId, labour });
  if (!made.ok) throw new Error(made.refusal.message);
}

/** As `hiredJob`, with Work started by the Client, which released the Materials. */
async function startedJob(given: Harness["given"]) {
  const hired = await hiredJob(given);
  await given.workStarted(hired.client, hired.engagementId);
  return hired;
}

/** As `awaitingApproval`, with the Client's Fix request. */
async function fixRequested(given: Harness["given"], domain: Harness["domain"]) {
  const job = await awaitingApproval(given);
  const asked = await domain.engagements.requestFix(job.client.actor, {
    engagementId: job.engagementId,
    note: "The east wall needs another coat.",
  });
  if (!asked.ok) throw new Error(asked.refusal.message);
  return job;
}

async function cancelled(
  domain: Harness["domain"],
  party: Party,
  engagementId: string,
  reason?: string,
) {
  const made = await domain.engagements.cancel(party.actor, { engagementId, reason });
  if (!made.ok) throw new Error(made.refusal.message);
}

/** A Client's Painting Job Hired from the default Quote, starting today. */
async function hiredJob(given: Harness["given"]) {
  const client = await given.client();
  const artisan = await given.matchableArtisan({ name: "Sipho Dlamini" });
  const jobId = await given.openJob(client);
  const quoteId = await given.sentQuote(artisan, jobId, { startOn: "2026-10-05" });
  const collectionId = await given.hired(client, quoteId);
  const engagementId = await given.engagementOf(client, jobId);
  return { client, artisan, jobId, engagementId, collectionId };
}

/** The party opens a Dispute: the Client's for the amount given, in rands. */
async function disputed(
  domain: Harness["domain"],
  party: Party,
  engagementId: string,
  amount?: string,
  reason = "The second coat is missing on the east wall.",
) {
  const opened = await domain.engagements.dispute(party.actor, { engagementId, amount, reason });
  if (!opened.ok) throw new Error(opened.refusal.message);
  return opened.value.disputeId;
}

/**
 * A Client's Painting Job Hired from the default Quote (R1 500 Labour, R500
 * Materials) starting today, with Work started, which released the
 * Materials, and the work marked complete: Awaiting approval.
 */
async function awaitingApproval(given: Harness["given"]) {
  const hired = await hiredJob(given);
  await given.workStarted(hired.client, hired.engagementId);
  await given.markedComplete(hired.artisan, hired.engagementId);
  return hired;
}

/** The rows of the Job's one Conversation, as the party sees it. */
async function rows(domain: Harness["domain"], party: Party, jobId: string) {
  const [conversation] = (await domain.conversations.forJob(party.actor, { jobId }))!;
  return (await domain.conversations.view(party.actor, {
    conversationId: conversation!.conversationId,
  }))!.items;
}

/**
 * What the Account was told of the Job since the work was marked complete,
 * oldest first, but of its Reviews (#138), which their own tests cover.
 */
async function toldOf(domain: Harness["domain"], account: Party, jobId: string) {
  const notices = await domain.notices.list(account.actor);
  return notices.filter(
    (notice) =>
      notice.link === `/jobs/${jobId}` &&
      !notice.event.startsWith("review.") &&
      ![
        "job.matched",
        "job.invited",
        "quote.sent",
        "engagement.hired",
        "engagement.work-started",
        "engagement.completion",
      ].includes(notice.event),
  );
}
