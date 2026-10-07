import { describe, expect, test } from "vitest";
import type { Actor, AdminActor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";

// Quotes (#124): an Artisan holding a Job Match or an Invitation sends one
// fixed-price Quote, which the Content check reads first. The Client compares
// the Quotes and may Decline one; the Artisan may revise or Withdraw it while
// it is Sent, and it Expires after 14 days. A Job stops at five Quotes.

describe("sending a Quote", () => {
  test("on a Job Match Sends it to the Client, with a Tell", async () => {
    const { domain, given, clock, mailer } = await createHarness();
    const artisan = await given.matchableArtisan({ name: "Sipho Dlamini" });
    const client = await given.client();
    const jobId = await given.openJob(client);

    const sent = await domain.quotes.send(artisan.actor, { jobId, ...QUOTE });

    expect(sent).toEqual({ ok: true, value: { quoteId: expect.any(String), state: "sent" } });
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({
        state: "sent",
        artisan: expect.objectContaining({ publicName: "Sipho Dlamini" }),
        scope: QUOTE.scope,
        labourCents: 150_000,
        materialsCents: 50_000,
        totalCents: 200_000,
        materialsBy: "artisan",
        startOn: "2026-11-02",
        durationDays: 3,
        warranty: QUOTE.warranty,
        sentAt: clock.now(),
      }),
    ]);
    expect(await toldOf(domain, client, jobId)).toEqual([
      expect.objectContaining({ title: "New Quote on Paint the lounge", link: `/jobs/${jobId}` }),
    ]);
    expect(mailer.sentTo(client.email).at(-1)).toMatchObject({
      subject: "New Quote on Paint the lounge",
    });
  });

  test.each([
    ["totals under R300", { labour: "250", materials: "49.99" }, "A Quote totals at least R300."],
    ["has no Labour", { labour: "0", materials: "500" }, "Labour must be above zero."],
    [
      "gives Labour in a form not rands",
      { labour: "R1,500.00" },
      "Give the Labour in rands, like 1500.00.",
    ],
    [
      "charges Materials the Client supplies",
      { materialsBy: "client" as const, materials: "100" },
      "Materials are zero when the Client supplies them.",
    ],
    ["starts before today", { startOn: "2026-10-04" }, "The start date has passed."],
    ["has no start date", { startOn: "" }, "Give the start date."],
    ["lasts no days", { durationDays: 0 }, "The duration is at least 1 day."],
    ["lasts over a year", { durationDays: 366 }, "The duration is at most 365 days."],
    ["lasts part of a day", { durationDays: 1.5 }, "Give the duration in whole days."],
    ["has no scope", { scope: "  " }, "Write the scope."],
  ])("is refused, with nothing sent, when it %s", async (_, change, message) => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);

    expect(await domain.quotes.send(artisan.actor, { jobId, ...QUOTE, ...change })).toEqual({
      ok: false,
      refusal: { reason: "invalid", message },
    });
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([]);
  });

  test("totals R300 exactly, a start date of today, a year at most, and no Warranty", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);

    const sent = await domain.quotes.send(artisan.actor, {
      jobId,
      ...QUOTE,
      labour: "300",
      materials: "0",
      materialsBy: "client",
      startOn: "2026-10-05",
      durationDays: "365",
      warranty: "",
    });

    expect(sent).toMatchObject({ ok: true });
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({
        totalCents: 30_000,
        materialsCents: 0,
        startOn: "2026-10-05",
        durationDays: 365,
        warranty: null,
      }),
    ]);
  });
});

describe("the Client's Quotes", () => {
  test("show each Artisan's record, their badges for the category, and the Payment with the Protection Fee", async () => {
    const { domain, given, clock } = await createHarness();
    const artisan = await given.matchableArtisan({
      name: "Sipho Dlamini",
      tradingName: "Sipho's Painting",
      categories: ["painting", "tiling"],
    });
    const client = await given.client();
    const jobId = await given.openJob(client);
    const quoteId = await given.sentQuote(artisan, jobId, {
      labour: "300",
      materials: "5.30",
      materialsBy: "both",
      warranty: null,
    });

    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      {
        quoteId,
        state: "sent",
        artisan: {
          artisanId: artisan.actor.accountId,
          publicName: "Sipho's Painting",
          reviews: { average: null, count: 0 },
          completed: 0,
          badges: [
            expect.objectContaining({ kind: "identity", name: "Identity verified" }),
            expect.objectContaining({ kind: "work-photos", name: "Work photos, Painting" }),
          ],
        },
        scope: QUOTE.scope,
        labourCents: 30_000,
        materialsCents: 530,
        totalCents: 30_530,
        materialsBy: "both",
        startOn: "2026-11-02",
        durationDays: 3,
        warranty: null,
        vatNumber: null,
        // 5% of R305.30 is R15.265, which rounds half up to R15.27.
        protectionFeeCents: 1_527,
        paymentCents: 32_057,
        startPassed: false,
        sentAt: clock.now(),
        expiresAt: new Date(clock.now().getTime() + 14 * DAY),
        revisedAt: null,
        endedAt: null,
      },
    ]);
    expect(await ownQuote(domain, artisan, jobId)).not.toHaveProperty("protectionFeeCents");
  });

  test("are the Client's only", async () => {
    const { domain, given } = await createHarness();
    const { artisan, jobId } = await quoted(given);
    const other = await given.client();

    expect(await domain.quotes.forJob(other.actor, { jobId })).toBeNull();
    expect(await domain.quotes.forJob(artisan.actor, { jobId })).toBeNull();
  });
});

