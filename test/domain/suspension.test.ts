import { describe, expect, test } from "vitest";
import { visitor } from "@/domain/actor";
import { createHarness } from "../support/harness";

// Warnings and Suspension (#136): the Admin warns or suspends an Account from
// the People page or a Report. A Suspended Account cannot start new work, but
// its paid Engagements continue, and it sees the reason.

describe("suspending an Account", () => {
  test("shows it the reason, and tells it", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();

    const suspended = await domain.people.suspend(admin.actor, {
      accountId: client.actor.accountId,
      reason: "Asked an Artisan to be paid in cash.",
    });

    expect(suspended).toEqual({ ok: true, value: {} });
    expect((await domain.accounts.me(client.actor))?.standing).toEqual({
      suspended: { reason: "Asked an Artisan to be paid in cash.", since: expect.any(Date) },
      warnings: [],
    });
    expect(await domain.notices.list(client.actor)).toContainEqual(
      expect.objectContaining({
        event: "account.suspended",
        title: "Your Account is suspended",
        link: "/account",
      }),
    );
  });
});

describe("a Suspended Client", () => {
  test("cannot post a Job", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    const jobId = await given.jobDraft(client);
    await domain.people.suspend(admin.actor, {
      accountId: client.actor.accountId,
      reason: "Fraud.",
    });

    expect(await domain.jobs.post(client.actor, { jobId })).toEqual({
      ok: false,
      refusal: { reason: "suspended", message: expect.stringMatching(/suspended/) },
    });
    expect((await domain.jobs.view(client.actor, { jobId }))?.state).toBe("draft");
  });

  test("has its Open Jobs closed, their Sent Quotes Declined and their Artisans told", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client, { title: "Paint the lounge" });
    const quoteId = await given.sentQuote(artisan, jobId);

    await domain.people.suspend(admin.actor, {
      accountId: client.actor.accountId,
      reason: "Fraud.",
    });

    expect((await domain.jobs.view(client.actor, { jobId }))?.state).toBe("closed");
    expect((await domain.quotes.forJob(client.actor, { jobId }))?.[0]).toMatchObject({
      quoteId,
      state: "declined",
    });
    expect(await domain.notices.list(artisan.actor)).toContainEqual(
      expect.objectContaining({
        event: "quote.declined",
        title: "Your Quote was declined: Paint the lounge",
      }),
    );
  });

  test("has a Job being checked made a Draft again, so it never goes live", async () => {
    const { domain, given, contentReader } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    const jobId = await given.jobDraft(client);
    contentReader.force({ kind: "unsure", reason: "Is that a phone number?" });
    await domain.jobs.post(client.actor, { jobId });
    contentReader.force({ kind: "clear" });

    await domain.people.suspend(admin.actor, {
      accountId: client.actor.accountId,
      reason: "Fraud.",
    });

    expect((await domain.jobs.view(client.actor, { jobId }))?.state).toBe("draft");
    expect((await domain.queues.home(admin.actor, { queue: "pre-checks" }))?.items).toEqual([]);
  });
});

