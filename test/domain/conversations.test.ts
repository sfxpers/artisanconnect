import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import type { Actor, AdminActor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";
import { m4a, paddedTo, webmOpus } from "../support/files";
import { textPdf } from "../support/pdfs";
import { photo } from "../support/verification";

// Conversations (#125, #131, ADR 0010, ADR 0011): each Client and Artisan on a
// Job talk in one Conversation, opened by the first Quote Sent or the
// Invitation. Before Payment only text and photos go, every message is read
// by the Content check first, and nothing that could take the Job off the
// platform gets through. Once Hired, the Engagement's Conversation also takes
// voice notes and PDFs, and contact details, but never payment off the platform.

describe("a Conversation", () => {
  test("opens when the first Quote is Sent, with a row for it that is not speech", async () => {
    const { domain, given, clock } = await createHarness();
    const artisan = await given.matchableArtisan({ name: "Sipho Dlamini" });
    const client = await given.client({ name: "Thandi Mokoena" });
    const jobId = await given.openJob(client);
    expect(await domain.conversations.forJob(client.actor, { jobId })).toEqual([]);

    await given.sentQuote(artisan, jobId);

    const [summary, ...more] = (await domain.conversations.forJob(client.actor, { jobId }))!;
    expect(more).toEqual([]);
    expect(summary).toMatchObject({
      with: { artisanId: artisan.actor.accountId, name: "Sipho Dlamini" },
      unread: 0,
      takesMessages: true,
    });
    expect(await domain.conversations.forJob(artisan.actor, { jobId })).toEqual([
      expect.objectContaining({
        conversationId: summary!.conversationId,
        with: { name: "Thandi M." },
      }),
    ]);
    for (const party of [client, artisan]) {
      expect(
        await domain.conversations.view(party.actor, { conversationId: summary!.conversationId }),
      ).toMatchObject({
        jobId,
        takesMessages: true,
        firstMessage: true,
        items: [{ kind: "event", event: "quote.sent", at: clock.now() }],
      });
    }
  });

  test("opens with the Invitation, and the Quote Sent after it shows in the same one", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client, { matching: "invite-only" });

    await invite(domain, client, artisan, jobId);
    const [opened] = (await domain.conversations.forJob(artisan.actor, { jobId }))!;
    expect(
      await domain.conversations.view(artisan.actor, { conversationId: opened!.conversationId }),
    ).toMatchObject({ takesMessages: true, items: [] });

    await given.sentQuote(artisan, jobId);

    expect(await domain.conversations.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({ conversationId: opened!.conversationId }),
    ]);
    expect(
      await domain.conversations.view(client.actor, { conversationId: opened!.conversationId }),
    ).toMatchObject({ items: [{ kind: "event", event: "quote.sent" }] });
  });

  test("is one per Job and Artisan, and only theirs", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const other = await given.matchableArtisan();
    const client = await given.client();
    const stranger = await given.client();
    const jobId = await given.openJob(client);
    await given.sentQuote(artisan, jobId);
    await given.sentQuote(other, jobId);

    const conversations = (await domain.conversations.forJob(client.actor, { jobId }))!;

    expect(conversations.map((each) => each.with.artisanId)).toEqual([
      artisan.actor.accountId,
      other.actor.accountId,
    ]);
    const [first] = conversations;
    expect(await domain.conversations.forJob(other.actor, { jobId })).toEqual([
      expect.objectContaining({ conversationId: conversations[1]!.conversationId }),
    ]);
    expect(await domain.conversations.forJob(stranger.actor, { jobId })).toBeNull();
    for (const outsider of [other, stranger]) {
      const conversationId = first!.conversationId;
      expect(await domain.conversations.view(outsider.actor, { conversationId })).toBeNull();
      expect(
        await domain.conversations.send(outsider.actor, { conversationId, text: "Hello" }),
      ).toMatchObject({ ok: false, refusal: { reason: "not-found" } });
    }
  });

  test("does not open for a Job Match alone, nor for a Held Quote until it is Sent", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    expect(await domain.conversations.forJob(artisan.actor, { jobId })).toEqual([]);

    harness.contentReader.force({ kind: "unsure", reason: "It may name a social handle." });
    await domain.quotes.send(artisan.actor, { jobId, ...QUOTE });
    harness.contentReader.force({ kind: "clear" });
    expect(await domain.conversations.forJob(client.actor, { jobId })).toEqual([]);

    await decide(harness, admin, "release");
    const [opened] = (await domain.conversations.forJob(client.actor, { jobId }))!;
    expect(
      await domain.conversations.view(client.actor, { conversationId: opened!.conversationId }),
    ).toMatchObject({ items: [{ kind: "event", event: "quote.sent" }] });
  });
});

