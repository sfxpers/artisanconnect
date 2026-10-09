import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import type { Actor, AdminActor } from "@/domain/actor";
import type { FigurePeriod } from "@/domain/figures/periods";
import { createHarness, type Harness } from "../support/harness";

// The Admin's figures (#142): how the marketplace is doing over a period,
// with no targets. Jobs and Hires count by when they were posted and Hired;
// money, Leaving, and refused sends by when they happened.

async function figures(
  domain: Harness["domain"],
  admin: { actor: AdminActor },
  period: FigurePeriod = "30d",
) {
  const read = await domain.figures.read(admin.actor, { period });
  if (!read) throw new Error("Expected the Admin to read the figures");
  return read;
}

/** The Client Hires the Artisan on a new Job: R1 500 of Labour, R500 of Materials. */
async function hiredEngagement(
  given: Harness["given"],
  parties: { client: { actor: Actor }; artisan: { actor: Actor } },
) {
  const jobId = await given.openJob(parties.client);
  const quoteId = await given.sentQuote(parties.artisan, jobId);
  await given.hired(parties.client, quoteId);
  return given.engagementOf(parties.client, jobId);
}

/** The Engagement Completed: Work started, the Completion, and Approval. */
async function completed(
  given: Harness["given"],
  parties: { client: { actor: Actor }; artisan: { actor: Actor } },
  engagementId: string,
) {
  await given.workStarted(parties.client, engagementId);
  await given.markedComplete(parties.artisan, engagementId);
  await given.approved(parties.client, engagementId);
}

