import { describe, expect, test } from "vitest";
import { system, visitor, type AdminActor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";
import { createSystemSupportHarness } from "../support/system-support";

// A signed-in Account writes to the Admin under a fixed topic, and the Admin's
// answer goes back by email (#117). The platform may also raise a Support
// request itself, with a tag, for what only the Admin can settle.

/** The one Support request waiting for the Admin. */
async function supportItem(domain: Harness["domain"], admin: { actor: AdminActor }) {
  const [item] = (await domain.queues.home(admin.actor, { queue: "support" }))?.items ?? [];
  if (!item) throw new Error("No Support request is waiting");
  return item;
}

describe("sending a Support request", () => {
  test("puts it in the Support queue under its topic", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client({ name: "Thandi Mokoena" });

    const sent = await domain.support.send(client.actor, {
      topic: "payment",
      message: "My Payment went through twice.",
    });

    expect(sent).toEqual({ ok: true, value: { requestId: expect.any(String) } });
    const home = await domain.queues.home(admin.actor, { queue: "support" });
    expect(home?.counts.support).toBe(1);
    expect(home?.items).toEqual([
      {
        id: expect.any(String),
        queue: "support",
        title: "Payment, from Thandi Mokoena",
        raisedAt: expect.any(Date),
      },
    ]);
  });
});

describe("sending a Support request, refused", () => {
  test.each([
    ["an unknown topic", { topic: "billing", message: "Hello?" }, /what it is about/],
    ["no message", { topic: "other", message: "   " }, /Write what you need/],
    ["a message too long", { topic: "other", message: "a".repeat(4001) }, /4000 characters/],
  ])("for %s, and nothing reaches the Admin", async (_, input, message) => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();

    const sent = await domain.support.send(client.actor, input);

    expect(sent).toEqual({
      ok: false,
      refusal: { reason: "invalid", message: expect.stringMatching(message) },
    });
    expect((await domain.queues.home(admin.actor))?.counts.support).toBe(0);
  });

  test("for anyone who is not a signed-in Account", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const input = { topic: "other", message: "Hello?" };

    expect(await domain.support.send(visitor, input)).toMatchObject({
      ok: false,
      refusal: { reason: "sign-in-required" },
    });
    expect(await domain.support.send(admin.actor, input)).toMatchObject({
      ok: false,
      refusal: { reason: "sign-in-required" },
    });
    expect((await domain.queues.home(admin.actor))?.counts.support).toBe(0);
  });
});

describe("waiting Support requests", () => {
  test("are three at most per Account; a fourth is refused until one is answered", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    const other = await given.client();
    for (const message of ["One.", "Two.", "Three."]) {
      await domain.support.send(client.actor, { topic: "other", message });
    }

    const fourth = await domain.support.send(client.actor, { topic: "other", message: "Four." });

    expect(fourth).toEqual({
      ok: false,
      refusal: { reason: "too-many-waiting", message: expect.stringMatching(/3 requests/) },
    });
    expect((await domain.queues.home(admin.actor))?.counts.support).toBe(3);
    // Another Account's are its own. Sent later, so the oldest waiting are the first Account's.
    clock.advance({ minutes: 1 });
    expect(
      await domain.support.send(other.actor, { topic: "other", message: "Mine." }),
    ).toMatchObject({ ok: true });

    const first = await supportItem(domain, admin);
    await domain.queues.decide(admin.actor, {
      itemId: first.id,
      decision: "answer",
      reason: "Done.",
    });

    expect(
      await domain.support.send(client.actor, { topic: "other", message: "Four." }),
    ).toMatchObject({ ok: true });
  });
});

describe("a Support request's page", () => {
  test("shows the Admin the topic, the message, and the Account", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan({ name: "Sipho Dlamini" });
    await domain.support.send(artisan.actor, {
      topic: "verification",
      message: "My certificate was rejected, but it is current.",
    });
    const item = await supportItem(domain, admin);

    const page = await domain.queues.item(admin.actor, { itemId: item.id });

    expect(page).toMatchObject({
      queue: "support",
      title: "Verification, from Sipho Dlamini",
      tabs: [
        {
          key: "request",
          label: "Request",
          blocks: [
            { kind: "facts", facts: [{ label: "Topic", value: "Verification" }] },
            { kind: "text", text: "My certificate was rejected, but it is current." },
          ],
        },
      ],
      sidebar: [
        {
          title: "Account",
          blocks: [
            {
              kind: "facts",
              facts: [
                { label: "Kind", value: "Artisan" },
                { label: "Name", value: "Sipho Dlamini" },
                { label: "Email", value: artisan.email },
              ],
            },
          ],
        },
      ],
    });
  });
});

describe("an Account's own Support requests", () => {
  test("are listed newest first, each waiting or answered, and only to it", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    const other = await given.client();
    await domain.support.send(client.actor, { topic: "account", message: "First." });
    clock.advance({ minutes: 1 });
    await domain.support.send(client.actor, { topic: "other", message: "Second." });
    await domain.support.send(other.actor, { topic: "other", message: "Not yours." });
    const first = await supportItem(domain, admin);
    clock.advance({ minutes: 1 });
    await domain.queues.decide(admin.actor, {
      itemId: first.id,
      decision: "answer",
      reason: "Done.",
    });

    const mine = await domain.support.mine(client.actor);

    expect(mine).toEqual([
      {
        requestId: expect.any(String),
        topic: "other",
        message: "Second.",
        sentAt: expect.any(Date),
        answeredAt: null,
      },
      {
        requestId: expect.any(String),
        topic: "account",
        message: "First.",
        sentAt: expect.any(Date),
        answeredAt: clock.now(),
      },
    ]);
    expect(await domain.support.mine(visitor)).toEqual([]);
    expect(await domain.support.mine(admin.actor)).toEqual([]);
  });
});