describe("a message", () => {
  test("is delivered to the other party, and is the sender's first no longer", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, conversationId } = await talking(given, domain);

    const sent = await domain.conversations.send(client.actor, {
      conversationId,
      text: "Can you start on the Monday?",
    });

    expect(sent).toEqual({
      ok: true,
      value: { messageId: expect.any(String), state: "delivered" },
    });
    const message = {
      kind: "message",
      messageId: sent.ok && sent.value.messageId,
      text: "Can you start on the Monday?",
      photos: [],
      state: "delivered",
      at: clock.now(),
    };
    expect(await domain.conversations.view(client.actor, { conversationId })).toMatchObject({
      firstMessage: false,
      items: [{ kind: "event" }, { ...message, mine: true }],
    });
    expect(await domain.conversations.view(artisan.actor, { conversationId })).toMatchObject({
      firstMessage: true,
      items: [{ kind: "event" }, { ...message, mine: false }],
    });
  });

  test("takes up to five photos, which only the parties see", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, conversationId } = await talking(given, domain);
    const stranger = await given.client();

    const sent = await domain.conversations.send(artisan.actor, {
      conversationId,
      text: "",
      files: [await photo(), await photo()],
    });

    expect(sent).toMatchObject({ ok: true, value: { state: "delivered" } });
    const last = (await domain.conversations.view(client.actor, { conversationId }))!.items.at(-1);
    const photos = last?.kind === "message" ? last.photos : [];
    expect(photos).toEqual([
      expect.objectContaining({ width: 64, height: 48 }),
      expect.objectContaining({ width: 64, height: 48 }),
    ]);
    const photo1 = { messageId: sent.ok ? sent.value.messageId : "", fileId: photos[0]!.id };
    for (const party of [client, artisan]) {
      expect(await domain.conversations.file(party.actor, photo1)).toMatchObject({
        contentType: "image/webp",
      });
    }
    expect(await domain.conversations.file(stranger.actor, photo1)).toBeNull();
    expect(await domain.conversations.file({ kind: "visitor" }, photo1)).toBeNull();
    expect(
      await domain.conversations.file(client.actor, { ...photo1, messageId: "nope" }),
    ).toBeNull();
  });

  test("is refused with six photos, a voice note or a PDF, or nothing in it", async () => {
    const { domain, given } = await createHarness();
    const { client, conversationId } = await talking(given, domain);
    const six = await Promise.all(Array.from({ length: 6 }, () => photo()));

    expect(
      await domain.conversations.send(client.actor, { conversationId, text: "", files: six }),
    ).toEqual({
      ok: false,
      refusal: { reason: "too-many-files", message: "A message has at most 5 attachments." },
    });
    expect(
      await domain.conversations.send(client.actor, {
        conversationId,
        text: "The quote",
        files: [new Blob([PDF], { type: "application/pdf" })],
      }),
    ).toEqual({
      ok: false,
      refusal: { reason: "not-taken-here", message: "Only photos can be sent here." },
    });
    expect(
      await domain.conversations.send(client.actor, {
        conversationId,
        text: "Listen",
        files: [new Blob([webmOpus(10)])],
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-taken-here" } });
    expect(await domain.conversations.send(client.actor, { conversationId, text: "  " })).toEqual({
      ok: false,
      refusal: { reason: "invalid", message: "Write a message or add a photo." },
    });
    expect(await domain.conversations.view(client.actor, { conversationId })).toMatchObject({
      items: [{ kind: "event" }],
    });
  });

  test("cannot be edited or removed once delivered", async () => {
    const { domain, given } = await createHarness();
    const { client, conversationId } = await talking(given, domain);
    await domain.conversations.send(client.actor, { conversationId, text: "See you Monday." });

    // There is no command that could change one, so this checks the database
    // itself refuses: the record holds even against a bug.
    await expect(env.DB.prepare("UPDATE messages SET text = 'Changed'").run()).rejects.toThrow(
      /a delivered message is never changed/,
    );
    await expect(env.DB.prepare("DELETE FROM messages").run()).rejects.toThrow(
      /a message is never removed/,
    );
    expect(await domain.conversations.view(client.actor, { conversationId })).toMatchObject({
      items: [{ kind: "event" }, { text: "See you Monday." }],
    });
  });
});

describe("the Content check of a message", () => {
  test.each([
    ["a phone number", "Call me on 082 555 1234", "Take out the phone number."],
    ["an email address", "Mail thandi@example.com", "Take out the email address."],
    ["a link", "See www.example.com", "Take out the link."],
    ["the Job's street", "I'm at 12 Main Road", "Take out the street address."],
    [
      "the Job's street, shortened",
      "It's on main rd, near the shops",
      "Take out the street address.",
    ],
    ["the Job's suburb", "Right here in sea point", "Take out the suburb."],
    ["the Client's surname", "Mrs Mokoena will let you in", "Take out the surname."],
  ])("refuses %s, says why, and delivers nothing", async (_, text, message) => {
    const { domain, given } = await createHarness();
    const { client, artisan, conversationId } = await talking(given, domain);

    const sent = await domain.conversations.send(artisan.actor, { conversationId, text });

    expect(sent).toMatchObject({
      ok: false,
      refusal: { reason: "content", message: expect.stringContaining(message) },
    });
    for (const party of [client, artisan]) {
      expect(await domain.conversations.view(party.actor, { conversationId })).toMatchObject({
        items: [{ kind: "event" }],
      });
    }
  });

  test("reads a photo's text, and refuses what it finds", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { artisan, conversationId } = await talking(given, domain);
    contentReader.photosSay("WhatsApp 082 555 1234");

    expect(
      await domain.conversations.send(artisan.actor, {
        conversationId,
        text: "My card",
        files: [await photo()],
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "content" } });
  });

  test("lets a surname shown, or a trading name, through", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { client, conversationId } = await talking(given, domain);

    expect(
      await domain.conversations.send(client.actor, {
        conversationId,
        text: "Thanks Sipho Dlamini, the main room is the lounge.",
      }),
    ).toMatchObject({ ok: true, value: { state: "delivered" } });
    expect(contentReader.reads.at(-1)).toMatchObject({ context: { kind: "before-payment" } });
  });

  test("refuses the surname of an Artisan known by a trading name", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan({
      name: "Sipho Dlamini",
      tradingName: "Bright Walls",
    });
    const client = await given.client();
    const jobId = await given.openJob(client);
    await given.sentQuote(artisan, jobId);
    const [{ conversationId }] = (await domain.conversations.forJob(client.actor, { jobId }))!;

    expect(
      await domain.conversations.send(artisan.actor, {
        conversationId,
        text: "Ask for Mr Dlamini at the gate.",
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "content" } });
  });

  test("refuses a sure hit of the content reader with its reason", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { client, conversationId } = await talking(given, domain);
    contentReader.force({ kind: "sure-hit", reason: "It asks to pay in cash." });

    expect(
      await domain.conversations.send(client.actor, { conversationId, text: "Cash is fine?" }),
    ).toEqual({ ok: false, refusal: { reason: "content", message: "It asks to pay in cash." } });
  });

  test("Holds an unsure message: being checked to its sender, nothing to the other party", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const { client, artisan, conversationId } = await talking(given, domain);
    const told = await domain.notices.list(artisan.actor);

    expect(await sendHeld(harness, client, conversationId)).toMatchObject({ state: "held" });

    expect(await domain.conversations.view(client.actor, { conversationId })).toMatchObject({
      items: [{ kind: "event" }, { kind: "message", text: HELD_TEXT, state: "held", mine: true }],
    });
    expect(await domain.conversations.view(artisan.actor, { conversationId })).toMatchObject({
      items: [{ kind: "event" }],
    });
    expect(await domain.notices.list(artisan.actor)).toEqual(told);
    const { id: itemId } = await preCheck(harness, admin);
    expect(await domain.queues.item(admin.actor, { itemId })).toMatchObject({
      title: "Message: Paint the lounge",
      tabs: [
        { label: "The message", blocks: [{ kind: "text", text: HELD_TEXT }] },
        { label: "The Job" },
        { label: "Content check", blocks: [{ kind: "text", text: "It may name a handle." }] },
      ],
    });
  });

  test("a Held message the Admin releases is delivered then, and the other party told", async () => {
    const harness = await createHarness();
    const { domain, given, clock } = harness;
    const admin = await given.admin();
    const { client, artisan, conversationId, jobId } = await talking(given, domain);
    await sendHeld(harness, client, conversationId);
    clock.advance({ hours: 2 });

    await decide(harness, admin, "release");

    expect(await domain.conversations.view(artisan.actor, { conversationId })).toMatchObject({
      items: [{ kind: "event" }, { text: HELD_TEXT, state: "delivered", at: clock.now() }],
    });
    expect(await messageTells(domain, artisan, jobId)).toHaveLength(1);
    expect(await messageTells(domain, client, jobId)).toEqual([
      expect.objectContaining({ title: "Your message is checked and delivered" }),
    ]);
  });

  test("a Held message the Admin refuses shows its sender why, and nobody else", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const { client, artisan, conversationId } = await talking(given, domain);
    await sendHeld(harness, client, conversationId);

    await decide(harness, admin, "refuse", "Leave out the handle.");

    expect(await domain.conversations.view(client.actor, { conversationId })).toMatchObject({
      items: [
        { kind: "event" },
        { state: "refused", refused: { reason: "Leave out the handle." } },
      ],
    });
    expect(await domain.conversations.view(artisan.actor, { conversationId })).toMatchObject({
      items: [{ kind: "event" }],
    });
  });

  test("a Held message its sender withdraws is gone, and leaves the Admin's queue", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const { client, artisan, conversationId } = await talking(given, domain);
    const { messageId } = await sendHeld(harness, client, conversationId);

    expect(await domain.conversations.withdrawHeld(artisan.actor, { messageId })).toMatchObject({
      ok: false,
      refusal: { reason: "nothing-held" },
    });
    expect(await domain.conversations.withdrawHeld(client.actor, { messageId })).toEqual({
      ok: true,
      value: {},
    });

    expect(await domain.conversations.view(client.actor, { conversationId })).toMatchObject({
      items: [{ kind: "event" }],
    });
    expect((await domain.queues.home(admin.actor, { queue: "pre-checks" }))?.items ?? []).toEqual(
      [],
    );
  });

  test("a Held message released once the Conversation is read-only is not delivered", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const { client, artisan, conversationId, jobId } = await talking(given, domain);
    await sendHeld(harness, artisan, conversationId);
    await domain.quotes.withdraw(artisan.actor, { jobId });

    await decide(harness, admin, "release");

    expect(await domain.conversations.view(client.actor, { conversationId })).toMatchObject({
      items: [{ kind: "event" }],
    });
    expect(await messageTells(domain, artisan, jobId)).toEqual([
      expect.objectContaining({ title: "Your message is checked, but the Conversation has ended" }),
    ]);
  });
});