describe("a VAT-registered Artisan", () => {
  test("states a VAT number, which their Quotes carry: their amounts include VAT", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);

    expect(
      await domain.accounts.setVatNumber(artisan.actor, { vatNumber: " 4123 456 789 " }),
    ).toEqual({ ok: true, value: {} });
    await given.sentQuote(artisan, jobId);

    expect((await domain.accounts.me(artisan.actor))?.vatNumber).toBe("4123456789");
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({ vatNumber: "4123456789" }),
    ]);
    expect(await ownQuote(domain, artisan, jobId)).toMatchObject({ vatNumber: "4123456789" });
  });

  test("who stops being one clears it, and their next revision carries none", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await domain.accounts.setVatNumber(artisan.actor, { vatNumber: "4123456789" });
    await given.sentQuote(artisan, jobId);

    expect(await domain.accounts.setVatNumber(artisan.actor, { vatNumber: "" })).toMatchObject({
      ok: true,
    });
    await domain.quotes.revise(artisan.actor, { jobId, ...QUOTE, labour: "1800" });

    expect((await domain.accounts.me(artisan.actor))?.vatNumber).toBeNull();
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({ labourCents: 180_000, vatNumber: null }),
    ]);
  });

  test("gives a VAT number as SARS issues it: ten digits starting with 4", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.artisan();
    const client = await given.client();

    for (const vatNumber of ["412345678", "5123456789", "41234567890", "4123-456-78"]) {
      expect(await domain.accounts.setVatNumber(artisan.actor, { vatNumber })).toEqual({
        ok: false,
        refusal: {
          reason: "invalid",
          message: "A VAT number is ten digits starting with 4, like 4123456789.",
        },
      });
    }
    expect(await domain.accounts.setVatNumber(client.actor, { vatNumber: "4123456789" })).toEqual({
      ok: false,
      refusal: { reason: "artisans-only", message: "Only an Artisan states a VAT number." },
    });
  });
});

describe("who may send a Quote", () => {
  test("an invited Artisan, on an Invite-only Job", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client, { matching: "invite-only" });
    await domain.invitations.invite(client.actor, { jobId, artisanId: artisan.actor.accountId });

    expect(await domain.quotes.send(artisan.actor, { jobId, ...QUOTE })).toMatchObject({
      ok: true,
      value: { state: "sent" },
    });
    expect(await domain.quotes.forJob(client.actor, { jobId })).toHaveLength(1);
  });

  test("not an Artisan holding neither a Job Match nor an Invitation, nor one who passed", async () => {
    const { domain, given } = await createHarness();
    const passed = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    const stranger = await given.matchableArtisan();
    await domain.matches.pass(passed.actor, { jobId });

    for (const artisan of [stranger, passed]) {
      expect(await domain.quotes.send(artisan.actor, { jobId, ...QUOTE })).toMatchObject({
        ok: false,
        refusal: { reason: "not-found" },
      });
    }
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([]);
  });

  test("not on a Job no longer Open", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await domain.jobs.close(client.actor, { jobId });

    expect(await domain.quotes.send(artisan.actor, { jobId, ...QUOTE })).toMatchObject({
      ok: false,
      refusal: { reason: "not-found" },
    });
  });

  test("once per Job", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await domain.quotes.send(artisan.actor, { jobId, ...QUOTE });

    expect(await domain.quotes.send(artisan.actor, { jobId, ...QUOTE })).toEqual({
      ok: false,
      refusal: {
        reason: "already-quoted",
        message: "You have Quoted on this Job already. Revise your Quote instead.",
      },
    });
    expect(await domain.quotes.forJob(client.actor, { jobId })).toHaveLength(1);
  });

  test("not an Artisan no longer verified for the Job's category", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await removeBadge(harness, "Work photos, Painting");

    expect(await domain.quotes.send(artisan.actor, { jobId, ...QUOTE })).toEqual({
      ok: false,
      refusal: {
        reason: "not-verified",
        message:
          "You can Quote only while every check Painting needs is current. See your Verification.",
      },
    });
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([]);
  });

  test("not a Client", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();
    const jobId = await given.openJob(client);

    expect(await domain.quotes.send(client.actor, { jobId, ...QUOTE })).toMatchObject({
      ok: false,
      refusal: { reason: "artisans-only" },
    });
  });
});

