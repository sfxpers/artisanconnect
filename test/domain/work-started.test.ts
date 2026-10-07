import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import type { Actor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";

// Work started (#127, ADR 0006): set by the Client, or by the Artisan when the
// Client does not answer "Not started" within 24 hours, so no Client can hold
// the Materials hostage. It releases the Materials, less the Artisan Fee.

describe("the Client marks Work started", () => {
  test("the Engagement is Work started and the Artisan told", async () => {
    const { domain, given, clock, mailer } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    clock.advance({ days: 1 });

    expect(await domain.engagements.workStarted(client.actor, { engagementId })).toEqual({
      ok: true,
      value: null,
    });

    for (const engagement of [
      (await domain.jobs.view(client.actor, { jobId }))?.engagement,
      (await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement,
    ]) {
      expect(engagement).toMatchObject({
        state: "work-started",
        workStartedAt: clock.now(),
        startClaim: null,
        activity: [
          { event: "quote.sent" },
          { event: "hired" },
          { event: "work.started", at: clock.now() },
        ],
      });
    }
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({
        event: "engagement.work-started",
        title: "Work started, and the Materials were released: Paint the lounge",
      }),
    ]);
    expect(mailer.sentTo(artisan.email).at(-1)).toMatchObject({
      subject: "Work started, and the Materials were released: Paint the lounge",
    });
    expect(await toldOf(domain, client, jobId)).toEqual([]);
  });

  test("releases the Materials, less the Artisan Fee, in one batch", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);

    await domain.engagements.workStarted(client.actor, { engagementId });

    const money = {
      paidInCents: 200_000,
      releasedCents: 50_000,
      unreleasedCents: 150_000,
      refundedCents: 0,
      payments: [
        { part: "materials", amountCents: 50_000, unreleasedCents: 0, state: "released" },
        { part: "labour", amountCents: 150_000, unreleasedCents: 150_000, state: "unreleased" },
      ],
    };
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.money).toEqual({
      ...money,
      protectionFeeCents: 10_000,
    });
    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement?.money).toEqual({
      ...money,
      artisanFeePercent: 10,
    });
    const rows = await releaseRows(engagementId);
    expect(rows.map(({ kind, amount_cents }) => ({ kind, amount_cents }))).toEqual([
      { kind: "payout.owed", amount_cents: 45_000 },
      { kind: "release.artisan-fee", amount_cents: 5_000 },
      { kind: "release.materials", amount_cents: 50_000 },
    ]);
    expect(new Set(rows.map((row) => row.event_id)).size).toBe(1);
  });

  test("rounds the Artisan Fee half up to the cent", async () => {
    const { domain, given } = await createHarness();
    const { client, engagementId } = await hiredJob(given, { materials: "333.35" });

    await domain.engagements.workStarted(client.actor, { engagementId });

    expect(
      (await releaseRows(engagementId)).map(({ kind, amount_cents }) => ({ kind, amount_cents })),
    ).toEqual([
      { kind: "payout.owed", amount_cents: 30_001 },
      { kind: "release.artisan-fee", amount_cents: 3_334 },
      { kind: "release.materials", amount_cents: 33_335 },
    ]);
  });

  test("with no Materials releases nothing, but still happens", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given, {
      materials: "0",
      materialsBy: "client",
    });

    await domain.engagements.workStarted(client.actor, { engagementId });

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "work-started",
      money: { releasedCents: 0, unreleasedCents: 150_000 },
    });
    expect(await releaseRows(engagementId)).toEqual([]);
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({
        event: "engagement.work-started",
        title: "Work started: Paint the lounge",
      }),
    ]);
  });

  test("shows in the Conversation as a row that is not speech", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    clock.advance({ hours: 3 });

    await domain.engagements.workStarted(client.actor, { engagementId });

    for (const party of [client, artisan]) {
      const [conversation] = (await domain.conversations.forJob(party.actor, { jobId }))!;
      expect(
        (
          await domain.conversations.view(party.actor, {
            conversationId: conversation!.conversationId,
          })
        )?.items.at(-1),
      ).toEqual({ kind: "event", event: "work.started", at: clock.now() });
    }
  });

  test("happens once: again changes and releases nothing", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await domain.engagements.workStarted(client.actor, { engagementId });

    expect(await domain.engagements.workStarted(client.actor, { engagementId })).toEqual({
      ok: false,
      refusal: { reason: "not-paid", message: "Work has already started on this Job." },
    });
    expect(await releaseRows(engagementId)).toHaveLength(3);
    expect(await toldOf(domain, artisan, jobId)).toHaveLength(1);
  });

  test("is the Engagement's Client's only", async () => {
    const { domain, given } = await createHarness();
    const { artisan, engagementId } = await hiredJob(given);
    const stranger = await given.client();

    for (const actor of [stranger.actor, artisan.actor, { kind: "visitor" } as Actor]) {
      expect(await domain.engagements.workStarted(actor, { engagementId })).toMatchObject({
        ok: false,
        refusal: { reason: "not-found" },
      });
    }
    expect(await releaseRows(engagementId)).toEqual([]);
  });
});