describe("answering a Support request", () => {
  test("is the only decision, and the answer is emailed to the Account", async () => {
    const { domain, given, mailer } = await createHarness();
    const admin = await given.admin();
    const client = await given.client({ name: "Thandi Mokoena" });
    await domain.support.send(client.actor, {
      topic: "payment",
      message: "My Payment went through twice.",
    });
    const item = await supportItem(domain, admin);

    const page = await domain.queues.item(admin.actor, { itemId: item.id });
    expect(page?.decisions).toEqual([
      {
        key: "answer",
        label: "Answer",
        told: "The Account, by email",
        reason: "required",
        reasonLabel: "Answer",
        fields: [],
      },
    ]);
    const answered = await domain.queues.decide(admin.actor, {
      itemId: item.id,
      decision: "answer",
      reason: "The second charge was never taken; your bank shows it until it lapses.",
    });

    expect(answered).toEqual({ ok: true, value: { itemId: item.id, decision: "answer" } });
    expect(mailer.sentTo(client.email)).toEqual([
      expect.anything(), // The Email code at sign-up.
      {
        to: client.email,
        subject: "Your Support request is answered",
        text: expect.stringContaining(
          "The second charge was never taken; your bank shows it until it lapses.",
        ),
      },
    ]);
    const email = mailer.sentTo(client.email).at(-1)!;
    expect(email.text).toContain("My Payment went through twice.");
    expect(email.text).toContain("https://artisanconnect.test/support");
    // By email only: nothing in the Notices stream.
    expect(await domain.notices.list(client.actor)).toEqual([]);
    const log = await domain.admins.auditLog(admin.actor);
    expect(log?.rows[0]?.summary).toBe(
      "Answer: Payment, from Thandi Mokoena. Answer: The second charge was never taken; your bank shows it until it lapses.",
    );
  });

  test("needs an answer", async () => {
    const { domain, given, mailer } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    await domain.support.send(client.actor, { topic: "other", message: "Hello?" });
    const item = await supportItem(domain, admin);

    const answered = await domain.queues.decide(admin.actor, {
      itemId: item.id,
      decision: "answer",
      reason: "  ",
    });

    expect(answered).toEqual({
      ok: false,
      refusal: { reason: "reason-required", message: expect.any(String) },
    });
    expect(mailer.sentTo(client.email)).toHaveLength(1);
  });
});

describe("a system Support request", () => {
  test("waits in the same queue, oldest first, under its tag", async () => {
    const { domain, given, clock } = await createSystemSupportHarness();
    const admin = await given.admin();
    const client = await given.client({ name: "Thandi Mokoena" });
    await domain.systemSupportProbe.raise(system, {
      tag: "failed-refund",
      about: "R1,200.00 owed to Thandi M.",
      details: "The Refund of the Labour failed at the bank.",
      accountId: client.actor.accountId,
    });
    clock.advance({ minutes: 1 });
    await domain.support.send(client.actor, { topic: "payment", message: "Where is my Refund?" });

    const home = await domain.queues.home(admin.actor, { queue: "support" });

    expect(home?.items.map((item) => item.title)).toEqual([
      "Failed Refund: R1,200.00 owed to Thandi M.",
      "Payment, from Thandi Mokoena",
    ]);
    const page = await domain.queues.item(admin.actor, { itemId: home!.items[0]!.id });
    expect(page).toMatchObject({
      decisions: [
        {
          key: "resolve",
          label: "Resolve",
          told: "Nobody",
          reason: "optional",
          reasonLabel: "Note",
        },
      ],
      tabs: [
        {
          key: "request",
          label: "Request",
          blocks: [
            { kind: "facts", facts: [{ label: "Tag", value: "Failed Refund" }] },
            { kind: "text", text: "The Refund of the Labour failed at the bank." },
          ],
        },
      ],
      sidebar: [
        {
          title: "Account",
          blocks: [
            {
              kind: "facts",
              facts: [
                { label: "Kind", value: "Client" },
                { label: "Name", value: "Thandi Mokoena" },
                { label: "Email", value: client.email },
              ],
            },
          ],
        },
      ],
    });
  });

  test("is resolved with a note, and nobody is told", async () => {
    const { domain, given, mailer } = await createSystemSupportHarness();
    const admin = await given.admin();
    await domain.systemSupportProbe.raise(system, {
      tag: "paused-money",
      about: "R800.00 paused for 3 days",
      details: "The daily run has paused it since Monday.",
    });
    const item = await supportItem(domain, admin);
    const sentBefore = mailer.sent.length;

    const resolved = await domain.queues.decide(admin.actor, {
      itemId: item.id,
      decision: "resolve",
      reason: "Paid by bank transfer.",
    });

    expect(resolved).toEqual({ ok: true, value: { itemId: item.id, decision: "resolve" } });
    expect(mailer.sent).toHaveLength(sentBefore);
    const page = await domain.queues.item(admin.actor, { itemId: item.id });
    expect(page?.decided).toMatchObject({
      label: "Resolve",
      reason: "Paid by bank transfer.",
      reasonLabel: "Note",
    });
    expect(page?.sidebar).toEqual([]);
  });
});