describe("the Content check", () => {
  test("refuses a sure hit with its reason, and nothing is sent", async () => {
    const { domain, given, contentReader } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    contentReader.force({ kind: "sure-hit", reason: "It asks to pay in cash." });

    expect(await domain.quotes.send(artisan.actor, { jobId, ...QUOTE })).toEqual({
      ok: false,
      refusal: { reason: "content", message: "It asks to pay in cash." },
    });
    expect(contentReader.reads.at(-1)?.text).toBe(`${QUOTE.scope}\n\n${QUOTE.warranty}`);
    expect(await ownQuote(domain, artisan, jobId)).toBeNull();
  });

  test("Holds an unsure Quote: not Sent, and only its Artisan sees it, being checked", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    const told = await domain.notices.list(client.actor);

    expect(await sendHeld(harness, artisan, jobId)).toMatchObject({ state: "held" });

    expect(await ownQuote(domain, artisan, jobId)).toMatchObject({
      state: "held",
      scope: QUOTE.scope,
      sentAt: null,
    });
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([]);
    expect(await domain.notices.list(client.actor)).toEqual(told);
    const { id: itemId } = await preCheck(harness, admin);
    expect(await domain.queues.item(admin.actor, { itemId })).toMatchObject({
      title: "Quote: Paint the lounge",
      tabs: [
        {
          label: "The Quote",
          blocks: expect.arrayContaining([
            { kind: "text", text: expect.stringContaining(QUOTE.scope) },
          ]),
        },
        { label: "The Job" },
        {
          label: "Content check",
          blocks: [{ kind: "text", text: "It may name a social handle." }],
        },
      ],
    });
  });

  test("a Held Quote the Admin releases is Sent then, and both are told", async () => {
    const harness = await createHarness();
    const { domain, given, clock } = harness;
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await sendHeld(harness, artisan, jobId);
    clock.advance({ hours: 5 });

    await decide(harness, admin, "release");

    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({ state: "sent", sentAt: clock.now() }),
    ]);
    expect(await toldOf(domain, client, jobId)).toEqual([
      expect.objectContaining({ title: "New Quote on Paint the lounge" }),
    ]);
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({ title: "Your Quote is checked and Sent" }),
    ]);
  });

  test("a Held Quote the Admin refuses shows its Artisan why, who may send another", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await sendHeld(harness, artisan, jobId);

    await decide(harness, admin, "refuse", "Leave out the handle.");

    expect(await ownQuote(domain, artisan, jobId)).toMatchObject({
      state: "refused",
      refused: { reason: "Leave out the handle." },
    });
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({ title: "Your Quote was refused" }),
    ]);
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([]);
    expect(await domain.quotes.send(artisan.actor, { jobId, ...QUOTE })).toMatchObject({
      ok: true,
      value: { state: "sent" },
    });
  });

  test("a Held Quote its Artisan withdraws leaves the Admin's queue, and another may be sent", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await sendHeld(harness, artisan, jobId);

    expect(await domain.quotes.withdrawHeld(artisan.actor, { jobId })).toEqual({
      ok: true,
      value: {},
    });

    expect(await ownQuote(domain, artisan, jobId)).toBeNull();
    expect((await domain.queues.home(admin.actor, { queue: "pre-checks" }))?.items).toEqual([]);
    expect(await domain.quotes.send(artisan.actor, { jobId, ...QUOTE })).toMatchObject({
      ok: true,
    });
  });

  test("a Held Quote released once its Artisan is no longer verified is not Sent", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await sendHeld(harness, artisan, jobId);
    await removeBadge(harness, "Work photos, Painting");

    await decide(harness, admin, "release");

    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([]);
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({
        title: "Your Quote is checked, but you are no longer verified for Painting",
      }),
    ]);
  });

  test("a Held Quote released once its start date has passed is not Sent", async () => {
    const harness = await createHarness();
    const { domain, given, clock } = harness;
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client, { matching: "invite-only" });
    await domain.invitations.invite(client.actor, { jobId, artisanId: artisan.actor.accountId });
    harness.contentReader.force({ kind: "unsure", reason: "It may name a social handle." });
    await domain.quotes.send(artisan.actor, { jobId, ...QUOTE, startOn: "2026-10-06" });
    clock.advance({ days: 2 });

    await decide(harness, admin, "release");

    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([]);
    expect(await ownQuote(domain, artisan, jobId)).toBeNull();
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({ title: "Your Quote is checked, but its start date has passed" }),
    ]);
  });

  test("a Held Quote released once the Job has Expired is not Sent, and its Artisan is told so", async () => {
    const harness = await createHarness();
    const { domain, given, clock } = harness;
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await sendHeld(harness, artisan, jobId);
    clock.advance({ days: 14 });
    await domain.system.runDueClocks();

    await decide(harness, admin, "release");

    expect(await ownQuote(domain, artisan, jobId)).toBeNull();
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([]);
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({ title: "Your Quote is checked, but the Job takes no more Quotes" }),
    ]);
  });
});