describe("a Suspended Artisan", () => {
  test("has its Sent Quotes Withdrawn, each Client told", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client, { title: "Paint the lounge" });
    const quoteId = await given.sentQuote(artisan, jobId);

    await domain.people.suspend(admin.actor, {
      accountId: artisan.actor.accountId,
      reason: "Fraud.",
    });

    expect((await domain.quotes.forJob(client.actor, { jobId }))?.[0]).toMatchObject({
      quoteId,
      state: "withdrawn",
    });
    expect(await domain.notices.list(client.actor)).toContainEqual(
      expect.objectContaining({
        event: "quote.withdrawn",
        title: "A Quote was withdrawn: Paint the lounge",
      }),
    );
  });

  test("has a Quote being checked withdrawn, so it is never Sent", async () => {
    const { domain, given, contentReader } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    contentReader.force({ kind: "unsure", reason: "A spelled-out number?" });
    await domain.quotes.send(artisan.actor, {
      jobId,
      scope: "Paint two walls.",
      labour: "1500",
      materials: "500",
      materialsBy: "artisan",
      startOn: "2026-11-02",
      durationDays: 3,
    });

    await domain.people.suspend(admin.actor, {
      accountId: artisan.actor.accountId,
      reason: "Fraud.",
    });

    expect((await domain.queues.home(admin.actor, { queue: "pre-checks" }))?.items).toEqual([]);
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([]);
  });

  test("cannot Quote", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await domain.people.suspend(admin.actor, {
      accountId: artisan.actor.accountId,
      reason: "Fraud.",
    });

    const sent = await domain.quotes.send(artisan.actor, {
      jobId,
      scope: "Paint two walls.",
      labour: "1500",
      materials: "500",
      materialsBy: "artisan",
      startOn: "2026-11-02",
      durationDays: 3,
    });

    expect(sent).toMatchObject({ ok: false, refusal: { reason: "suspended" } });
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([]);
  });

  test("is offered no Job", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    await domain.people.suspend(admin.actor, {
      accountId: artisan.actor.accountId,
      reason: "Fraud.",
    });
    const client = await given.client();

    await given.openJob(client);

    expect(await domain.matches.mine(artisan.actor)).toEqual([]);
  });

  test("leaves Browse, and so cannot be invited", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.matchableArtisan({ categories: ["painting"] });
    const client = await given.client();
    const jobId = await given.openJob(client, { matching: "invite-only" });

    await domain.people.suspend(admin.actor, {
      accountId: artisan.actor.accountId,
      reason: "Fraud.",
    });

    expect(await domain.profiles.browse(visitor, { category: "painting" })).toEqual([]);
    expect(await domain.profiles.listed(visitor)).toEqual([]);
    expect(await domain.invitations.list(client.actor, { jobId })).toEqual([]);
    expect(
      await domain.invitations.invite(client.actor, { jobId, artisanId: artisan.actor.accountId }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-listed" } });
  });
});

describe("Hire while Suspended", () => {
  test("is refused to a Suspended Client, even from an Expired Job's Quote still Sent", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    const artisan = await given.matchableArtisan();
    const jobId = await given.openJob(client);
    clock.advance({ hours: 1 });
    const quoteId = await given.sentQuote(artisan, jobId);
    clock.advance({ days: 14, minutes: -30 });
    await domain.system.runDueClocks();
    await domain.people.suspend(admin.actor, {
      accountId: client.actor.accountId,
      reason: "Fraud.",
    });

    expect(
      await domain.engagements.hire(client.actor, { quoteId, feeAcknowledged: true }),
    ).toMatchObject({ ok: false, refusal: { reason: "suspended" } });
  });
});

describe("a Payment arriving once either party is Suspended", () => {
  test("Hires nobody on a Suspended Client's Expired Job, and is refunded whole", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    const artisan = await given.matchableArtisan();
    const jobId = await given.openJob(client);
    clock.advance({ hours: 1 });
    const quoteId = await given.sentQuote(artisan, jobId);
    clock.advance({ days: 14, minutes: -30 });
    await domain.system.runDueClocks();
    const collectionId = await given.checkout(client, quoteId);
    await domain.people.suspend(admin.actor, {
      accountId: client.actor.accountId,
      reason: "Fraud.",
    });

    await given.paid(collectionId);

    const job = await domain.jobs.view(client.actor, { jobId });
    expect(job?.state).toBe("expired");
    expect(job?.notHired).toEqual([expect.objectContaining({ reason: "suspended" })]);
  });
});

describe("a paid Engagement", () => {
  test("goes on when either party is Suspended", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    const artisan = await given.matchableArtisan();
    const jobId = await given.openJob(client);
    const quoteId = await given.sentQuote(artisan, jobId);
    await given.hired(client, quoteId);
    const engagementId = await given.engagementOf(client, jobId);

    await domain.people.suspend(admin.actor, {
      accountId: artisan.actor.accountId,
      reason: "Abuse.",
    });
    await domain.people.suspend(admin.actor, {
      accountId: client.actor.accountId,
      reason: "Abuse.",
    });
    await given.workStarted(client, engagementId);

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      state: "hired",
      engagement: expect.objectContaining({ state: "work-started" }),
    });
  });
});

