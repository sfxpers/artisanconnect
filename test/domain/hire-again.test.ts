import { describe, expect, test } from "vitest";
import type { Actor } from "@/domain/actor";
import { photo } from "../support/verification";
import { createHarness, type Harness } from "../support/harness";

type Account = Awaited<ReturnType<Harness["given"]["client"]>>;

// Hire Again (#139, ADR 0013): a Client with a Completed Engagement opens an
// Invite-only Job prefilled from it, inviting only that Artisan, which then
// follows the ordinary Quote and Hire flow at the repeat Artisan Fee. The
// Protected Relationship Period runs 365 days from the Client Relationship's
// first Payment and never renews (ADR 0014).

describe("Hire Again", () => {
  test("is offered only once the Engagement is Completed", async () => {
    const { domain, given } = await createHarness();
    const job = await completedJob(given, { until: "marked-complete" });

    expect(await offered(domain, job)).toBe(false);
    expect(
      await domain.jobs.hireAgain(job.client.actor, { engagementId: job.engagementId }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-completed" } });

    await given.approved(job.client, job.engagementId);

    expect(await offered(domain, job)).toBe(true);
  });

  test("is the Client's alone", async () => {
    const { domain, given } = await createHarness();
    const job = await completedJob(given);
    const other = await given.client();

    for (const actor of [job.artisan.actor, other.actor]) {
      expect(await domain.jobs.hireAgain(actor, { engagementId: job.engagementId })).toMatchObject({
        ok: false,
        refusal: { reason: "not-found" },
      });
    }
  });

  test("makes a Draft with the category, title, description, site, and gas answer, Invite-only, without photos", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan({
      name: "Sipho Dlamini",
      categories: ["plumbing"],
    });
    const job = await completedJob(given, {
      artisan,
      fields: {
        category: "plumbing",
        gasWork: false,
        siteType: "business",
        title: "Fix the geyser",
        description: "It drips from the valve.",
        preferredStart: "2026-10-20",
      },
    });

    const again = await domain.jobs.hireAgain(job.client.actor, {
      engagementId: job.engagementId,
    });
    if (!again.ok) throw new Error(again.refusal.message);

    expect(await domain.jobs.view(job.client.actor, { jobId: again.value.jobId })).toMatchObject({
      state: "draft",
      category: { id: "plumbing" },
      gasWork: false,
      siteType: "business",
      suburb: { id: "sea-point" },
      street: "12 Main Road",
      title: "Fix the geyser",
      description: "It drips from the valve.",
      photos: [],
      preferredStart: null,
      matching: "invite-only",
      hireAgain: { artisanId: artisan.actor.accountId, publicName: "Sipho Dlamini" },
    });
  });

  test("opens the same Draft while it is one", async () => {
    const { domain, given } = await createHarness();
    const job = await completedJob(given);

    const first = await domain.jobs.hireAgain(job.client.actor, {
      engagementId: job.engagementId,
    });
    const second = await domain.jobs.hireAgain(job.client.actor, {
      engagementId: job.engagementId,
    });

    expect(second).toEqual(first);
  });

  test("lets the Client change everything copied, and add photos, but stays Invite-only", async () => {
    const { domain, given } = await createHarness();
    const job = await completedJob(given);
    const jobId = await hireAgain(domain, job);

    const saved = await domain.jobs.saveDraft(job.client.actor, {
      jobId,
      category: "painting",
      siteType: "business",
      suburbId: "sea-point",
      street: "3 Beach Road",
      title: "Paint the stoep",
      description: "The stoep walls, outside.",
      matching: "matched",
      add: [await photo()],
    });

    expect(saved).toEqual({ ok: true, value: { jobId } });
    expect(await domain.jobs.view(job.client.actor, { jobId })).toMatchObject({
      siteType: "business",
      street: "3 Beach Road",
      title: "Paint the stoep",
      matching: "invite-only",
      photos: [expect.objectContaining({ id: expect.any(String) })],
    });
  });

  test("needs the Client's photos before it is posted", async () => {
    const { domain, given } = await createHarness();
    const job = await completedJob(given);
    const jobId = await hireAgain(domain, job);

    expect(await domain.jobs.post(job.client.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: { message: "Add at least one photo." },
    });
  });
});

describe("a Job opened by Hire Again", () => {
  test("invites that Artisan when posted, with a Tell, and offers it to nobody else", async () => {
    const { domain, given, clock, mailer } = await createHarness();
    const job = await completedJob(given);
    const bystander = await given.matchableArtisan();
    const jobId = await postedAgain(domain, job);

    expect(await domain.invitations.mine(job.artisan.actor)).toEqual([
      expect.objectContaining({ jobId, invitedAt: clock.now() }),
    ]);
    expect(await toldOf(domain, job.artisan, jobId)).toEqual([
      expect.objectContaining({
        event: "job.invited",
        title: "Invited to Quote: Paint the lounge",
      }),
    ]);
    expect(mailer.sentTo(job.artisan.email).at(-1)).toMatchObject({
      subject: "Invited to Quote: Paint the lounge",
    });
    clock.advance({ days: 1 });
    await domain.system.runDueClocks();
    expect(await domain.matches.mine(bystander.actor)).toEqual([]);
    expect(await domain.jobs.viewAsArtisan(bystander.actor, { jobId })).toBeNull();
  });

  test("invites nobody else", async () => {
    const { domain, given } = await createHarness();
    const job = await completedJob(given);
    const other = await given.matchableArtisan({ name: "Lerato Khumalo" });
    const jobId = await postedAgain(domain, job);

    expect(
      await domain.invitations.invite(job.client.actor, {
        jobId,
        artisanId: other.actor.accountId,
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "hire-again" } });
    expect(
      (await domain.invitations.list(job.client.actor, { jobId }))?.map(
        (artisan) => artisan.artisanId,
      ),
    ).toEqual([job.artisan.actor.accountId]);
  });

  test("Held at posting invites the Artisan once the Admin releases it", async () => {
    const { domain, given, contentReader } = await createHarness();
    const admin = await given.admin();
    const job = await completedJob(given);
    const jobId = await hireAgain(domain, job);
    await withPhoto(domain, job.client, jobId);
    contentReader.force({ kind: "unsure", reason: "It may name a social handle." });

    expect(await domain.jobs.post(job.client.actor, { jobId })).toEqual({
      ok: true,
      value: { state: "held" },
    });
    expect(await domain.invitations.mine(job.artisan.actor)).toEqual([]);

    const home = await domain.queues.home(admin.actor, { queue: "pre-checks" });
    const item = home!.items.find((each) => each.title === "Job: Paint the lounge")!;
    expect(
      await domain.queues.decide(admin.actor, { itemId: item.id, decision: "release" }),
    ).toMatchObject({ ok: true });

    expect(await domain.invitations.mine(job.artisan.actor)).toEqual([
      expect.objectContaining({ jobId }),
    ]);
    expect(await toldOf(domain, job.artisan, jobId)).toEqual([
      expect.objectContaining({ event: "job.invited" }),
    ]);
  });

  test("Held at posting invites nobody once released if the Artisan was Suspended meanwhile", async () => {
    const { domain, given, contentReader } = await createHarness();
    const admin = await given.admin();
    const job = await completedJob(given);
    const jobId = await hireAgain(domain, job);
    await withPhoto(domain, job.client, jobId);
    contentReader.force({ kind: "unsure", reason: "It may name a social handle." });
    await domain.jobs.post(job.client.actor, { jobId });
    await domain.people.suspend(admin.actor, {
      accountId: job.artisan.actor.accountId,
      reason: "Abuse.",
    });

    const home = await domain.queues.home(admin.actor, { queue: "pre-checks" });
    const item = home!.items.find((each) => each.title === "Job: Paint the lounge")!;
    expect((await domain.queues.item(admin.actor, { itemId: item.id }))?.sidebar).toContainEqual({
      title: "Hire Again",
      blocks: [{ kind: "text", text: "Invites only Sipho Dlamini once released." }],
    });
    await domain.queues.decide(admin.actor, { itemId: item.id, decision: "release" });

    expect((await domain.jobs.view(job.client.actor, { jobId }))?.state).toBe("open");
    expect(await toldOf(domain, job.artisan, jobId)).toEqual([]);
    expect(await domain.invitations.list(job.client.actor, { jobId })).toEqual([]);
  });

  test("lists its Artisan whatever Region is asked for", async () => {
    const { domain, given } = await createHarness();
    const job = await completedJob(given);
    const jobId = await postedAgain(domain, job);

    expect(
      (await domain.invitations.list(job.client.actor, { jobId, regionId: "southern" }))?.map(
        (artisan) => artisan.artisanId,
      ),
    ).toEqual([job.artisan.actor.accountId]);
  });

  test("is refused at posting if the Artisan does not do its Service Category", async () => {
    const { domain, given } = await createHarness();
    const job = await completedJob(given);
    const jobId = await hireAgain(domain, job);
    await withPhoto(domain, job.client, jobId, { category: "plumbing", gasWork: false });

    expect(await domain.jobs.post(job.client.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: {
        reason: "not-invitable",
        message:
          "Sipho Dlamini cannot be invited to a Plumbing Job now. Choose a Service Category they are verified for.",
      },
    });
    expect((await domain.jobs.view(job.client.actor, { jobId }))?.state).toBe("draft");
  });

  test("Hired sets the Artisan Fee at 5%", async () => {
    const { domain, given } = await createHarness();
    const job = await completedJob(given);
    const jobId = await postedAgain(domain, job);

    await given.hired(job.client, await given.sentQuote(job.artisan, jobId));

    expect(
      (await domain.jobs.viewAsArtisan(job.artisan.actor, { jobId }))?.engagement?.money,
    ).toMatchObject({ artisanFeePercent: 5 });
  });
});

describe("the Protected Relationship Period", () => {
  test("runs 365 days from the Client Relationship's first Payment, as the Admin sees for each party", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const job = await completedJob(given, { until: "hired" });
    const firstPayment = clock.now();
    const until = new Date(firstPayment.getTime() + 365 * DAY);

    const ofClient = await domain.people.view(admin.actor, {
      accountId: job.client.actor.accountId,
    });
    const ofArtisan = await domain.people.view(admin.actor, {
      accountId: job.artisan.actor.accountId,
    });

    expect(ofClient?.clientRelationships).toEqual([
      {
        accountId: job.artisan.actor.accountId,
        name: "Sipho Dlamini",
        firstPaymentAt: firstPayment,
        protectedUntil: until,
        protectedNow: true,
      },
    ]);
    expect(ofArtisan?.clientRelationships).toEqual([
      {
        accountId: job.client.actor.accountId,
        name: "Thandi Mokoena",
        firstPaymentAt: firstPayment,
        protectedUntil: until,
        protectedNow: true,
      },
    ]);
  });

  test("never renews with a later Payment, and ends after 365 days", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const job = await completedJob(given);
    const firstPayment = (await relationshipOf(domain, admin, job))!.firstPaymentAt;
    clock.advance({ days: 200 });
    const jobId = await postedAgain(domain, job);
    await given.hired(
      job.client,
      await given.sentQuote(job.artisan, jobId, { startOn: "2027-06-01" }),
    );

    expect(await relationshipOf(domain, admin, job)).toMatchObject({
      firstPaymentAt: firstPayment,
      protectedUntil: new Date(firstPayment.getTime() + 365 * DAY),
      protectedNow: true,
    });

    clock.advance({ days: 166 });

    expect(await relationshipOf(domain, admin, job)).toMatchObject({ protectedNow: false });
  });

  test("is no one's before a Payment", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const client = await given.client();
    const artisan = await given.matchableArtisan();
    await given.sentQuote(artisan, await given.openJob(client));

    expect(
      (await domain.people.view(admin.actor, { accountId: client.actor.accountId }))
        ?.clientRelationships,
    ).toEqual([]);
  });
});

