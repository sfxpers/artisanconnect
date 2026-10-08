import { describe, expect, test } from "vitest";
import { visitor, type AdminActor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";
import { photo } from "../support/verification";

// Reports (#136): any signed-in Account Reports a Job, Quote, message, or
// Artisan Profile it can see, with one fixed reason and an optional note.
// Repeats fold into one queue item with a count. The reporter is told it was
// received, never the outcome; the reported Account only if something
// happens to it, never who reported.

/** The Reports waiting for the Admin. */
async function reportItems(domain: Harness["domain"], admin: { actor: AdminActor }) {
  return (await domain.queues.home(admin.actor, { queue: "reports" }))?.items ?? [];
}

/** A Client's Open Job, offered to two Artisans by its first Batch. */
async function offeredJob(given: Harness["given"]) {
  const admin = await given.admin();
  const artisan = await given.matchableArtisan();
  const another = await given.matchableArtisan({ name: "Lerato Khumalo" });
  const client = await given.client({ name: "Thandi Mokoena" });
  const jobId = await given.openJob(client, { title: "Paint the lounge" });
  return { admin, artisan, another, client, jobId };
}

describe("reporting a Job", () => {
  test("puts it in the Reports queue, and tells the reporter it was received", async () => {
    const { domain, given } = await createHarness();
    const { admin, artisan, client, jobId } = await offeredJob(given);

    const reported = await domain.reports.report(artisan.actor, {
      about: { kind: "job", id: jobId },
      reason: "contact-or-payment",
      note: "The photo shows a phone number.",
    });

    expect(reported).toEqual({ ok: true, value: {} });
    expect(await reportItems(domain, admin)).toEqual([
      expect.objectContaining({ queue: "reports", title: "Report of a Job: Paint the lounge" }),
    ]);
    expect(await domain.notices.list(artisan.actor)).toContainEqual(
      expect.objectContaining({
        event: "report.received",
        title: "Your Report was received: Paint the lounge",
      }),
    );
    expect(
      (await domain.notices.list(client.actor)).filter((notice) =>
        notice.event.startsWith("report"),
      ),
    ).toEqual([]);
  });
});

describe("Reports of one thing", () => {
  test("are one per reporter", async () => {
    const { domain, given } = await createHarness();
    const { artisan, jobId } = await offeredJob(given);
    const about = { kind: "job" as const, id: jobId };
    await domain.reports.report(artisan.actor, { about, reason: "other" });

    expect(await domain.reports.report(artisan.actor, { about, reason: "leaving" })).toEqual({
      ok: false,
      refusal: { reason: "already-reported", message: "You have Reported this already." },
    });
    expect(await domain.reports.made(artisan.actor, { about })).toBe(true);
  });

  test("fold into one queue item with a count", async () => {
    const { domain, given } = await createHarness();
    const { admin, artisan, another, jobId } = await offeredJob(given);
    const about = { kind: "job" as const, id: jobId };

    await domain.reports.report(artisan.actor, { about, reason: "contact-or-payment" });
    await domain.reports.report(another.actor, {
      about,
      reason: "fake-or-misleading",
      note: "No such house.",
    });

    const items = await reportItems(domain, admin);
    expect(items).toHaveLength(1);
    const item = await domain.queues.item(admin.actor, { itemId: items[0]!.id });
    expect(item?.tabs[0]).toMatchObject({
      label: "Reports",
      blocks: [
        { kind: "facts", facts: [{ label: "Reports", value: "2" }] },
        { kind: "text", text: expect.stringContaining("Contact or payment details") },
        { kind: "text", text: expect.stringMatching(/Fake or misleading\n“No such house.”/) },
      ],
    });
  });

  test("open a new item once the last is decided", async () => {
    const { domain, given } = await createHarness();
    const { admin, artisan, another, jobId } = await offeredJob(given);
    const about = { kind: "job" as const, id: jobId };
    await domain.reports.report(artisan.actor, { about, reason: "other" });
    const [first] = await reportItems(domain, admin);
    await domain.queues.decide(admin.actor, { itemId: first!.id, decision: "dismiss" });

    await domain.reports.report(another.actor, { about, reason: "other" });

    const items = await reportItems(domain, admin);
    expect(items).toHaveLength(1);
    expect(items[0]!.id).not.toBe(first!.id);
  });
});

describe("who may Report", () => {
  test("only an Account that can see the thing, and never its own", async () => {
    const { domain, given } = await createHarness();
    const { client, jobId } = await offeredJob(given);
    const notOffered = await given.verifiedArtisan({ categories: ["plumbing"] });
    const about = { kind: "job" as const, id: jobId };

    expect(await domain.reports.report(visitor, { about, reason: "other" })).toMatchObject({
      ok: false,
      refusal: { reason: "sign-in-required" },
    });
    expect(await domain.reports.report(notOffered.actor, { about, reason: "other" })).toMatchObject(
      {
        ok: false,
        refusal: { reason: "not-found" },
      },
    );
    expect(await domain.reports.report(client.actor, { about, reason: "other" })).toMatchObject({
      ok: false,
      refusal: { reason: "own" },
    });
  });

  test("with one of the fixed reasons", async () => {
    const { domain, given } = await createHarness();
    const { artisan, jobId } = await offeredJob(given);

    expect(
      await domain.reports.report(artisan.actor, {
        about: { kind: "job", id: jobId },
        reason: "spam",
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "invalid" } });
  });
});

describe("a Report's note", () => {
  test("is refused on a sure hit, with the reason, and nothing reaches the Admin", async () => {
    const { domain, given } = await createHarness();
    const { admin, artisan, jobId } = await offeredJob(given);

    const reported = await domain.reports.report(artisan.actor, {
      about: { kind: "job", id: jobId },
      reason: "contact-or-payment",
      note: "Call him on 082 555 1234.",
    });

    expect(reported).toMatchObject({ ok: false, refusal: { reason: "content" } });
    expect(await reportItems(domain, admin)).toEqual([]);
  });

  test("goes to the Admin when the Content check is unsure, with what it made of it", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { admin, artisan, jobId } = await offeredJob(given);
    contentReader.force({ kind: "unsure", reason: "A spelled-out number?" });

    const reported = await domain.reports.report(artisan.actor, {
      about: { kind: "job", id: jobId },
      reason: "contact-or-payment",
      note: "He wrote zero eight two in the photo.",
    });

    expect(reported).toEqual({ ok: true, value: {} });
    const [item] = await reportItems(domain, admin);
    const view = await domain.queues.item(admin.actor, { itemId: item!.id });
    expect(view?.tabs[0]).toMatchObject({
      blocks: expect.arrayContaining([
        {
          kind: "text",
          text: expect.stringContaining(
            "The Content check was unsure of the note: A spelled-out number?",
          ),
        },
      ]),
    });
  });
});