describe("being told of new messages", () => {
  test("is one Tell, with an email naming no message text, until the Conversation is opened", async () => {
    const { domain, given, mailer } = await createHarness();
    const { client, artisan, conversationId, jobId } = await talking(given, domain);

    await domain.conversations.send(client.actor, { conversationId, text: "Hello there." });
    await domain.conversations.send(client.actor, { conversationId, text: "Are you free?" });

    expect(await messageTells(domain, artisan, jobId)).toEqual([
      expect.objectContaining({
        title: "New message on Paint the lounge",
        link: `/jobs/${jobId}?conversation=${conversationId}`,
      }),
    ]);
    const emails = mailer
      .sentTo(artisan.email)
      .filter((email) => email.subject.includes("message"));
    expect(emails).toHaveLength(1);
    expect(emails[0]!.text).not.toContain("Hello");
    expect(await domain.conversations.forJob(artisan.actor, { jobId })).toEqual([
      expect.objectContaining({ unread: 2 }),
    ]);
    expect(await messageTells(domain, client, jobId)).toEqual([]);
  });

  test("starts again once the Conversation is opened", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, conversationId, jobId } = await talking(given, domain);
    await domain.conversations.send(client.actor, { conversationId, text: "Hello there." });
    clock.advance({ minutes: 5 });

    expect(await domain.conversations.opened(artisan.actor, { conversationId })).toEqual({
      ok: true,
      value: {},
    });
    expect(await domain.conversations.forJob(artisan.actor, { jobId })).toEqual([
      expect.objectContaining({ unread: 0 }),
    ]);
    clock.advance({ minutes: 5 });
    await domain.conversations.send(client.actor, { conversationId, text: "Are you free?" });

    expect(await messageTells(domain, artisan, jobId)).toHaveLength(2);
    expect(await domain.conversations.forJob(artisan.actor, { jobId })).toEqual([
      expect.objectContaining({ unread: 1 }),
    ]);
  });

  test("is not for a refused send", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, conversationId, jobId } = await talking(given, domain);

    await domain.conversations.send(client.actor, { conversationId, text: "Call 082 555 1234" });

    expect(await messageTells(domain, artisan, jobId)).toEqual([]);
  });
});