describe("a Sent Quote", () => {
  test("its Artisan Withdraws, and the Client is told", async () => {
    const { domain, given, clock } = await createHarness();
    const { artisan, client, jobId } = await quoted(given);
    clock.advance({ days: 1 });

    expect(await domain.quotes.withdraw(artisan.actor, { jobId })).toEqual({ ok: true, value: {} });

    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({ state: "withdrawn", endedAt: clock.now() }),
    ]);
    expect(await ownQuote(domain, artisan, jobId)).toMatchObject({ state: "withdrawn" });
    expect((await toldOf(domain, client, jobId)).map((notice) => notice.title)).toEqual([
      "A Quote was withdrawn: Paint the lounge",
      "New Quote on Paint the lounge",
    ]);
    expect(await domain.quotes.withdraw(artisan.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: { reason: "not-sent" },
    });
  });

  test("the Client Declines, and its Artisan is told", async () => {
    const { domain, given } = await createHarness();
    const { artisan, client, jobId, quoteId } = await quoted(given);

    expect(await domain.quotes.decline(client.actor, { quoteId })).toEqual({ ok: true, value: {} });

    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({ state: "declined" }),
    ]);
    expect(await ownQuote(domain, artisan, jobId)).toMatchObject({ state: "declined" });
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({ title: "Your Quote was declined: Paint the lounge" }),
    ]);
    expect(await domain.quotes.decline(client.actor, { quoteId })).toMatchObject({
      ok: false,
      refusal: { reason: "not-sent" },
    });
  });

  test("only the Job's Client Declines", async () => {
    const { domain, given } = await createHarness();
    const { artisan, quoteId } = await quoted(given);
    const other = await given.client();

    for (const actor of [other.actor, artisan.actor]) {
      expect(await domain.quotes.decline(actor, { quoteId })).toMatchObject({
        ok: false,
        refusal: { reason: "not-found" },
      });
    }
  });

  test("Expires 14 days after it was Sent, and its Artisan is told", async () => {
    const { domain, given, clock } = await createHarness();
    const { artisan, client, jobId } = await quoted(given);
    const sentAt = clock.now();

    clock.advance({ days: 13, hours: 23, minutes: 59 });
    await domain.system.runDueClocks();
    expect(await ownQuote(domain, artisan, jobId)).toMatchObject({ state: "sent" });

    clock.advance({ minutes: 1 });
    await domain.system.runDueClocks();
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({
        state: "expired",
        sentAt,
        expiresAt: clock.now(),
        endedAt: clock.now(),
      }),
    ]);
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({ title: "Your Quote expired: Paint the lounge" }),
    ]);
  });

  test("does not Expire once Withdrawn", async () => {
    const { domain, given, clock } = await createHarness();
    const { artisan, jobId } = await quoted(given);
    await domain.quotes.withdraw(artisan.actor, { jobId });

    clock.advance({ days: 14 });
    await domain.system.runDueClocks();

    expect(await ownQuote(domain, artisan, jobId)).toMatchObject({ state: "withdrawn" });
    expect(await toldOf(domain, artisan, jobId)).toEqual([]);
  });

  test("is Declined when the Client closes the Job, and its Artisan told", async () => {
    const { domain, given } = await createHarness();
    const { artisan, client, jobId } = await quoted(given);

    expect(await domain.jobs.close(client.actor, { jobId })).toMatchObject({ ok: true });

    expect(await ownQuote(domain, artisan, jobId)).toMatchObject({ state: "declined" });
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({ title: "Your Quote was declined: Paint the lounge" }),
    ]);
  });

  test("stays Sent when the Job Expires, and its Artisan is told the Job expired", async () => {
    const { domain, given, clock } = await createHarness();
    const { artisan, client, jobId } = await quoted(given);
    clock.advance({ days: 1 });
    // One sent a day later, which Expires a day after the Job.
    const later = await given.matchableArtisan();
    await domain.invitations.invite(client.actor, { jobId, artisanId: later.actor.accountId });
    await domain.quotes.send(later.actor, { jobId, ...QUOTE });

    clock.advance({ days: 13 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.state).toBe("expired");
    expect(await ownQuote(domain, later, jobId)).toMatchObject({ state: "sent" });
    expect(await toldOf(domain, later, jobId)).toEqual([
      expect.objectContaining({ title: "A Job you Quoted on expired: Paint the lounge" }),
    ]);
    // The first Quote Expired in the same run, so its Artisan was told that instead.
    expect((await toldOf(domain, artisan, jobId)).map((notice) => notice.title)).toEqual([
      "Your Quote expired: Paint the lounge",
    ]);
  });
});