describe("the figures", () => {
  test("are only the Admin's", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();
    const artisan = await given.artisan();

    expect(await domain.figures.read(client.actor)).toBeNull();
    expect(await domain.figures.read(artisan.actor)).toBeNull();
    expect(await domain.figures.read({ kind: "visitor" })).toBeNull();
  });

  test("start at nothing, over the last 30 days unless another period is asked", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();

    expect(await domain.figures.read(admin.actor)).toEqual({
      period: "30d",
      since: new Date(clock.now().getTime() - 30 * 24 * 60 * 60 * 1000),
      jobsPosted: 0,
      jobsWithQuote: { count: 0, of: 0 },
      hires: 0,
      paymentValueCents: 0,
      protectionFeesCents: 0,
      artisanFeesCents: 0,
      refundedCents: 0,
      chargedBackCents: 0,
      repeatHireRate: { count: 0, of: 0 },
      completedRate: { count: 0, of: 0 },
      cancellationRate: { count: 0, of: 0, byClient: 0, byArtisan: 0 },
      disputeRate: { count: 0, of: 0 },
      inProgress: 0,
      leavingWarnings: 0,
      leavingSuspensions: 0,
      refusedSends: 0,
    });
    expect(await figures(domain, admin, "all")).toMatchObject({ period: "all", since: null });
  });

  test("count Jobs posted, and of them those a Quote was Sent on", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const quoted = await given.openJob(client, { title: "Paint the lounge" });
    await given.openJob(client, { title: "Paint the kitchen" });
    await given.jobDraft(client, { title: "Paint the stoep" });
    await given.sentQuote(artisan, quoted);

    expect(await figures(domain, admin)).toMatchObject({
      jobsPosted: 2,
      jobsWithQuote: { count: 1, of: 2 },
    });
  });

  test("count a Held Job as posted when the Admin releases it", async () => {
    const { domain, given, clock, contentReader } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    const jobId = await given.jobDraft(client);
    contentReader.force({ kind: "unsure", reason: "It may name a social handle." });
    await domain.jobs.post(client.actor, { jobId });
    expect(await figures(domain, admin)).toMatchObject({ jobsPosted: 0 });
    clock.advance({ days: 10 });

    const [item] = (await domain.queues.home(admin.actor, { queue: "pre-checks" }))!.items;
    const released = await domain.queues.decide(admin.actor, {
      itemId: item!.id,
      decision: "release",
    });

    expect(released).toMatchObject({ ok: true });
    expect(await figures(domain, admin, "7d")).toMatchObject({ jobsPosted: 1 });
  });

  test("count a Renewed Job by when it was first posted", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    const jobId = await given.openJob(client);
    clock.advance({ days: 20 });
    await domain.system.runDueClocks();
    clock.advance({ days: 20 });

    expect(await domain.jobs.renew(client.actor, { jobId })).toMatchObject({ ok: true });

    expect(await figures(domain, admin, "30d")).toMatchObject({ jobsPosted: 0 });
    expect(await figures(domain, admin, "90d")).toMatchObject({ jobsPosted: 1 });
  });

  // No command changes it, so this checks the database itself refuses.
  test("never move a Job's posted time once set", async () => {
    const { given } = await createHarness();
    const jobId = await given.openJob(await given.client());

    await expect(
      env.DB.prepare("UPDATE jobs SET posted_at = 0 WHERE id = ?").bind(jobId).run(),
    ).rejects.toThrow(/posted time never changes/);
  });

  test("count Hires, what became of them, and the money", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const parties = { client, artisan };
    // Cancelled by each party before Work started: R2 000 each refunded.
    for (const party of [client, artisan]) {
      const engagementId = await hiredEngagement(given, parties);
      const cancelled = await domain.engagements.cancel(party.actor, { engagementId });
      if (!cancelled.ok) throw new Error(cancelled.refusal.message);
    }
    // Disputed at Completion: R50 of Artisan Fee on the R500 of Materials released.
    const disputedId = await hiredEngagement(given, parties);
    await given.workStarted(client, disputedId);
    await given.markedComplete(artisan, disputedId);
    const disputed = await domain.engagements.dispute(client.actor, {
      engagementId: disputedId,
      amount: "500",
      reason: "The east wall is missing a coat.",
    });
    if (!disputed.ok) throw new Error(disputed.refusal.message);
    // Completed, last, so none before is a repeat Hire: R200 of Artisan Fees on R2 000 released.
    await completed(given, parties, await hiredEngagement(given, parties));

    expect(await figures(domain, admin)).toMatchObject({
      hires: 4,
      paymentValueCents: 4 * 210_000,
      protectionFeesCents: 4 * 10_000,
      artisanFeesCents: 20_000 + 5_000,
      refundedCents: 2 * 200_000,
      chargedBackCents: 0,
      repeatHireRate: { count: 0, of: 4 },
      completedRate: { count: 1, of: 4 },
      cancellationRate: { count: 2, of: 4, byClient: 1, byArtisan: 1 },
      disputeRate: { count: 1, of: 4 },
      inProgress: 1,
    });
  });

  test("count what the bank sent back by a Chargeback, and not as a party's Cancellation", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    const collectionId = await given.hired(client, await given.sentQuote(artisan, jobId));

    await given.chargedBack(collectionId);
    await given.chargebackClosed(collectionId, { outcome: "lost", reversedCents: 210_000 });

    expect(await figures(domain, admin)).toMatchObject({
      hires: 1,
      paymentValueCents: 210_000,
      chargedBackCents: 210_000,
      cancellationRate: { count: 0, of: 1 },
    });
  });

  test("count a Hire as repeat once its Client Relationship has a Completed Engagement", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const parties = { client: await given.client(), artisan: await given.matchableArtisan() };
    await completed(given, parties, await hiredEngagement(given, parties));

    await hiredEngagement(given, parties);

    expect(await figures(domain, admin)).toMatchObject({
      hires: 2,
      repeatHireRate: { count: 1, of: 2 },
    });
  });

  test("leave out what happened before the period", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const parties = { client: await given.client(), artisan: await given.matchableArtisan() };
    await completed(given, parties, await hiredEngagement(given, parties));

    clock.advance({ days: 8 });

    expect(await figures(domain, admin, "7d")).toMatchObject({
      jobsPosted: 0,
      hires: 0,
      paymentValueCents: 0,
      artisanFeesCents: 0,
    });
    expect(await figures(domain, admin, "30d")).toMatchObject({
      jobsPosted: 1,
      hires: 1,
      paymentValueCents: 210_000,
      artisanFeesCents: 20_000,
    });
  });

  test("count Leaving warnings and Suspensions for Leaving", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await given.sentQuote(artisan, jobId);
    const [conversation] = (await domain.conversations.forJob(client.actor, { jobId })) ?? [];
    for (const decision of ["leaving-warn", "leaving-suspend"]) {
      clock.advance({ minutes: 1 });
      const sent = await domain.conversations.send(artisan.actor, {
        conversationId: conversation!.conversationId,
        text: "Pay me in cash and skip the fee.",
      });
      if (!sent.ok) throw new Error(sent.refusal.message);
      await domain.reports.report(client.actor, {
        about: { kind: "message", id: sent.value.messageId },
        reason: "leaving",
      });
      const [item] = (await domain.queues.home(admin.actor, { queue: "reports" }))!.items;
      const decided = await domain.queues.decide(admin.actor, {
        itemId: item!.id,
        decision,
        reason: "Asked to be paid in cash.",
      });
      if (!decided.ok) throw new Error(decided.refusal.message);
    }

    expect(await figures(domain, admin)).toMatchObject({
      leavingWarnings: 1,
      leavingSuspensions: 1,
    });
  });

  test("count refused sends, even a discarded Draft's", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    const jobId = await given.jobDraft(client, { description: "Call me on 082 555 0123" });
    expect(await domain.jobs.post(client.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: { reason: "content" },
    });

    expect(await domain.jobs.discard(client.actor, { jobId })).toMatchObject({ ok: true });

    expect(await figures(domain, admin)).toMatchObject({ refusedSends: 1, jobsPosted: 0 });
  });
});