describe("a read-only Conversation", () => {
  test.each([
    [
      "Declined",
      (h: Harness, s: Talking) =>
        h.domain.quotes.decline(s.client.actor, { quoteId: s.quoteId }).then(() => {}),
    ],
    [
      "Withdrawn",
      (h: Harness, s: Talking) =>
        h.domain.quotes.withdraw(s.artisan.actor, { jobId: s.jobId }).then(() => {}),
    ],
    [
      "Expired",
      async (h: Harness) => {
        h.clock.advance({ days: 14 });
        await h.domain.system.runDueClocks();
      },
    ],
  ])("is one whose Quote was %s, and its messages stay", async (_, end) => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const talk = await talking(given, domain);
    const { client, artisan, conversationId } = talk;
    await domain.conversations.send(client.actor, { conversationId, text: "Hello there." });

    await end(harness, talk);

    for (const party of [client, artisan]) {
      expect(await domain.conversations.view(party.actor, { conversationId })).toMatchObject({
        takesMessages: false,
        items: expect.arrayContaining([expect.objectContaining({ text: "Hello there." })]),
      });
      expect(
        await domain.conversations.send(party.actor, { conversationId, text: "One more thing" }),
      ).toEqual({
        ok: false,
        refusal: { reason: "read-only", message: "This Conversation has ended." },
      });
    }
  });

  test("is one on a Job the Client closed", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client, { matching: "invite-only" });
    await invite(domain, client, artisan, jobId);
    const [{ conversationId }] = (await domain.conversations.forJob(client.actor, { jobId }))!;

    await domain.jobs.close(client.actor, { jobId });

    for (const party of [client, artisan]) {
      expect(await domain.conversations.view(party.actor, { conversationId })).toMatchObject({
        takesMessages: false,
      });
      expect(
        await domain.conversations.send(party.actor, { conversationId, text: "Hello" }),
      ).toMatchObject({ ok: false, refusal: { reason: "read-only" } });
    }
    // The invited Artisan keeps the Job in view, to read the Conversation.
    expect(await domain.jobs.viewAsArtisan(artisan.actor, { jobId })).toMatchObject({
      state: "closed",
      offeredAt: null,
    });
  });

  test("is not one whose Quote is still Sent on an Expired Job, which may still be Hired", async () => {
    const { domain, given, clock } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    clock.advance({ days: 2 });
    await given.sentQuote(artisan, jobId);
    const [{ conversationId }] = (await domain.conversations.forJob(client.actor, { jobId }))!;

    clock.advance({ days: 13 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.state).toBe("expired");
    expect(
      await domain.conversations.send(client.actor, { conversationId, text: "Still keen?" }),
    ).toMatchObject({ ok: true });
  });
});