describe("the Artisan says they've started", () => {
  test("the Client is told, with the 24-hour deadline to answer", async () => {
    const { domain, given, clock, mailer } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);

    expect(await domain.engagements.claimStarted(artisan.actor, { engagementId })).toEqual({
      ok: true,
      value: null,
    });

    const answerBy = new Date(clock.now().getTime() + 24 * 60 * 60 * 1000);
    for (const engagement of [
      (await domain.jobs.view(client.actor, { jobId }))?.engagement,
      (await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement,
    ]) {
      expect(engagement).toMatchObject({
        state: "paid",
        startClaim: { claimedAt: clock.now(), answerBy },
      });
    }
    const title =
      "The Artisan says work has started. Answer Not started by 06 Oct 2026, 08:00, or it is Work started: Paint the lounge";
    expect(await toldOf(domain, client, jobId)).toEqual([
      expect.objectContaining({ event: "engagement.start-claimed", title }),
    ]);
    expect(mailer.sentTo(client.email).at(-1)).toMatchObject({ subject: title });
    expect(await releaseRows(engagementId)).toEqual([]);
  });

  test("with no answer in 24 hours it is Work started, the Materials released, and the Client told", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await domain.engagements.claimStarted(artisan.actor, { engagementId });

    clock.advance({ hours: 23, minutes: 59 });
    await domain.system.runDueClocks();
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe("paid");

    clock.advance({ minutes: 1 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "work-started",
      workStartedAt: clock.now(),
      startClaim: null,
      money: { releasedCents: 50_000 },
    });
    expect(await releaseRows(engagementId)).toHaveLength(3);
    expect((await toldOf(domain, client, jobId)).at(0)).toMatchObject({
      event: "engagement.work-started",
      title: "Work started, as you did not answer Not started in 24 hours: Paint the lounge",
    });
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({
        event: "engagement.work-started",
        title: "Work started, and the Materials were released: Paint the lounge",
      }),
    ]);
  });

  test("the Client may mark Work started before the 24 hours, and the clock then does nothing", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await domain.engagements.claimStarted(artisan.actor, { engagementId });
    clock.advance({ hours: 2 });
    await domain.engagements.workStarted(client.actor, { engagementId });
    const startedAt = clock.now();

    clock.advance({ days: 1 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "work-started",
      workStartedAt: startedAt,
    });
    expect(await releaseRows(engagementId)).toHaveLength(3);
    expect(await toldOf(domain, artisan, jobId)).toHaveLength(1);
  });

  test("not before the Hired Quote's start date", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given, {
      startOn: "2026-10-07",
    });
    clock.set(new Date("2026-10-06T21:59:00Z")); // a minute before 7 October in South Africa

    expect(await domain.engagements.claimStarted(artisan.actor, { engagementId })).toEqual({
      ok: false,
      refusal: {
        reason: "before-start",
        message: "You can say you've started from the Quote's start date, 07 Oct 2026.",
      },
    });
    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      startClaim: null,
      canClaimStart: false,
    });
    expect(await toldOf(domain, client, jobId)).toEqual([]);

    clock.advance({ minutes: 1 });
    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      canClaimStart: true,
    });
    expect(await domain.engagements.claimStarted(artisan.actor, { engagementId })).toMatchObject({
      ok: true,
    });
  });

  test("the Client may mark Work started before the start date", async () => {
    const { domain, given } = await createHarness();
    const { client, jobId, engagementId } = await hiredJob(given, { startOn: "2026-10-20" });

    expect(await domain.engagements.workStarted(client.actor, { engagementId })).toMatchObject({
      ok: true,
    });
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe(
      "work-started",
    );
  });

  test("not twice while the Client has not answered", async () => {
    const { domain, given } = await createHarness();
    const { artisan, engagementId } = await hiredJob(given);
    await domain.engagements.claimStarted(artisan.actor, { engagementId });

    expect(await domain.engagements.claimStarted(artisan.actor, { engagementId })).toEqual({
      ok: false,
      refusal: {
        reason: "already-claimed",
        message: "You already said you've started. The Client has until then to answer.",
      },
    });
  });

  test("not once Work started", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await hiredJob(given);
    await domain.engagements.workStarted(client.actor, { engagementId });

    expect(await domain.engagements.claimStarted(artisan.actor, { engagementId })).toMatchObject({
      ok: false,
      refusal: { reason: "not-paid" },
    });
  });

  test("is the Hired Artisan's only", async () => {
    const { domain, given } = await createHarness();
    const { client, engagementId } = await hiredJob(given);
    const other = await given.matchableArtisan();

    for (const actor of [client.actor, other.actor, { kind: "visitor" } as Actor]) {
      expect(await domain.engagements.claimStarted(actor, { engagementId })).toMatchObject({
        ok: false,
        refusal: { reason: "not-found" },
      });
    }
  });
});