describe("a Suspended Account", () => {
  test("may still send a Support request, which reaches the Support queue", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client({ name: "Thandi Mokoena" });
    await domain.people.suspend(admin.actor, {
      accountId: client.actor.accountId,
      reason: "Fraud.",
    });

    const sent = await domain.support.send(client.actor, {
      topic: "suspension",
      message: "I never asked for cash.",
    });

    expect(sent).toMatchObject({ ok: true });
    expect((await domain.queues.home(admin.actor, { queue: "support" }))?.items).toEqual([
      expect.objectContaining({ title: "Suspension, from Thandi Mokoena" }),
    ]);
  });

  test("is suspended once at a time", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    await domain.people.suspend(admin.actor, {
      accountId: client.actor.accountId,
      reason: "Fraud.",
    });

    expect(
      await domain.people.suspend(admin.actor, {
        accountId: client.actor.accountId,
        reason: "Again.",
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "already-suspended" } });
  });
});

describe("lifting a Suspension", () => {
  test("lets the Account start work again, and tells it", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    const jobId = await given.jobDraft(client);
    await domain.people.suspend(admin.actor, {
      accountId: client.actor.accountId,
      reason: "Fraud.",
    });

    const lifted = await domain.people.lift(admin.actor, { accountId: client.actor.accountId });

    expect(lifted).toEqual({ ok: true, value: {} });
    expect((await domain.accounts.me(client.actor))?.standing.suspended).toBeNull();
    expect(await domain.notices.list(client.actor)).toContainEqual(
      expect.objectContaining({
        event: "account.suspension-lifted",
        title: "Your Suspension is lifted",
      }),
    );
    expect(await domain.jobs.post(client.actor, { jobId })).toMatchObject({ ok: true });
  });

  test("is refused when none stands", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();

    expect(
      await domain.people.lift(admin.actor, { accountId: client.actor.accountId }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-suspended" } });
  });
});

describe("warning an Account", () => {
  test("tells it, and the warning stays after a Suspension is lifted", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();

    const warned = await domain.people.warn(admin.actor, {
      accountId: artisan.actor.accountId,
      reason: "Rude to a Client.",
    });
    await domain.people.suspend(admin.actor, {
      accountId: artisan.actor.accountId,
      reason: "Abuse.",
    });
    await domain.people.lift(admin.actor, { accountId: artisan.actor.accountId });

    expect(warned).toEqual({ ok: true, value: {} });
    expect((await domain.accounts.me(artisan.actor))?.standing).toEqual({
      suspended: null,
      warnings: [{ reason: "Rude to a Client.", at: expect.any(Date) }],
    });
    expect(await domain.notices.list(artisan.actor)).toContainEqual(
      expect.objectContaining({ event: "account.warned", title: "You have a warning" }),
    );
  });
});

describe("the People page's powers", () => {
  test("are the Admin's only", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();
    const other = await given.client();
    const input = { accountId: other.actor.accountId, reason: "Because." };

    expect(await domain.people.warn(client.actor, input)).toMatchObject({
      ok: false,
      refusal: { reason: "admin-only" },
    });
    expect(await domain.people.suspend(client.actor, input)).toMatchObject({
      ok: false,
      refusal: { reason: "admin-only" },
    });
    expect(await domain.people.lift(client.actor, input)).toMatchObject({
      ok: false,
      refusal: { reason: "admin-only" },
    });
  });

  test("each write a line in the audit log", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const client = await given.client({ name: "Thandi Mokoena" });
    const accountId = client.actor.accountId;

    // Rows written at one instant sort by id, so the clock moves between them.
    await domain.people.warn(admin.actor, { accountId, reason: "Rude." });
    clock.advance({ minutes: 1 });
    await domain.people.suspend(admin.actor, { accountId, reason: "Abuse." });
    clock.advance({ minutes: 1 });
    await domain.people.lift(admin.actor, { accountId, reason: "Apologised." });

    const log = await domain.admins.auditLog(admin.actor, {});
    expect(log?.rows.map((row) => row.summary).slice(0, 3)).toEqual([
      "Lifted the Suspension of Thandi Mokoena: Apologised.",
      "Suspended Thandi Mokoena: Abuse.",
      "Warned Thandi Mokoena: Rude.",
    ]);
  });
});