describe("an Invitation passed", () => {
  test("tells nobody: the Client may still write, and the Artisan no longer sees it", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client, { matching: "invite-only" });
    await invite(domain, client, artisan, jobId);
    const [{ conversationId }] = (await domain.conversations.forJob(client.actor, { jobId }))!;
    const before = await domain.conversations.view(client.actor, { conversationId });

    await domain.invitations.pass(artisan.actor, { jobId });

    expect(await domain.conversations.view(client.actor, { conversationId })).toEqual(before);
    expect(await domain.conversations.forJob(artisan.actor, { jobId })).toEqual([]);
    expect(await domain.conversations.view(artisan.actor, { conversationId })).toBeNull();
    expect(
      await domain.conversations.send(client.actor, { conversationId, text: "Any news?" }),
    ).toMatchObject({ ok: true, value: { state: "delivered" } });
    expect(await messageTells(domain, artisan, jobId)).toEqual([]);
  });
});

describe("the Engagement's Conversation", () => {
  test("shows the Hire as a row that is not speech", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, conversationId, quoteId } = await talking(given, domain);
    clock.advance({ hours: 3 });

    await given.hired(client, quoteId);

    for (const party of [client, artisan]) {
      expect(await domain.conversations.view(party.actor, { conversationId })).toMatchObject({
        takesMessages: true,
        afterPayment: true,
        items: [
          { kind: "event", event: "quote.sent" },
          { kind: "event", event: "hire", at: clock.now() },
        ],
      });
    }
  });

  test.each([
    ["a phone number", "Call me on 082 555 1234"],
    ["an email address", "Mail thandi@example.com"],
    ["the Job's street", "I'm at 12 Main Road"],
    ["the Job's suburb", "Right here in sea point"],
    ["the Client's surname", "Mrs Mokoena will let you in"],
  ])("takes %s, read as after Payment", async (_, text) => {
    const { domain, given, contentReader } = await createHarness();
    const { artisan, client, conversationId, engagementId } = await engaged(given, domain);

    const sent = await domain.conversations.send(artisan.actor, { conversationId, text });

    expect(sent).toMatchObject({ ok: true, value: { state: "delivered" } });
    expect(contentReader.reads.at(-1)).toMatchObject({
      text,
      context: { kind: "engagement-conversation", engagementId },
    });
    expect(
      (await domain.conversations.view(client.actor, { conversationId }))!.items.at(-1),
    ).toMatchObject({ kind: "message", text, mine: false });
  });

  test.each([
    ["a bank account number", "Pay to account 62812345678", "Take out the bank account number."],
    ["a card number", "Use card 4111 1111 1111 1111", "Take out the bank account number."],
    ["a payment link", "Pay at pay.example.com/sipho", "Take out the link."],
  ])("still refuses %s", async (_, text, message) => {
    const { domain, given } = await createHarness();
    const { client, conversationId } = await engaged(given, domain);

    expect(await domain.conversations.send(client.actor, { conversationId, text })).toMatchObject({
      ok: false,
      refusal: { reason: "content", message: expect.stringContaining(message) },
    });
  });

  test("still refuses what the content reader is sure of: a payment QR code, an ask to pay off the platform", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { artisan, conversationId } = await engaged(given, domain);
    contentReader.force({ kind: "sure-hit", reason: "It shows a payment QR code." });

    expect(
      await domain.conversations.send(artisan.actor, {
        conversationId,
        text: "Scan this",
        files: [await photo()],
      }),
    ).toEqual({
      ok: false,
      refusal: { reason: "content", message: "It shows a payment QR code." },
    });
    expect(contentReader.reads.at(-1)?.photos).toHaveLength(1);
  });

  test("takes a voice note of up to five minutes, turned into text and checked", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { artisan, client, conversationId } = await engaged(given, domain);
    const stranger = await given.client();
    contentReader.voiceNotesSay("I'll be there at eight with the ladder.");

    const sent = await domain.conversations.send(artisan.actor, {
      conversationId,
      text: "",
      files: [new Blob([m4a(5 * 60)])],
    });

    expect(sent).toMatchObject({ ok: true, value: { state: "delivered" } });
    expect(contentReader.reads.at(-1)?.text).toBe("I'll be there at eight with the ladder.");
    const last = (await domain.conversations.view(client.actor, { conversationId }))!.items.at(-1);
    const files = last?.kind === "message" ? last.files : [];
    expect(files).toEqual([
      { id: expect.any(String), kind: "voice-note", seconds: 300, href: expect.any(String) },
    ]);
    const voiceNote = { messageId: sent.ok ? sent.value.messageId : "", fileId: files[0]!.id };
    for (const party of [client, artisan]) {
      expect(await domain.conversations.file(party.actor, voiceNote)).toMatchObject({
        contentType: "audio/mp4",
      });
    }
    expect(await domain.conversations.file(stranger.actor, voiceNote)).toBeNull();
  });

  test("refuses a voice note over five minutes, and a voice note asking for payment off the platform", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { artisan, conversationId } = await engaged(given, domain);

    expect(
      await domain.conversations.send(artisan.actor, {
        conversationId,
        text: "",
        files: [new Blob([webmOpus(5 * 60 + 1)])],
      }),
    ).toEqual({
      ok: false,
      refusal: { reason: "too-long", message: "A voice note can be at most 5 minutes." },
    });

    contentReader.voiceNotesSay("Send it to account number 62812345678 and skip the fee.");
    expect(
      await domain.conversations.send(artisan.actor, {
        conversationId,
        text: "",
        files: [new Blob([webmOpus(20)])],
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "content" } });
  });

  test("takes a PDF of up to 10 MB, its text extracted and checked", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { artisan, client, conversationId } = await engaged(given, domain);

    const sent = await domain.conversations.send(client.actor, {
      conversationId,
      text: "The paint colours",
      files: [new Blob([await textPdf({ lines: ["Dulux Timeless, two coats"] })])],
    });

    expect(sent).toMatchObject({ ok: true, value: { state: "delivered" } });
    expect(contentReader.reads.at(-1)?.text).toContain("Dulux Timeless, two coats");
    const last = (await domain.conversations.view(artisan.actor, { conversationId }))!.items.at(-1);
    const files = last?.kind === "message" ? last.files : [];
    expect(files).toEqual([{ id: expect.any(String), kind: "pdf", href: expect.any(String) }]);
    expect(
      await domain.conversations.file(artisan.actor, {
        messageId: sent.ok ? sent.value.messageId : "",
        fileId: files[0]!.id,
      }),
    ).toMatchObject({
      contentType: "application/pdf",
    });

    expect(
      await domain.conversations.send(client.actor, {
        conversationId,
        text: "My invoice",
        files: [new Blob([await textPdf({ lines: ["Bank account 62812345678"] })])],
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "content" } });
    expect(
      await domain.conversations.send(client.actor, {
        conversationId,
        text: "The plans",
        files: [new Blob([paddedTo(PDF, 10 * 1024 * 1024 + 1)])],
      }),
    ).toEqual({
      ok: false,
      refusal: { reason: "too-large", message: "A file can be at most 10 MB." },
    });
  });

  test("takes no video", async () => {
    const { domain, given } = await createHarness();
    const { artisan, conversationId } = await engaged(given, domain);

    expect(
      await domain.conversations.send(artisan.actor, {
        conversationId,
        text: "",
        files: [new Blob([webmOpus(10, { video: true })])],
      }),
    ).toEqual({ ok: false, refusal: { reason: "video", message: "Video cannot be sent." } });
  });

  test("shows the Admin a Held voice note or PDF to decide it, with what was read from them", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const { client, conversationId } = await engaged(given, domain);
    harness.contentReader.force({ kind: "unsure", reason: "It may ask for cash." });
    harness.contentReader.voiceNotesSay("Bring cash on the day.");

    const sent = await domain.conversations.send(client.actor, {
      conversationId,
      text: "Listen",
      files: [new Blob([webmOpus(20)]), new Blob([await textPdf({ lines: ["Plans"] })])],
    });

    expect(sent).toMatchObject({ ok: true, value: { state: "held" } });
    const { id: itemId } = await preCheck(harness, admin);
    const item = await domain.queues.item(admin.actor, { itemId });
    expect(item).toMatchObject({
      tabs: [
        {
          label: "The message",
          blocks: [
            { kind: "text", text: "Listen" },
            {
              kind: "files",
              files: [
                { kind: "voice-note", label: "Voice note 1" },
                { kind: "pdf", label: "PDF 1" },
              ],
            },
          ],
        },
        {},
        {
          label: "Content check",
          blocks: [
            { kind: "text", text: "It may ask for cash." },
            { kind: "text", text: "Read from its files:\n\nBring cash on the day.\n\nPlans" },
          ],
        },
      ],
    });
    const viewed = (await domain.conversations.view(client.actor, { conversationId }))!.items.at(
      -1,
    );
    const file = viewed?.kind === "message" ? viewed.files[0]!.id : "";
    const messageId = sent.ok ? sent.value.messageId : "";
    expect(await domain.conversations.file(admin.actor, { messageId, fileId: file })).toMatchObject(
      {
        contentType: "audio/webm",
      },
    );
  });

  test("goes read-only once the Engagement is Completed, and its messages stay", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, conversationId, engagementId, jobId } = await engaged(given, domain);
    await domain.conversations.send(client.actor, { conversationId, text: "Thanks!" });
    await given.workStarted(client, engagementId);
    await given.markedComplete(artisan, engagementId);

    await domain.engagements.approve(client.actor, { engagementId });

    for (const party of [client, artisan]) {
      expect(await domain.conversations.view(party.actor, { conversationId })).toMatchObject({
        takesMessages: false,
        items: expect.arrayContaining([
          expect.objectContaining({ text: "Thanks!" }),
          expect.objectContaining({ kind: "event", event: "approved" }),
        ]),
      });
      expect(
        await domain.conversations.send(party.actor, { conversationId, text: "One more thing" }),
      ).toEqual({
        ok: false,
        refusal: { reason: "read-only", message: "This Conversation has ended." },
      });
    }
    expect(await domain.conversations.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({ conversationId, takesMessages: false }),
    ]);
  });
});