describe("revising a Sent Quote", () => {
  test("shows the new Quote at once, tells the Client, and keeps its 14 days", async () => {
    const { domain, given, clock } = await createHarness();
    const { artisan, client, jobId } = await quoted(given);
    const sentAt = clock.now();
    clock.advance({ days: 2 });

    expect(
      await domain.quotes.revise(artisan.actor, {
        jobId,
        ...QUOTE,
        labour: "1800",
        startOn: "2026-11-09",
      }),
    ).toEqual({ ok: true, value: { revision: "applied" } });

    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({
        state: "sent",
        labourCents: 180_000,
        totalCents: 230_000,
        startOn: "2026-11-09",
        sentAt,
        revisedAt: clock.now(),
        expiresAt: new Date(sentAt.getTime() + 14 * DAY),
      }),
    ]);
    expect((await toldOf(domain, client, jobId)).map((notice) => notice.title)).toEqual([
      "A Quote was revised: Paint the lounge",
      "New Quote on Paint the lounge",
    ]);
    clock.set(new Date(sentAt.getTime() + 14 * DAY));
    await domain.system.runDueClocks();
    expect(await ownQuote(domain, artisan, jobId)).toMatchObject({ state: "expired" });
  });

  test("is refused by the same rules as sending, and when nothing changed", async () => {
    const { domain, given } = await createHarness();
    const { artisan, jobId } = await quoted(given);

    expect(
      await domain.quotes.revise(artisan.actor, { jobId, ...QUOTE, labour: "100", materials: "0" }),
    ).toMatchObject({ ok: false, refusal: { message: "A Quote totals at least R300." } });
    expect(
      await domain.quotes.revise(artisan.actor, { jobId, ...QUOTE, startOn: "2026-10-01" }),
    ).toMatchObject({ ok: false, refusal: { message: "The start date has passed." } });
    expect(await domain.quotes.revise(artisan.actor, { jobId, ...QUOTE })).toMatchObject({
      ok: false,
      refusal: { reason: "unchanged" },
    });
  });

  test("is refused once it is no longer Sent", async () => {
    const { domain, given } = await createHarness();
    const { artisan, jobId } = await quoted(given);
    await domain.quotes.withdraw(artisan.actor, { jobId });

    expect(
      await domain.quotes.revise(artisan.actor, { jobId, ...QUOTE, labour: "1800" }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-sent" } });
  });

  test("Held, shows the Quote as it was to the Client until the Admin releases it", async () => {
    const harness = await createHarness();
    const { domain, given, contentReader, clock } = harness;
    const admin = await given.admin();
    const { artisan, client, jobId } = await quoted(given);
    contentReader.force({ kind: "unsure", reason: "It may name a social handle." });

    expect(await domain.quotes.revise(artisan.actor, { jobId, ...QUOTE, labour: "1800" })).toEqual({
      ok: true,
      value: { revision: "being-checked" },
    });

    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({ labourCents: 150_000, revisedAt: null }),
    ]);
    expect(await ownQuote(domain, artisan, jobId)).toMatchObject({
      labourCents: 150_000,
      revision: { beingChecked: expect.objectContaining({ labourCents: 180_000 }), refused: null },
    });
    expect(
      await domain.quotes.revise(artisan.actor, { jobId, ...QUOTE, labour: "1900" }),
    ).toMatchObject({ ok: false, refusal: { reason: "being-checked" } });
    clock.advance({ hours: 1 });

    await decide(harness, admin, "release");

    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({ labourCents: 180_000, revisedAt: expect.any(Date) }),
    ]);
    expect((await toldOf(domain, client, jobId)).map((notice) => notice.title)).toEqual([
      "A Quote was revised: Paint the lounge",
      "New Quote on Paint the lounge",
    ]);
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({ title: "Your Quote revision is checked and shown" }),
    ]);
  });

  test("Held and refused, shows its Artisan why, and the Quote stays as it was", async () => {
    const harness = await createHarness();
    const { domain, given, contentReader } = harness;
    const admin = await given.admin();
    const { artisan, client, jobId } = await quoted(given);
    contentReader.force({ kind: "unsure", reason: "It may name a social handle." });
    await domain.quotes.revise(artisan.actor, { jobId, ...QUOTE, labour: "1800" });

    await decide(harness, admin, "refuse", "Leave out the handle.");

    expect(await ownQuote(domain, artisan, jobId)).toMatchObject({
      labourCents: 150_000,
      revision: {
        beingChecked: null,
        refused: expect.objectContaining({ labourCents: 180_000, reason: "Leave out the handle." }),
      },
    });
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({ labourCents: 150_000, revisedAt: null }),
    ]);
  });

  test("Held, is not shown once its start date has passed", async () => {
    const harness = await createHarness();
    const { domain, given, contentReader, clock } = harness;
    const admin = await given.admin();
    const { artisan, client, jobId } = await quoted(given);
    contentReader.force({ kind: "unsure", reason: "It may name a social handle." });
    await domain.quotes.revise(artisan.actor, { jobId, ...QUOTE, startOn: "2026-10-06" });
    clock.advance({ days: 2 });

    await decide(harness, admin, "release");

    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({ startOn: "2026-11-02", revisedAt: null }),
    ]);
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({
        title: "Your Quote revision is checked, but its start date has passed",
      }),
    ]);
  });

  test("needs no Verification, which is asked at sending and at Hire", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const { artisan, client, jobId } = await quoted(given);
    await removeBadge(harness, "Work photos, Painting");

    expect(
      await domain.quotes.revise(artisan.actor, { jobId, ...QUOTE, labour: "1800" }),
    ).toMatchObject({ ok: true, value: { revision: "applied" } });
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({ labourCents: 180_000 }),
    ]);
  });

  test("Held, may be withdrawn by its Artisan", async () => {
    const harness = await createHarness();
    const { domain, given, contentReader } = harness;
    const admin = await given.admin();
    const { artisan, jobId } = await quoted(given);
    contentReader.force({ kind: "unsure", reason: "It may name a social handle." });
    await domain.quotes.revise(artisan.actor, { jobId, ...QUOTE, labour: "1800" });

    expect(await domain.quotes.withdrawHeld(artisan.actor, { jobId })).toEqual({
      ok: true,
      value: {},
    });

    expect(await ownQuote(domain, artisan, jobId)).toMatchObject({
      state: "sent",
      revision: { beingChecked: null, refused: null },
    });
    expect((await domain.queues.home(admin.actor, { queue: "pre-checks" }))?.items).toEqual([]);
  });

  test("Held, is not shown once the Quote is Withdrawn", async () => {
    const harness = await createHarness();
    const { domain, given, contentReader } = harness;
    const admin = await given.admin();
    const { artisan, client, jobId } = await quoted(given);
    contentReader.force({ kind: "unsure", reason: "It may name a social handle." });
    await domain.quotes.revise(artisan.actor, { jobId, ...QUOTE, labour: "1800" });

    await domain.quotes.withdraw(artisan.actor, { jobId });

    expect((await domain.queues.home(admin.actor, { queue: "pre-checks" }))?.items).toEqual([]);
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({ state: "withdrawn", labourCents: 150_000 }),
    ]);
  });
});