const DAY = 24 * 60 * 60 * 1000;

/** A Client's Job, Hired, and its Engagement as far as asked: Completed unless said. */
async function completedJob(
  given: Harness["given"],
  parties: {
    until?: "hired" | "marked-complete" | "approved";
    artisan?: Account;
    fields?: Parameters<Harness["given"]["openJob"]>[1];
  } = {},
) {
  const { until = "approved" } = parties;
  const client = await given.client({ name: "Thandi Mokoena" });
  const artisan = parties.artisan ?? (await given.matchableArtisan({ name: "Sipho Dlamini" }));
  const jobId = await given.openJob(client, parties.fields);
  const quoteId = await given.sentQuote(artisan, jobId, { startOn: "2026-10-05" });
  await given.hired(client, quoteId);
  const engagementId = await given.engagementOf(client, jobId);
  const job = { client, artisan, jobId, engagementId };
  if (until === "hired") return job;
  await given.workStarted(client, engagementId);
  await given.markedComplete(artisan, engagementId);
  if (until === "marked-complete") return job;
  await given.approved(client, engagementId);
  return job;
}

/** Whether the Client's Job page offers Hire Again on its Engagement. */
async function offered(domain: Harness["domain"], job: { client: Account; jobId: string }) {
  return (await domain.jobs.view(job.client.actor, { jobId: job.jobId }))?.engagement?.hireAgain;
}

