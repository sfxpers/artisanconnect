import { describe, expect, test } from "vitest";
import { visitor } from "@/domain/actor";
import { createProbeHarness } from "../support/probe";

// The Admin works from one home stream of eight queues, and decides each item
// on its page. Real kinds (Disputes, Held Quotes, …) come with their tickets;
// these tests drive the probe's kinds through the same seam.

const EMPTY_COUNTS = {
  verification: 0,
  "pre-checks": 0,
  signals: 0,
  reports: 0,
  disputes: 0,
  chargebacks: 0,
  support: 0,
  "data-requests": 0,
};

describe("the Admin home", () => {
  test("is one stream of every queue's open items, oldest first, with counts", async () => {
    const { domain, given, clock } = await createProbeHarness();
    const { actor } = await given.admin();
    const reporter = await given.client();
    const reported = await given.artisan();
    const first = await domain.probe.report(reporter.actor, {
      accountId: reported.actor.accountId,
    });
    clock.advance({ minutes: 1 });
    const second = await domain.probe.dispute(reporter.actor, { title: "R1,000 in Dispute" });
    clock.advance({ minutes: 1 });
    const third = await domain.probe.report(reporter.actor, {
      accountId: reported.actor.accountId,
    });

    const home = await domain.queues.home(actor);

    expect(home).toEqual({
      counts: { ...EMPTY_COUNTS, reports: 2, disputes: 1 },
      items: [
        {
          id: first.value.itemId,
          queue: "reports",
          title: "A probe Report",
          raisedAt: expect.any(Date),
        },
        {
          id: second.value.itemId,
          queue: "disputes",
          title: "R1,000 in Dispute",
          raisedAt: expect.any(Date),
        },
        {
          id: third.value.itemId,
          queue: "reports",
          title: "A probe Report",
          raisedAt: expect.any(Date),
        },
      ],
    });
  });

  test("narrows to one queue, keeping every queue's count", async () => {
    const { domain, given, clock } = await createProbeHarness();
    const { actor } = await given.admin();
    const reporter = await given.client();
    const reported = await given.artisan();
    await domain.probe.report(reporter.actor, { accountId: reported.actor.accountId });
    clock.advance({ minutes: 1 });
    const dispute = await domain.probe.dispute(reporter.actor, { title: "R1,000 in Dispute" });

    expect(await domain.queues.home(actor, { queue: "disputes" })).toEqual({
      counts: { ...EMPTY_COUNTS, reports: 1, disputes: 1 },
      items: [
        {
          id: dispute.value.itemId,
          queue: "disputes",
          title: "R1,000 in Dispute",
          raisedAt: expect.any(Date),
        },
      ],
    });
  });

  test("lists every queue, empty ones too", async () => {
    const { domain, given } = await createProbeHarness();
    const { actor } = await given.admin();

    expect(await domain.queues.home(actor)).toEqual({ counts: EMPTY_COUNTS, items: [] });
  });

  test("is shown to no one but an Admin", async () => {
    const { domain, given } = await createProbeHarness();
    const client = await given.client();

    expect(await domain.queues.home(client.actor)).toBeNull();
    expect(await domain.queues.home(visitor)).toBeNull();
  });
});

describe("a queue item page", () => {
  test("offers only the allowed decisions, each saying who is told", async () => {
    const { domain, given } = await createProbeHarness();
    const { actor } = await given.admin();
    const reporter = await given.client();
    const reported = await given.artisan();
    const raised = await domain.probe.report(reporter.actor, {
      accountId: reported.actor.accountId,
    });

    const item = await domain.queues.item(actor, { itemId: raised.value.itemId });

    expect(item).toMatchObject({
      id: raised.value.itemId,
      queue: "reports",
      title: "A probe Report",
      counts: { ...EMPTY_COUNTS, reports: 1 },
      decided: null,
      decisions: [
        { key: "dismiss", label: "Dismiss", told: "Nobody", reason: "optional" },
        { key: "warn", label: "Warn", told: "The reported Account", reason: "required" },
      ],
      tabs: [
        {
          key: "evidence",
          label: "Evidence",
          blocks: [{ kind: "text", text: "Reported by a Client." }],
        },
        { key: "conversation", label: "Conversation", read: "conversation" },
      ],
      sidebar: [
        {
          title: "Parties",
          blocks: [{ kind: "facts", facts: [{ label: "Reported", value: "Sipho Dlamini" }] }],
        },
      ],
      timeline: [{ at: expect.any(Date), text: "Raised" }],
    });
  });

  test("of an item that does not exist is null", async () => {
    const { domain, given } = await createProbeHarness();
    const { actor } = await given.admin();

    expect(await domain.queues.item(actor, { itemId: "nope" })).toBeNull();
  });

  test("is shown to no one but an Admin", async () => {
    const { domain, given } = await createProbeHarness();
    const reporter = await given.client();
    const reported = await given.artisan();
    const raised = await domain.probe.report(reporter.actor, {
      accountId: reported.actor.accountId,
    });

    expect(await domain.queues.item(reporter.actor, { itemId: raised.value.itemId })).toBeNull();
  });
});