describe("reporting a Quote, a message, or a Profile", () => {
  test("a Client Reports a Quote Sent on their Job", async () => {
    const { domain, given } = await createHarness();
    const { admin, artisan, client, jobId } = await offeredJob(given);
    const quoteId = await given.sentQuote(artisan, jobId);

    const reported = await domain.reports.report(client.actor, {
      about: { kind: "quote", id: quoteId },
      reason: "leaving",
    });

    expect(reported).toEqual({ ok: true, value: {} });
    expect(await reportItems(domain, admin)).toEqual([
      expect.objectContaining({ title: "Report of a Quote: Paint the lounge" }),
    ]);
  });

  test("the other party Reports a message delivered to them, never their own", async () => {
    const { domain, given } = await createHarness();
    const { admin, artisan, client, jobId } = await offeredJob(given);
    await given.sentQuote(artisan, jobId);
    const [conversation] = (await domain.conversations.forJob(client.actor, { jobId })) ?? [];
    const sent = await domain.conversations.send(artisan.actor, {
      conversationId: conversation!.conversationId,
      text: "Let us meet first, off the app.",
    });
    if (!sent.ok) throw new Error(sent.refusal.message);
    const about = { kind: "message" as const, id: sent.value.messageId };

    expect(await domain.reports.report(artisan.actor, { about, reason: "leaving" })).toMatchObject({
      ok: false,
      refusal: { reason: "own" },
    });
    expect(await domain.reports.report(client.actor, { about, reason: "leaving" })).toEqual({
      ok: true,
      value: {},
    });
    expect(await reportItems(domain, admin)).toEqual([
      expect.objectContaining({ title: "Report of a message: Paint the lounge" }),
    ]);
  });

  test("any signed-in Account Reports an Artisan's Profile", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.verifiedArtisan({ name: "Sipho Dlamini" });
    const client = await given.client();

    const reported = await domain.reports.report(client.actor, {
      about: { kind: "profile", id: artisan.actor.accountId },
      reason: "fake-or-misleading",
    });

    expect(reported).toEqual({ ok: true, value: {} });
    expect(await reportItems(domain, admin)).toEqual([
      expect.objectContaining({ title: "Report of a Profile: Sipho Dlamini" }),
    ]);
  });
});