/** The Draft Hire Again makes. */
async function hireAgain(
  domain: Harness["domain"],
  job: { client: Account; engagementId: string },
) {
  const again = await domain.jobs.hireAgain(job.client.actor, { engagementId: job.engagementId });
  if (!again.ok) throw new Error(again.refusal.message);
  return again.value.jobId;
}

/** The Client adds a photo to the Hire Again Draft, changing what else is given. */
async function withPhoto(
  domain: Harness["domain"],
  client: Account,
  jobId: string,
  fields: Partial<Parameters<Harness["domain"]["jobs"]["saveDraft"]>[1]> = {},
) {
  const draft = (await domain.jobs.view(client.actor, { jobId }))!;
  const saved = await domain.jobs.saveDraft(client.actor, {
    jobId,
    category: draft.category?.id,
    siteType: draft.siteType,
    suburbId: draft.suburb?.id,
    street: draft.street,
    title: draft.title,
    description: draft.description,
    gasWork: draft.gasWork,
    matching: draft.matching,
    add: [await photo()],
    ...fields,
  });
  if (!saved.ok) throw new Error(saved.refusal.message);
}

/** The Hire Again Job, with a photo added, posted and Open. */
async function postedAgain(
  domain: Harness["domain"],
  job: { client: Account; engagementId: string },
) {
  const jobId = await hireAgain(domain, job);
  await withPhoto(domain, job.client, jobId);
  const posted = await domain.jobs.post(job.client.actor, { jobId });
  if (!posted.ok) throw new Error(posted.refusal.message);
  if (posted.value.state !== "open") throw new Error("Expected the Job to open");
  return jobId;
}

/** The Client Relationship as the Admin sees it on the Client's page. */
async function relationshipOf(
  domain: Harness["domain"],
  admin: { actor: Actor },
  job: { client: Account; artisan: Account },
) {
  const person = await domain.people.view(admin.actor, { accountId: job.client.actor.accountId });
  return person?.clientRelationships.find((each) => each.accountId === job.artisan.actor.accountId);
}

/** What the Artisan was told of the Job. */
async function toldOf(domain: Harness["domain"], artisan: { actor: Actor }, jobId: string) {
  const notices = await domain.notices.list(artisan.actor);
  return notices.filter((notice) => notice.link === `/jobs/${jobId}`);
}