describe("recording a decision", () => {
  async function reportRaised() {
    const harness = await createProbeHarness();
    const admin = await harness.given.admin();
    const reporter = await harness.given.client();
    const reported = await harness.given.artisan();
    const raised = await harness.domain.probe.report(reporter.actor, {
      accountId: reported.actor.accountId,
    });
    return { ...harness, admin, reporter, reported, itemId: raised.value.itemId };
  }

  test("tells who the decision says, and takes the item off the home stream", async () => {
    const { domain, admin, reported, itemId, mailer } = await reportRaised();

    const decided = await domain.queues.decide(admin.actor, {
      itemId,
      decision: "warn",
      reason: "Asked to be paid in cash.",
    });

    expect(decided).toEqual({ ok: true, value: { itemId, decision: "warn" } });
    expect(await domain.notices.list(reported.actor)).toMatchObject([
      { event: "probe.warned", title: "You were warned" },
    ]);
    expect(mailer.sentTo(reported.email).at(-1)!.subject).toBe("You were warned");
    expect(await domain.queues.home(admin.actor)).toMatchObject({
      counts: { reports: 0 },
      items: [],
    });
  });

  test("is shown on the item, with no decision left to make", async () => {
    const { domain, admin, itemId, clock } = await reportRaised();
    clock.advance({ hours: 2 });

    await domain.queues.decide(admin.actor, { itemId, decision: "dismiss", reason: "" });

    expect(await domain.queues.item(admin.actor, { itemId })).toMatchObject({
      decided: {
        decision: "dismiss",
        label: "Dismiss",
        reason: null,
        by: admin.email,
        at: clock.now(),
      },
      decisions: [],
      timeline: [{ text: "Raised" }, { at: clock.now(), text: `Dismiss, by ${admin.email}` }],
    });
  });

  test("writes who decided what, and when, to the audit log", async () => {
    const { domain, admin, itemId, clock } = await reportRaised();

    await domain.queues.decide(admin.actor, { itemId, decision: "warn", reason: "Cash." });

    expect((await domain.admins.auditLog(admin.actor))!.rows).toMatchObject([
      {
        at: clock.now(),
        admin: admin.email,
        action: "queue.decided",
        summary: "Warn: A probe Report. Reason: Cash.",
        subjectId: itemId,
      },
    ]);
  });

  test("cannot be reopened", async () => {
    const { domain, admin, given, reported, itemId } = await reportRaised();
    const other = await given.admin();
    await domain.queues.decide(admin.actor, { itemId, decision: "dismiss" });

    const again = await domain.queues.decide(other.actor, {
      itemId,
      decision: "warn",
      reason: "Changed my mind.",
    });

    expect(again).toMatchObject({ ok: false, refusal: { reason: "already-decided" } });
    expect(await domain.notices.list(reported.actor)).toEqual([]);
    expect(await domain.queues.item(admin.actor, { itemId })).toMatchObject({
      decided: { decision: "dismiss", by: admin.email },
    });
  });

  test("by two Admins at once records only one", async () => {
    const { domain, admin, given, reported, itemId } = await reportRaised();
    const other = await given.admin();

    const results = await Promise.all([
      domain.queues.decide(admin.actor, { itemId, decision: "warn", reason: "One." }),
      domain.queues.decide(other.actor, { itemId, decision: "warn", reason: "Two." }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toMatchObject([
      { refusal: { reason: "already-decided" } },
    ]);
    expect(await domain.notices.list(reported.actor)).toHaveLength(1);
    expect(
      (await domain.admins.auditLog(admin.actor))!.rows.filter(
        (row) => row.action === "queue.decided",
      ),
    ).toHaveLength(1);
  });

  test("is refused for a decision the item does not allow", async () => {
    const { domain, admin, itemId } = await reportRaised();

    expect(
      await domain.queues.decide(admin.actor, { itemId, decision: "suspend", reason: "No." }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-allowed" } });
    expect(await domain.queues.home(admin.actor)).toMatchObject({ counts: { reports: 1 } });
  });

  test("is refused without a reason the decision requires", async () => {
    const { domain, admin, itemId } = await reportRaised();

    expect(
      await domain.queues.decide(admin.actor, { itemId, decision: "warn", reason: "   " }),
    ).toMatchObject({ ok: false, refusal: { reason: "reason-required" } });
  });

  test("passes on a kind's refusal, recording nothing", async () => {
    const { domain, admin, itemId } = await reportRaised();

    expect(
      await domain.queues.decide(admin.actor, { itemId, decision: "warn", reason: "refuse me" }),
    ).toMatchObject({ ok: false, refusal: { reason: "probe-refused" } });
    expect(await domain.queues.item(admin.actor, { itemId })).toMatchObject({ decided: null });
    expect((await domain.admins.auditLog(admin.actor))!.rows).toEqual([]);
  });

  test("is done only by an Admin", async () => {
    const { domain, reporter, itemId } = await reportRaised();

    expect(
      await domain.queues.decide(reporter.actor, { itemId, decision: "dismiss" }),
    ).toMatchObject({ ok: false, refusal: { reason: "admin-only" } });
  });
});

describe("a logged read", () => {
  test("is written to the audit log before it is shown", async () => {
    const { domain, given } = await createProbeHarness();
    const admin = await given.admin();
    const reporter = await given.client();
    const reported = await given.artisan();
    const raised = await domain.probe.report(reporter.actor, {
      accountId: reported.actor.accountId,
    });

    const opened = await domain.queues.open(admin.actor, {
      itemId: raised.value.itemId,
      read: "conversation",
    });

    expect(opened).toEqual({ ok: true, value: [{ kind: "text", text: "Hello, can I pay cash?" }] });
    expect((await domain.admins.auditLog(admin.actor))!.rows).toMatchObject([
      {
        admin: admin.email,
        action: "read",
        summary: "Opened the Conversation: A probe Report",
        subjectId: raised.value.itemId,
      },
    ]);
  });

  test("of something the item does not have is refused, and not logged", async () => {
    const { domain, given } = await createProbeHarness();
    const admin = await given.admin();
    const reporter = await given.client();
    const reported = await given.artisan();
    const raised = await domain.probe.report(reporter.actor, {
      accountId: reported.actor.accountId,
    });

    expect(
      await domain.queues.open(admin.actor, { itemId: raised.value.itemId, read: "documents" }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-found" } });
    expect((await domain.admins.auditLog(admin.actor))!.rows).toEqual([]);
  });

  test("is open to no one but an Admin", async () => {
    const { domain, given } = await createProbeHarness();
    const reporter = await given.client();
    const reported = await given.artisan();
    const raised = await domain.probe.report(reporter.actor, {
      accountId: reported.actor.accountId,
    });

    expect(
      await domain.queues.open(reported.actor, {
        itemId: raised.value.itemId,
        read: "conversation",
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "admin-only" } });
  });
});

describe("no Tell reaches an Admin", () => {
  test("when an item is raised", async () => {
    const { domain, given, mailer } = await createProbeHarness();
    const admin = await given.admin();
    const reporter = await given.client();
    const reported = await given.artisan();
    const sentBefore = mailer.sentTo(admin.email).length;

    await domain.probe.report(reporter.actor, { accountId: reported.actor.accountId });
    await domain.system.runDueClocks();

    expect(mailer.sentTo(admin.email)).toHaveLength(sentBefore);
  });
});