/** A Quote's fields, as the Artisan's form sends them. */
const QUOTE = {
  scope: "Prepare and paint two walls with two coats of washable white.",
  labour: "1500",
  materials: "500.00",
  materialsBy: "artisan",
  startOn: "2026-11-02",
  durationDays: 3,
  warranty: "Twelve months on peeling.",
} as const;

const HELD_TEXT = "Find me as paintbysipho, if you like.";

/** The smallest PDF a parser takes. */
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

type Talking = Awaited<ReturnType<typeof talking>>;

/** A Client's Open Job in Sea Point, an Artisan's Quote Sent on it, and their Conversation. */
async function talking(given: Harness["given"], domain: Harness["domain"]) {
  const artisan = await given.matchableArtisan({ name: "Sipho Dlamini" });
  const client = await given.client({ name: "Thandi Mokoena" });
  const jobId = await given.openJob(client);
  const quoteId = await given.sentQuote(artisan, jobId);
  const [conversation] = (await domain.conversations.forJob(client.actor, { jobId }))!;
  if (!conversation) throw new Error("Expected the Quote to open a Conversation");
  return { artisan, client, jobId, quoteId, conversationId: conversation.conversationId };
}

/** As `talking`, then the Client Hires the Quote: their Conversation is the Engagement's. */
async function engaged(given: Harness["given"], domain: Harness["domain"]) {
  const talk = await talking(given, domain);
  await given.hired(talk.client, talk.quoteId);
  return { ...talk, engagementId: await given.engagementOf(talk.client, talk.jobId) };
}

