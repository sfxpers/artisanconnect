import { describe, expect, test } from "vitest";
import { visitor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";

// The Admin works from one home stream of eight queues, and decides each item
// on its page. Each kind's own decisions, Tells, and logged reads are tested
// with it; these are what every queue shares, on Support requests and Reports.

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

/** A Support request, then a Report of a Job a minute later, then another Support request. */
async function threeRaised({ domain, given, clock }: Harness) {
  const admin = await given.admin();
  const artisan = await given.matchableArtisan();
  const client = await given.client({ name: "Thandi Mokoena" });
  const jobId = await given.openJob(client, { title: "Paint the lounge" });
  await domain.support.send(client.actor, { topic: "payment", message: "Charged twice." });
  clock.advance({ minutes: 1 });
  await domain.reports.report(artisan.actor, {
    about: { kind: "job", id: jobId },
    reason: "contact-or-payment",
  });
  clock.advance({ minutes: 1 });
  await domain.support.send(client.actor, { topic: "other", message: "Hello?" });
  return { admin, client };
}

describe("the Admin home", () => {
  test("is one stream of every queue's open items, oldest first, with counts", async () => {
    const harness = await createHarness();
    const { admin } = await threeRaised(harness);

    expect(await harness.domain.queues.home(admin.actor)).toEqual({
      counts: { ...EMPTY_COUNTS, support: 2, reports: 1 },
      items: [
        expect.objectContaining({ queue: "support", title: "Payment, from Thandi Mokoena" }),
        expect.objectContaining({ queue: "reports", title: "Report of a Job: Paint the lounge" }),
        expect.objectContaining({ queue: "support", title: "Other, from Thandi Mokoena" }),
      ],
    });
  });

  test("narrows to one queue, keeping every queue's count", async () => {
    const harness = await createHarness();
    const { admin } = await threeRaised(harness);

    expect(await harness.domain.queues.home(admin.actor, { queue: "reports" })).toEqual({
      counts: { ...EMPTY_COUNTS, support: 2, reports: 1 },
      items: [expect.objectContaining({ queue: "reports" })],
    });
  });

  test("lists every queue, empty ones too", async () => {
    const { domain, given } = await createHarness();
    const { actor } = await given.admin();

    expect(await domain.queues.home(actor)).toEqual({ counts: EMPTY_COUNTS, items: [] });
  });

  test("and an item page are shown to no one but an Admin", async () => {
    const harness = await createHarness();
    const { admin, client } = await threeRaised(harness);
    const [item] = (await harness.domain.queues.home(admin.actor))!.items;

    for (const viewer of [client.actor, visitor]) {
      expect(await harness.domain.queues.home(viewer)).toBeNull();
      expect(await harness.domain.queues.item(viewer, { itemId: item!.id })).toBeNull();
    }
    expect(await harness.domain.queues.item(admin.actor, { itemId: "nope" })).toBeNull();
  });
});

describe("a decision", () => {
  async function supportRaised() {
    const harness = await createHarness();
    const admin = await harness.given.admin();
    const client = await harness.given.client();
    await harness.domain.support.send(client.actor, { topic: "payment", message: "Twice." });
    const [item] = (await harness.domain.queues.home(admin.actor))!.items;
    return { ...harness, admin, client, itemId: item!.id };
  }

  test("is shown on the item, with no decision left to make", async () => {
    const { domain, admin, itemId, clock } = await supportRaised();
    clock.advance({ hours: 2 });

    await domain.queues.decide(admin.actor, { itemId, decision: "answer", reason: "Refunded." });

    expect(await domain.queues.item(admin.actor, { itemId })).toMatchObject({
      decided: { decision: "answer", reason: "Refunded.", by: admin.email, at: clock.now() },
      decisions: [],
      timeline: [{ text: "Raised" }, { at: clock.now(), text: `Answer, by ${admin.email}` }],
    });
  });

  test.each([
    ["by someone not an Admin", "client", "answer", "Yes.", "admin-only"],
    ["the item does not allow", "admin", "suspend", "No.", "not-allowed"],
    ["without the reason it requires", "admin", "answer", "   ", "reason-required"],
  ] as const)(
    "%s is refused, and nothing is recorded",
    async (_, by, decision, reason, refused) => {
      const { domain, admin, client, itemId } = await supportRaised();

      expect(
        await domain.queues.decide({ admin, client }[by].actor, { itemId, decision, reason }),
      ).toMatchObject({ ok: false, refusal: { reason: refused } });
      expect(await domain.queues.item(admin.actor, { itemId })).toMatchObject({ decided: null });
      expect((await domain.admins.auditLog(admin.actor))!.rows).toEqual([]);
    },
  );

  test("by two Admins at once records only one, and tells once", async () => {
    const { domain, given, mailer } = await createHarness();
    const admin = await given.admin();
    const other = await given.admin();
    const client = await given.client();
    await domain.support.send(client.actor, { topic: "payment", message: "Charged twice." });
    const [item] = (await domain.queues.home(admin.actor))!.items;
    const sentBefore = mailer.sentTo(client.email).length;

    const results = await Promise.all(
      [admin, other].map((each) =>
        domain.queues.decide(each.actor, { itemId: item!.id, decision: "answer", reason: "Yes." }),
      ),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toMatchObject([
      { refusal: { reason: "already-decided" } },
    ]);
    expect(mailer.sentTo(client.email).slice(sentBefore)).toHaveLength(1);
    expect(
      (await domain.admins.auditLog(admin.actor))!.rows.filter(
        (row) => row.action === "queue.decided",
      ),
    ).toHaveLength(1);
  });
});