describe("at five Quotes", () => {
  test("a Job takes no more, Declined and Withdrawn ones counting", async () => {
    // An Expired one counts too, but a Quote lasts as long as an Open Job.
    const { domain, given } = await createHarness();
    const artisans = await many(6, () => given.matchableArtisan());
    const client = await given.client();
    const jobId = await given.openJob(client);
    const [first, second, ...rest] = artisans;
    const sixth = rest.pop()!;
    const declined = await given.sentQuote(first!, jobId);
    await domain.quotes.decline(client.actor, { quoteId: declined });
    await given.sentQuote(second!, jobId);
    await domain.quotes.withdraw(second!.actor, { jobId });
    for (const artisan of rest.slice(0, 2)) await given.sentQuote(artisan, jobId);
    expect(await viewOf(domain, sixth, jobId)).toMatchObject({ takesQuotes: true });
    await given.sentQuote(rest[2]!, jobId);

    expect(await domain.quotes.send(sixth.actor, { jobId, ...QUOTE })).toEqual({
      ok: false,
      refusal: { reason: "full", message: "This Job has five Quotes and takes no more." },
    });
    expect((await domain.quotes.forJob(client.actor, { jobId }))!.map((q) => q.state)).toEqual([
      "declined",
      "withdrawn",
      "sent",
      "sent",
      "sent",
    ]);
    expect(await viewOf(domain, sixth, jobId)).toMatchObject({ takesQuotes: false });
    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ takesQuotes: false });
  });

  test("a Held Quote takes no slot, and is not Sent once five others are", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisans = await many(6, () => given.matchableArtisan());
    const client = await given.client();
    const jobId = await given.openJob(client);
    const [held, ...others] = artisans;
    await sendHeld(harness, held!, jobId);

    for (const artisan of others) await given.sentQuote(artisan, jobId);
    await decide(harness, admin, "release");

    expect(await domain.quotes.forJob(client.actor, { jobId })).toHaveLength(5);
    expect(await ownQuote(domain, held!, jobId)).toBeNull();
    expect(await toldOf(domain, held!, jobId)).toEqual([
      expect.objectContaining({ title: "Your Quote is checked, but the Job takes no more Quotes" }),
    ]);
  });

  test("a Job gets no further Batch", async () => {
    const { domain, given, clock } = await createHarness();
    const artisans = await many(11, () => given.matchableArtisan(), clock);
    const client = await given.client();
    const jobId = await given.openJob(client);
    for (const artisan of artisans.slice(0, 5)) await given.sentQuote(artisan, jobId);

    clock.advance({ days: 1 });
    await domain.system.runDueClocks();

    expect(await domain.matches.mine(artisans[10]!.actor)).toEqual([]);
  });

  test("a Job takes no Invitation", async () => {
    const { domain, given } = await createHarness();
    const artisans = await many(5, () => given.matchableArtisan());
    const client = await given.client();
    const jobId = await given.openJob(client);
    for (const artisan of artisans) await given.sentQuote(artisan, jobId);
    const later = await given.matchableArtisan();

    expect(
      await domain.invitations.invite(client.actor, { jobId, artisanId: later.actor.accountId }),
    ).toEqual({
      ok: false,
      refusal: { reason: "full", message: "This Job has five Quotes and takes no more." },
    });
    expect(await domain.invitations.mine(later.actor)).toEqual([]);
  });

  test("a Renewed Job counts its Quotes from zero, and its Sent ones stay Sent", async () => {
    const { domain, given, clock } = await createHarness();
    const artisans = await many(6, () => given.matchableArtisan());
    const client = await given.client();
    const jobId = await given.openJob(client);
    clock.advance({ days: 1 });
    for (const artisan of artisans.slice(0, 5)) await given.sentQuote(artisan, jobId);
    clock.advance({ days: 13 });
    await domain.system.runDueClocks();

    expect(await domain.jobs.renew(client.actor, { jobId })).toMatchObject({ ok: true });

    expect(
      (await domain.quotes.forJob(client.actor, { jobId }))!.every((q) => q.state === "sent"),
    ).toBe(true);
    expect(await domain.quotes.send(artisans[5]!.actor, { jobId, ...QUOTE })).toMatchObject({
      ok: true,
    });
  });
});