/** The Client Reports a message the Artisan sent them; the Report's queue item. */
async function reportedMessage(
  domain: Harness["domain"],
  given: Harness["given"],
  text = "Pay me in cash and skip the fee.",
) {
  const { admin, artisan, client, jobId } = await offeredJob(given);
  await given.sentQuote(artisan, jobId);
  const [conversation] = (await domain.conversations.forJob(client.actor, { jobId })) ?? [];
  const sent = await domain.conversations.send(artisan.actor, {
    conversationId: conversation!.conversationId,
    text,
  });
  if (!sent.ok) throw new Error(sent.refusal.message);
  await domain.reports.report(client.actor, {
    about: { kind: "message", id: sent.value.messageId },
    reason: "leaving",
  });
  const [item] = await reportItems(domain, admin);
  return { admin, artisan, client, jobId, itemId: item!.id };
}

/** The decisions a Report's item offers now, by key. */
async function offered(domain: Harness["domain"], admin: { actor: AdminActor }, itemId: string) {
  return (await domain.queues.item(admin.actor, { itemId }))?.decisions.map((each) => each.key);
}

describe("deciding a Report", () => {
  test("dismissed, tells nobody", async () => {
    const { domain, given } = await createHarness();
    const { admin, artisan, client, itemId } = await reportedMessage(domain, given);
    const before = {
      artisan: (await domain.notices.list(artisan.actor)).length,
      client: (await domain.notices.list(client.actor)).length,
    };

    const decided = await domain.queues.decide(admin.actor, { itemId, decision: "dismiss" });

    expect(decided).toMatchObject({ ok: true });
    expect((await domain.notices.list(artisan.actor)).length).toBe(before.artisan);
    expect((await domain.notices.list(client.actor)).length).toBe(before.client);
  });

  test("with a warning, tells the Account reported, never the reporter", async () => {
    const { domain, given, clock } = await createHarness();
    const { admin, artisan, client, itemId } = await reportedMessage(domain, given);
    const toldClient = (await domain.notices.list(client.actor)).length;
    clock.advance({ minutes: 1 });

    await domain.queues.decide(admin.actor, {
      itemId,
      decision: "warn",
      reason: "Do not ask to be paid off the platform.",
    });

    expect((await domain.accounts.me(artisan.actor))?.standing.warnings).toEqual([
      { reason: "Do not ask to be paid off the platform.", at: expect.any(Date) },
    ]);
    expect((await domain.notices.list(artisan.actor))[0]).toMatchObject({
      event: "account.warned",
    });
    expect((await domain.notices.list(client.actor)).length).toBe(toldClient);
  });

  test("with a Suspension, suspends the Account reported", async () => {
    const { domain, given } = await createHarness();
    const { admin, artisan, itemId } = await reportedMessage(domain, given);

    await domain.queues.decide(admin.actor, { itemId, decision: "suspend", reason: "Threats." });

    expect((await domain.accounts.me(artisan.actor))?.standing.suspended).toEqual({
      reason: "Threats.",
      since: expect.any(Date),
    });
  });
});