async function invite(
  domain: Harness["domain"],
  client: { actor: Actor },
  artisan: { actor: { accountId: string } },
  jobId: string,
) {
  const invited = await domain.invitations.invite(client.actor, {
    jobId,
    artisanId: artisan.actor.accountId,
  });
  if (!invited.ok) throw new Error(invited.refusal.message);
}

/** Sends a message the Content check Holds. */
async function sendHeld(harness: Harness, party: { actor: Actor }, conversationId: string) {
  harness.contentReader.force({ kind: "unsure", reason: "It may name a handle." });
  const sent = await harness.domain.conversations.send(party.actor, {
    conversationId,
    text: HELD_TEXT,
  });
  harness.contentReader.force({ kind: "clear" });
  if (!sent.ok) throw new Error(sent.refusal.message);
  return sent.value;
}

/** The one Pre-check waiting, as the Admin finds it on the home stream. */
async function preCheck({ domain }: Harness, admin: { actor: AdminActor }) {
  const home = await domain.queues.home(admin.actor, { queue: "pre-checks" });
  const [item, ...more] = home?.items ?? [];
  if (!item || more.length > 0) throw new Error("Expected one Pre-check waiting");
  return item;
}

/** The Admin's decision on the one Pre-check waiting. */
async function decide(
  harness: Harness,
  admin: { actor: AdminActor },
  decision: "release" | "refuse",
  reason?: string,
) {
  const { id } = await preCheck(harness, admin);
  const decided = await harness.domain.queues.decide(admin.actor, { itemId: id, decision, reason });
  if (!decided.ok) throw new Error(decided.refusal.message);
}

/** What the Account was told of messages on the Job. */
async function messageTells(domain: Harness["domain"], account: { actor: Actor }, jobId: string) {
  const notices = await domain.notices.list(account.actor);
  return notices.filter(
    (notice) => notice.link.startsWith(`/jobs/${jobId}`) && notice.event.includes("message"),
  );
}