describe("an Artisan who has Quoted", () => {
  test("finds the Job among their Quotes, no longer among Job Matches, and cannot pass it", async () => {
    const harness = await createHarness();
    const { domain, given, clock } = harness;
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const matched = await given.openJob(client);
    const held = await given.openJob(client, { title: "Paint the kitchen" });
    await given.sentQuote(artisan, matched);
    clock.advance({ hours: 1 });
    await sendHeld(harness, artisan, held);

    expect(await domain.matches.mine(artisan.actor)).toEqual([]);
    expect(await domain.quotes.mine(artisan.actor)).toEqual([
      expect.objectContaining({ jobId: held, title: "Paint the kitchen", state: "held" }),
      expect.objectContaining({
        jobId: matched,
        title: "Paint the lounge",
        region: "Table Bay",
        state: "sent",
        totalCents: 200_000,
      }),
    ]);
    expect(await domain.matches.pass(artisan.actor, { jobId: matched })).toMatchObject({
      ok: false,
      refusal: { reason: "not-found" },
    });
  });

  test("finds an Invitation they Quoted on among their Quotes, and cannot pass it", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client, { matching: "invite-only" });
    await domain.invitations.invite(client.actor, { jobId, artisanId: artisan.actor.accountId });
    await given.sentQuote(artisan, jobId);

    expect(await domain.invitations.mine(artisan.actor)).toEqual([]);
    expect(await domain.quotes.mine(artisan.actor)).toEqual([
      expect.objectContaining({ jobId, state: "sent" }),
    ]);
    expect(await domain.invitations.pass(artisan.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: { reason: "not-found" },
    });
  });

  test("sees the Job and its photos once it is closed, and no longer among their Quotes", async () => {
    const { domain, given } = await createHarness();
    const { artisan, client, jobId } = await quoted(given);
    await domain.jobs.close(client.actor, { jobId });

    const job = await viewOf(domain, artisan, jobId);

    expect(job).toMatchObject({ state: "closed", quote: { state: "declined" } });
    expect(
      await domain.jobs.photo(artisan.actor, { jobId, photoId: job!.photos[0]!.id }),
    ).not.toBeNull();
    expect(await domain.quotes.mine(artisan.actor)).toEqual([]);
  });

  test("is marked Quoted on the Client's invite list, from Sent on", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const sent = await given.matchableArtisan({ name: "Anele Botha" });
    const held = await given.matchableArtisan({ name: "Bongani Zulu" });
    const invited = await given.matchableArtisan({ name: "Chris Adams" });
    const client = await given.client();
    const jobId = await given.openJob(client);
    await given.sentQuote(sent, jobId);
    await sendHeld(harness, held, jobId);
    await domain.invitations.invite(client.actor, { jobId, artisanId: invited.actor.accountId });

    const list = await domain.invitations.list(client.actor, { jobId });

    expect(list!.map(({ publicName, mark }) => ({ publicName, mark }))).toEqual([
      { publicName: "Anele Botha", mark: "quoted" },
      { publicName: "Bongani Zulu", mark: null },
      { publicName: "Chris Adams", mark: "invited" },
    ]);
  });
});