describe("Leaving", () => {
  test("warns the first time, and suspends the second", async () => {
    const { domain, given, clock } = await createHarness();
    const { admin, artisan, client, jobId, itemId } = await reportedMessage(domain, given);
    expect(await offered(domain, admin, itemId)).toEqual([
      "dismiss",
      "warn",
      "suspend",
      "leaving-warn",
      "dodging-fees",
    ]);
    await domain.queues.decide(admin.actor, {
      itemId,
      decision: "leaving-warn",
      reason: "Asked to be paid in cash.",
    });
    clock.advance({ minutes: 1 });
    const [conversation] = (await domain.conversations.forJob(client.actor, { jobId })) ?? [];
    const again = await domain.conversations.send(artisan.actor, {
      conversationId: conversation!.conversationId,
      text: "Cash is cheaper for you.",
    });
    if (!again.ok) throw new Error(again.refusal.message);
    await domain.reports.report(client.actor, {
      about: { kind: "message", id: again.value.messageId },
      reason: "leaving",
    });
    const [second] = await reportItems(domain, admin);

    expect(await offered(domain, admin, second!.id)).toEqual([
      "dismiss",
      "warn",
      "suspend",
      "leaving-suspend",
      "dodging-fees",
    ]);
    await domain.queues.decide(admin.actor, {
      itemId: second!.id,
      decision: "leaving-suspend",
      reason: "Asked to be paid in cash again.",
    });

    expect((await domain.accounts.me(artisan.actor))?.standing).toEqual({
      suspended: { reason: "Asked to be paid in cash again.", since: expect.any(Date) },
      warnings: [{ reason: "Asked to be paid in cash.", at: expect.any(Date) }],
    });
  });

  test("that openly dodges the fees suspends at once", async () => {
    const { domain, given } = await createHarness();
    const { admin, artisan, itemId } = await reportedMessage(domain, given);

    await domain.queues.decide(admin.actor, {
      itemId,
      decision: "dodging-fees",
      reason: "Offered to skip the fees.",
    });

    expect((await domain.accounts.me(artisan.actor))?.standing).toEqual({
      suspended: { reason: "Offered to skip the fees.", since: expect.any(Date) },
      warnings: [],
    });
  });

  test("again, while the Account is Suspended, offers no further Suspension", async () => {
    const { domain, given } = await createHarness();
    const { admin, artisan, itemId } = await reportedMessage(domain, given);
    await domain.people.suspend(admin.actor, {
      accountId: artisan.actor.accountId,
      reason: "Fraud.",
    });

    expect(await offered(domain, admin, itemId)).toEqual(["dismiss", "warn", "leaving-warn"]);
  });
});

describe("reading the Conversation from a Report", () => {
  test("is a logged click", async () => {
    const { domain, given, clock } = await createHarness();
    const { admin, itemId } = await reportedMessage(domain, given, "Pay me in cash instead.");
    clock.advance({ minutes: 1 });

    const opened = await domain.queues.open(admin.actor, { itemId, read: "conversation" });

    expect(opened).toMatchObject({
      ok: true,
      value: expect.arrayContaining([
        { kind: "text", text: expect.stringContaining("Pay me in cash instead.") },
      ]),
    });
    const log = await domain.admins.auditLog(admin.actor, {});
    expect(log?.rows[0]).toMatchObject({
      action: "read",
      summary: "Opened the Conversation: Report of a message: Paint the lounge",
    });
  });
});

/** An Artisan offered the Client's Job Reports it; the Report's queue item. */
async function reportedJob(domain: Harness["domain"], given: Harness["given"]) {
  const offeredTo = await offeredJob(given);
  await domain.reports.report(offeredTo.artisan.actor, {
    about: { kind: "job", id: offeredTo.jobId },
    reason: "contact-or-payment",
  });
  const [item] = await reportItems(domain, offeredTo.admin);
  return { ...offeredTo, itemId: item!.id };
}