describe("the Client answers Not started", () => {
  test("leaves the Engagement Paid, tells the Artisan, and the clock then does nothing", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await domain.engagements.claimStarted(artisan.actor, { engagementId });
    clock.advance({ hours: 5 });

    expect(await domain.engagements.notStarted(client.actor, { engagementId })).toEqual({
      ok: true,
      value: null,
    });

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "paid",
      startClaim: null,
    });
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({
        event: "engagement.not-started",
        title: "The Client says work has not started: Paint the lounge",
      }),
    ]);

    clock.advance({ days: 1 });
    await domain.system.runDueClocks();
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe("paid");
    expect(await releaseRows(engagementId)).toEqual([]);
  });

  test("lets the Artisan say they've started again later, with a new 24 hours", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await domain.engagements.claimStarted(artisan.actor, { engagementId });
    clock.advance({ hours: 20 });
    await domain.engagements.notStarted(client.actor, { engagementId });
    clock.advance({ hours: 2 });

    expect(await domain.engagements.claimStarted(artisan.actor, { engagementId })).toMatchObject({
      ok: true,
    });

    // The first claim's 24 hours pass: nothing happens.
    clock.advance({ hours: 3 });
    await domain.system.runDueClocks();
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe("paid");

    clock.advance({ hours: 21 });
    await domain.system.runDueClocks();
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe(
      "work-started",
    );
    expect(await releaseRows(engagementId)).toHaveLength(3);
  });

  test("only while the Artisan's claim waits for an answer", async () => {
    const { domain, given } = await createHarness();
    const { client, engagementId } = await hiredJob(given);

    expect(await domain.engagements.notStarted(client.actor, { engagementId })).toEqual({
      ok: false,
      refusal: {
        reason: "no-claim",
        message: "The Artisan has not said they've started, so there is nothing to answer.",
      },
    });
  });

  test("is the Engagement's Client's only", async () => {
    const { domain, given } = await createHarness();
    const { artisan, engagementId } = await hiredJob(given);
    await domain.engagements.claimStarted(artisan.actor, { engagementId });
    const stranger = await given.client();

    for (const actor of [stranger.actor, artisan.actor]) {
      expect(await domain.engagements.notStarted(actor, { engagementId })).toMatchObject({
        ok: false,
        refusal: { reason: "not-found" },
      });
    }
  });
});

describe("an Engagement's state", () => {
  // The module has no command that could, so this checks the database itself refuses.
  test("moves from Paid only to Work started, and once", async () => {
    const { domain, given } = await createHarness();
    const { client, engagementId } = await hiredJob(given);

    await expect(
      env.DB.prepare("UPDATE engagements SET state = 'completed' WHERE id = ?")
        .bind(engagementId)
        .run(),
    ).rejects.toThrow(/cannot change that way/);
    await expect(
      env.DB.prepare("UPDATE engagements SET state = 'work-started' WHERE id = ?")
        .bind(engagementId)
        .run(),
    ).rejects.toThrow(/cannot change that way/);

    await domain.engagements.workStarted(client.actor, { engagementId });
    for (const change of [
      "state = 'paid'",
      "work_started_at = 1",
      "start_claimed_at = 1",
      "artisan_fee_percent = 5",
    ]) {
      await expect(
        env.DB.prepare(`UPDATE engagements SET ${change} WHERE id = ?`).bind(engagementId).run(),
      ).rejects.toThrow(/cannot change that way/);
    }
  });
});

type QuoteFields = Parameters<Harness["given"]["sentQuote"]>[2];

/**
 * A Client's Job Hired from the default R2 000 Quote (R500 of it Materials),
 * starting today (5 October 2026), unless said.
 */
async function hiredJob(given: Harness["given"], fields: QuoteFields = {}) {
  const client = await given.client();
  const artisan = await given.matchableArtisan({ name: "Sipho Dlamini" });
  const jobId = await given.openJob(client);
  const quoteId = await given.sentQuote(artisan, jobId, { startOn: "2026-10-05", ...fields });
  await given.hired(client, quoteId);
  const engagementId = await given.engagementOf(client, jobId);
  return { client, artisan, jobId, quoteId, engagementId };
}

/** The Engagement's Release rows in the ledger, by kind. */
async function releaseRows(engagementId: string) {
  const { results } = await env.DB.prepare(
    "SELECT kind, amount_cents, event_id FROM ledger_entries WHERE engagement_id = ? AND kind NOT LIKE 'payment.%' ORDER BY kind",
  )
    .bind(engagementId)
    .all<{ kind: string; amount_cents: number; event_id: string }>();
  return results;
}

/** What the Account was told of the Job since it was Hired. */
async function toldOf(domain: Harness["domain"], account: { actor: Actor }, jobId: string) {
  const notices = await domain.notices.list(account.actor);
  return notices.filter(
    (notice) =>
      notice.link === `/jobs/${jobId}` &&
      !["job.matched", "job.invited", "quote.sent", "engagement.hired"].includes(notice.event),
  );
}