describe("the first Quote", () => {
  test("locks the Job's edits, and a Held one does not", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const artisans = await many(2, () => given.matchableArtisan());
    const client = await given.client();
    const jobId = await given.openJob(client);
    await sendHeld(harness, artisans[0]!, jobId);
    expect((await domain.jobs.view(client.actor, { jobId }))?.editable).toBe(true);

    await given.sentQuote(artisans[1]!, jobId);

    expect((await domain.jobs.view(client.actor, { jobId }))?.editable).toBe(false);
    expect(await editTitle(domain, client, jobId, "Paint the whole lounge")).toEqual({
      ok: false,
      refusal: {
        reason: "not-editable",
        message: "A Job that has had a Quote cannot be edited.",
      },
    });
  });

  test("leaves an edit Held before it unshown, once the Admin releases it", async () => {
    const harness = await createHarness();
    const { domain, given, contentReader } = harness;
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    contentReader.force({ kind: "unsure", reason: "It may name a social handle." });
    await editTitle(domain, client, jobId, "Paint the whole lounge");
    contentReader.force({ kind: "clear" });
    await given.sentQuote(artisan, jobId);

    await decide(harness, admin, "release");

    expect((await domain.jobs.view(client.actor, { jobId }))?.title).toBe("Paint the lounge");
    expect((await viewOf(domain, artisan, jobId))?.title).toBe("Paint the lounge");
  });
});

describe("closing a Job with a Held Quote", () => {
  test("takes the Quote out of the Admin's queue, and it is not Sent", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await sendHeld(harness, artisan, jobId);

    expect(await domain.jobs.close(client.actor, { jobId })).toMatchObject({ ok: true });

    expect((await domain.queues.home(admin.actor, { queue: "pre-checks" }))?.items).toEqual([]);
    expect(await ownQuote(domain, artisan, jobId)).toBeNull();
    expect(await toldOf(domain, artisan, jobId)).toEqual([]);
  });
});

const DAY = 24 * 60 * 60 * 1000;

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

/** An Open Job its Client posted, and an Artisan's Quote on it from a Job Match. */
async function quoted(given: Harness["given"]) {
  const artisan = await given.matchableArtisan();
  const client = await given.client();
  const jobId = await given.openJob(client);
  const quoteId = await given.sentQuote(artisan, jobId);
  return { artisan, client, jobId, quoteId };
}

/** The Client changes the Job's title and nothing else. */
async function editTitle(
  domain: Harness["domain"],
  client: { actor: Actor },
  jobId: string,
  title: string,
) {
  const job = (await domain.jobs.view(client.actor, { jobId }))!;
  return domain.jobs.edit(client.actor, {
    jobId,
    title,
    description: job.description,
    siteType: job.siteType!,
    preferredStart: job.preferredStart,
    keep: job.photos.map((each) => each.id),
  });
}

/** This many made one after another, a minute apart if a clock is given. */
async function many<T>(count: number, make: () => Promise<T>, clock?: Harness["clock"]) {
  const made: T[] = [];
  for (let index = 0; index < count; index += 1) {
    made.push(await make());
    clock?.advance({ minutes: 1 });
  }
  return made;
}

async function viewOf(domain: Harness["domain"], artisan: { actor: Actor }, jobId: string) {
  return domain.jobs.viewAsArtisan(artisan.actor, { jobId });
}

/** Sends the default Quote, which the Content check Holds. */
async function sendHeld(harness: Harness, artisan: { actor: Actor }, jobId: string) {
  harness.contentReader.force({ kind: "unsure", reason: "It may name a social handle." });
  const sent = await harness.domain.quotes.send(artisan.actor, { jobId, ...QUOTE });
  harness.contentReader.force({ kind: "clear" });
  if (!sent.ok) throw new Error(sent.refusal.message);
  return sent.value;
}

/** The Artisan's own Quote, as they see it on the Job page. */
async function ownQuote(domain: Harness["domain"], artisan: { actor: Actor }, jobId: string) {
  return (await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.quote ?? null;
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

/** The Admin removes the one Artisan's badge of this title, as if found false. */
async function removeBadge({ domain, given }: Harness, title: string) {
  const admin = await given.admin();
  const itemId = (await domain.admins.auditLog(admin.actor))!.rows.find(
    (row) => row.action === "queue.row-decided",
  )!.subjectId!;
  const row = (await domain.queues.item(admin.actor, { itemId }))?.rows?.find(
    (each) => each.title === title,
  );
  const removed = await domain.queues.decideRow(admin.actor, {
    itemId,
    rowId: row!.id,
    decision: "remove",
    reason: "These photos are from a catalogue.",
  });
  if (!removed.ok) throw new Error(removed.refusal.message);
}

/** What the Account was told of Quotes on the Job. */
async function toldOf(domain: Harness["domain"], account: { actor: Actor }, jobId: string) {
  const notices = await domain.notices.list(account.actor);
  return notices.filter(
    (notice) => notice.link === `/jobs/${jobId}` && notice.event.includes("quote"),
  );
}