describe("taking a Job out of view", () => {
  test("hides it from every Artisan and stops its Quotes, telling the Client why", async () => {
    const { domain, given, clock } = await createHarness();
    const { admin, artisan, another, client, jobId, itemId } = await reportedJob(domain, given);
    expect(await offered(domain, admin, itemId)).toEqual([
      "dismiss",
      "out-of-view",
      "warn",
      "suspend",
      "leaving-warn",
      "dodging-fees",
    ]);
    clock.advance({ minutes: 1 });
    const toldReporter = (await domain.notices.list(artisan.actor)).length;

    await domain.queues.decide(admin.actor, {
      itemId,
      decision: "out-of-view",
      reason: "The photo shows a phone number. Take it out.",
    });

    expect(await domain.matches.mine(another.actor)).toEqual([]);
    expect(await domain.jobs.viewAsArtisan(another.actor, { jobId })).toBeNull();
    expect(
      await domain.quotes.send(another.actor, {
        jobId,
        scope: "Paint two walls.",
        labour: "1500",
        materials: "500",
        materialsBy: "artisan",
        startOn: "2026-11-02",
        durationDays: 3,
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-found" } });
    expect((await domain.jobs.view(client.actor, { jobId }))?.outOfView).toEqual({
      reason: "The photo shows a phone number. Take it out.",
    });
    expect((await domain.notices.list(client.actor))[0]).toMatchObject({
      event: "job.out-of-view",
      title: "Your Job is out of view until you fix it: Paint the lounge",
      link: `/jobs/${jobId}`,
    });
    expect((await domain.notices.list(artisan.actor)).length).toBe(toldReporter);
  });

  test("keeps it from being Hired until it is fixed", async () => {
    const { domain, given } = await createHarness();
    const { admin, another, client, jobId, itemId } = await reportedJob(domain, given);
    const quoteId = await given.sentQuote(another, jobId);
    await domain.queues.decide(admin.actor, { itemId, decision: "out-of-view", reason: "Fix it." });

    expect(
      await domain.engagements.hire(client.actor, { quoteId, feeAcknowledged: true }),
    ).toMatchObject({ ok: false, refusal: { reason: "out-of-view" } });
  });

  test("until the Client's edit, which the Admin checks, fixes it, even after a Quote", async () => {
    const { domain, given } = await createHarness();
    const { admin, another, client, jobId, itemId } = await reportedJob(domain, given);
    await given.sentQuote(another, jobId);
    await domain.queues.decide(admin.actor, { itemId, decision: "out-of-view", reason: "Fix it." });

    const edited = await domain.jobs.edit(client.actor, {
      jobId,
      title: "Paint the lounge",
      description: "Two walls, about 20 square metres. No numbers here.",
      siteType: "home",
      keep: [],
      add: [await photo()],
    });
    expect(edited).toEqual({ ok: true, value: { edit: "being-checked" } });
    expect((await domain.jobs.view(client.actor, { jobId }))?.outOfView).not.toBeNull();
    const [check] = (await domain.queues.home(admin.actor, { queue: "pre-checks" }))?.items ?? [];
    await domain.queues.decide(admin.actor, { itemId: check!.id, decision: "release" });

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      outOfView: null,
      description: "Two walls, about 20 square metres. No numbers here.",
    });
    expect(await domain.jobs.viewAsArtisan(another.actor, { jobId })).not.toBeNull();
  });
});

describe("taking a Profile out of view", () => {
  test("hides it from Browse and its page until a Profile edit fixes it, telling the Artisan", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.verifiedArtisan({
      name: "Sipho Dlamini",
      categories: ["painting"],
    });
    const client = await given.client();
    await domain.reports.report(client.actor, {
      about: { kind: "profile", id: artisan.actor.accountId },
      reason: "contact-or-payment",
    });
    const [item] = await reportItems(domain, admin);
    clock.advance({ minutes: 1 });

    await domain.queues.decide(admin.actor, {
      itemId: item!.id,
      decision: "out-of-view",
      reason: "Your About text names your website.",
    });

    expect(await domain.profiles.browse(visitor, { category: "painting" })).toEqual([]);
    expect(await domain.profiles.view(visitor, { artisanId: artisan.actor.accountId })).toBeNull();
    expect((await domain.profiles.mine(artisan.actor))?.outOfView).toEqual({
      reason: "Your About text names your website.",
    });
    expect((await domain.notices.list(artisan.actor))[0]).toMatchObject({
      event: "profile.out-of-view",
      title: "Your Profile is out of view until you fix it",
      link: "/profile",
    });

    await domain.profiles.edit(artisan.actor, { about: "I paint homes.", keep: [], add: [] });
    const [check] = (await domain.queues.home(admin.actor, { queue: "pre-checks" }))?.items ?? [];
    await domain.queues.decide(admin.actor, { itemId: check!.id, decision: "release" });

    expect(await domain.profiles.browse(visitor, { category: "painting" })).toEqual([
      expect.objectContaining({ publicName: "Sipho Dlamini" }),
    ]);
  });
});

describe("a Job out of view, and what comes due meanwhile", () => {
  test("gets its Batches again once the fix is released", async () => {
    const { domain, given, clock } = await createHarness();
    const { admin, client, jobId, itemId } = await reportedJob(domain, given);
    await domain.queues.decide(admin.actor, { itemId, decision: "out-of-view", reason: "Fix it." });
    const later = await given.matchableArtisan({ name: "Zola Moon" });
    clock.advance({ hours: 24 });
    await domain.system.runDueClocks();
    expect(await domain.matches.mine(later.actor)).toEqual([]);

    await domain.jobs.edit(client.actor, {
      jobId,
      title: "Paint the lounge",
      description: "Two walls, fixed.",
      siteType: "home",
      keep: [],
      add: [await photo()],
    });
    const [check] = (await domain.queues.home(admin.actor, { queue: "pre-checks" }))?.items ?? [];
    await domain.queues.decide(admin.actor, { itemId: check!.id, decision: "release" });
    clock.advance({ hours: 24 });
    await domain.system.runDueClocks();

    expect(await domain.matches.mine(later.actor)).toEqual([expect.objectContaining({ jobId })]);
  });

  test("Hires nobody when a Payment arrives after it was taken out of view", async () => {
    const { domain, given } = await createHarness();
    const { admin, another, client, jobId, itemId } = await reportedJob(domain, given);
    const quoteId = await given.sentQuote(another, jobId);
    const collectionId = await given.checkout(client, quoteId);
    await domain.queues.decide(admin.actor, { itemId, decision: "out-of-view", reason: "Fix it." });

    await given.paid(collectionId);

    const job = await domain.jobs.view(client.actor, { jobId });
    expect(job?.state).toBe("open");
    expect(job?.notHired).toEqual([expect.objectContaining({ reason: "out-of-view" })]);
  });

  test("stays out of view when an edit sent before it was taken out is released", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.verifiedArtisan({
      name: "Sipho Dlamini",
      categories: ["painting"],
    });
    const client = await given.client();
    await domain.profiles.edit(artisan.actor, { about: "I paint homes.", keep: [], add: [] });
    clock.advance({ minutes: 1 });
    await domain.reports.report(client.actor, {
      about: { kind: "profile", id: artisan.actor.accountId },
      reason: "fake-or-misleading",
    });
    const [report] = await reportItems(domain, admin);
    await domain.queues.decide(admin.actor, {
      itemId: report!.id,
      decision: "out-of-view",
      reason: "Fix it.",
    });

    const [check] = (await domain.queues.home(admin.actor, { queue: "pre-checks" }))?.items ?? [];
    await domain.queues.decide(admin.actor, { itemId: check!.id, decision: "release" });

    expect((await domain.profiles.mine(artisan.actor))?.outOfView).toEqual({ reason: "Fix it." });
  });
});
