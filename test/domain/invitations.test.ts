import { describe, expect, test } from "vitest";
import { visitor, type Actor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";

// Invitations and Invite-only Jobs (#123): a Client invites Artisans from a
// list built from Browse. An Invite-only Job is offered to nobody else. An
// Invitation reaches an Artisan even if they passed on a Job Match, so the
// list reveals nothing about Batches.

describe("an Invitation", () => {
  test("is a Tell to the Artisan, and shows among their Invitations", async () => {
    const { domain, given, clock, mailer } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client, { matching: "invite-only" });

    expect(
      await domain.invitations.invite(client.actor, { jobId, artisanId: artisan.actor.accountId }),
    ).toEqual({ ok: true, value: {} });

    expect(await domain.invitations.mine(artisan.actor)).toEqual([
      expect.objectContaining({ jobId, title: "Paint the lounge", invitedAt: clock.now() }),
    ]);
    expect(await invitationTells(domain, artisan)).toEqual([
      expect.objectContaining({
        title: "Invited to Quote: Paint the lounge",
        link: `/jobs/${jobId}`,
      }),
    ]);
    expect(mailer.sentTo(artisan.email).at(-1)).toMatchObject({
      subject: "Invited to Quote: Paint the lounge",
    });
  });
});

describe("an invited Artisan", () => {
  test("sees the Job as one holding a Job Match does: the Region, never the suburb or street, and its photos", async () => {
    const { domain, given, clock } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client({ name: "Thandi Mokoena" });
    const jobId = await given.openJob(client, { matching: "invite-only" });
    clock.advance({ hours: 1 });
    await domain.invitations.invite(client.actor, { jobId, artisanId: artisan.actor.accountId });

    const job = await domain.jobs.viewAsArtisan(artisan.actor, { jobId });

    expect(job).toMatchObject({
      jobId,
      state: "open",
      region: { id: "table-bay", name: "Table Bay" },
      title: "Paint the lounge",
      offeredAt: null,
      invitedAt: clock.now(),
      client: { shownName: "Thandi M." },
    });
    expect(JSON.stringify(job)).not.toMatch(/Sea Point|Main Road/);
    expect(await domain.jobs.photo(artisan.actor, { photoId: job!.photos[0]!.id })).toMatchObject({
      contentType: expect.stringMatching(/^image\//),
    });
  });

  test("is the only one who sees an Invite-only Job", async () => {
    const { domain, given, clock } = await createHarness();
    const invited = await given.matchableArtisan();
    const other = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client, { matching: "invite-only" });
    await domain.invitations.invite(client.actor, { jobId, artisanId: invited.actor.accountId });
    const [photo] = (await domain.jobs.viewAsArtisan(invited.actor, { jobId }))!.photos;
    clock.advance({ days: 1 });
    await domain.system.runDueClocks();

    expect(await domain.matches.mine(other.actor)).toEqual([]);
    expect(await domain.invitations.mine(other.actor)).toEqual([]);
    expect(await domain.jobs.viewAsArtisan(other.actor, { jobId })).toBeNull();
    expect(await domain.jobs.photo(other.actor, { photoId: photo!.id })).toBeNull();
    expect(await toldOf(domain, other, jobId)).toEqual([]);
  });
});

describe("an Invitation and a Job Match", () => {
  test("an Invitation reaches an Artisan who passed on a Job Match for the Job", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await domain.matches.pass(artisan.actor, { jobId });

    expect(
      await domain.invitations.invite(client.actor, { jobId, artisanId: artisan.actor.accountId }),
    ).toEqual({ ok: true, value: {} });

    expect(await domain.invitations.mine(artisan.actor)).toEqual([
      expect.objectContaining({ jobId }),
    ]);
    expect(await invitationTells(domain, artisan)).toHaveLength(1);
    expect(await domain.jobs.viewAsArtisan(artisan.actor, { jobId })).toMatchObject({
      offeredAt: null,
      invitedAt: expect.any(Date),
    });
  });

  test("an Invitation turns an unanswered Job Match into an Invitation", async () => {
    const { domain, given, clock } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    const offeredAt = clock.now();
    clock.advance({ hours: 1 });

    await domain.invitations.invite(client.actor, { jobId, artisanId: artisan.actor.accountId });

    expect(await domain.matches.mine(artisan.actor)).toEqual([]);
    expect(await domain.invitations.mine(artisan.actor)).toEqual([
      expect.objectContaining({ jobId, invitedAt: clock.now() }),
    ]);
    expect(await domain.jobs.viewAsArtisan(artisan.actor, { jobId })).toMatchObject({
      offeredAt,
      invitedAt: clock.now(),
    });
    // What was a Job Match is an Invitation now, and an Invitation is not passed.
    expect(await domain.matches.pass(artisan.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: { reason: "not-found" },
    });
    expect(await domain.invitations.mine(artisan.actor)).toHaveLength(1);
  });

  test("the Artisan keeps their place in the offer order when a Job Match becomes an Invitation", async () => {
    const { domain, given, clock } = await createHarness();
    const artisans = await inOrder(clock, 12, () => given.matchableArtisan());
    const client = await given.client();
    const first = await given.openJob(client);
    // The youngest of the ten offered the first Job.
    const youngest = artisans[9]!;
    await domain.invitations.invite(client.actor, {
      jobId: first,
      artisanId: youngest.actor.accountId,
    });
    clock.advance({ hours: 1 });

    const second = await given.openJob(client, { title: "Paint the kitchen" });

    // The two never offered a Job first, then the oldest eight offered the first.
    const offered = [];
    for (const artisan of artisans) {
      const jobIds = ((await domain.matches.mine(artisan.actor)) ?? []).map((m) => m.jobId);
      if (jobIds.includes(second)) offered.push(artisan);
    }
    expect(offered).toEqual([...artisans.slice(0, 8), ...artisans.slice(10)]);
  });

  test("the invite list shows nothing of who holds or passed a Job Match", async () => {
    const { domain, given } = await createHarness();
    const holding = await given.matchableArtisan({ name: "Anele Botha" });
    const passed = await given.matchableArtisan({ name: "Bongani Zulu" });
    const client = await given.client();
    const jobId = await given.openJob(client);
    await domain.matches.pass(passed.actor, { jobId });
    const never = await given.matchableArtisan({ name: "Chris Adams" });

    const list = await domain.invitations.list(client.actor, { jobId });

    expect(list!.map((artisan) => artisan.artisanId)).toEqual(
      [holding, passed, never].map((artisan) => artisan.actor.accountId),
    );
    // Each is the same but for who it is.
    const [a, b, c] = list!.map((artisan) => ({ ...artisan, artisanId: "", publicName: "" }));
    expect(a).toEqual(c);
    expect(b).toEqual(c);
  });
});

describe("a Batch", () => {
  test("leaves out an Artisan invited to the Job", async () => {
    const { domain, given, clock } = await createHarness();
    const client = await given.client();
    const jobId = await given.openJob(client);
    const artisan = await given.matchableArtisan();
    await domain.invitations.invite(client.actor, { jobId, artisanId: artisan.actor.accountId });

    clock.advance({ days: 1 });
    await domain.system.runDueClocks();

    expect(await domain.matches.mine(artisan.actor)).toEqual([]);
    expect(await domain.invitations.mine(artisan.actor)).toEqual([
      expect.objectContaining({ jobId }),
    ]);
    expect((await toldOf(domain, artisan, jobId)).map((notice) => notice.event)).toEqual([
      "job.invited",
    ]);
  });
});

describe("inviting", () => {
  test("is refused for an Artisan not on the invite list, telling nobody", async () => {
    const { domain, given } = await createHarness();
    const tiler = await given.matchableArtisan({ categories: ["tiling"] });
    const plumber = await given.matchableArtisan({ categories: ["plumbing"] });
    const unverified = await given.artisan();
    const client = await given.client();
    const gasJob = await given.openJob(client, { category: "plumbing", gasWork: true });

    for (const artisanId of [
      tiler.actor.accountId,
      plumber.actor.accountId,
      unverified.actor.accountId,
      client.actor.accountId,
      "no-such-artisan",
    ]) {
      expect(
        await domain.invitations.invite(client.actor, { jobId: gasJob, artisanId }),
      ).toMatchObject({ ok: false, refusal: { reason: "not-listed" } });
    }
    for (const artisan of [tiler, plumber, unverified]) {
      expect(await invitationTells(domain, artisan)).toEqual([]);
    }
  });

  test("is the Job's Client's alone", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const other = await given.client();
    const jobId = await given.openJob(client, { matching: "invite-only" });
    const artisanId = artisan.actor.accountId;

    for (const actor of [visitor, other.actor, artisan.actor]) {
      expect(await domain.invitations.invite(actor, { jobId, artisanId })).toMatchObject({
        ok: false,
        refusal: { reason: "not-found" },
      });
    }
    expect(await domain.invitations.mine(artisan.actor)).toEqual([]);
  });

  test("is refused twice for one Artisan, and on a Job not Open", async () => {
    const { domain, given, clock } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const artisanId = artisan.actor.accountId;
    const jobId = await given.openJob(client, { matching: "invite-only" });
    const draft = await given.jobDraft(client, { matching: "invite-only" });
    const closed = await given.openJob(client, { matching: "invite-only" });
    await domain.jobs.close(client.actor, { jobId: closed });
    expect(await domain.invitations.invite(client.actor, { jobId, artisanId })).toMatchObject({
      ok: true,
    });

    expect(await domain.invitations.invite(client.actor, { jobId, artisanId })).toMatchObject({
      ok: false,
      refusal: { reason: "already-invited" },
    });
    for (const notOpen of [draft, closed]) {
      expect(
        await domain.invitations.invite(client.actor, { jobId: notOpen, artisanId }),
      ).toMatchObject({ ok: false, refusal: { reason: "not-open" } });
    }
    clock.advance({ days: 14 });
    await domain.system.runDueClocks();
    expect(await domain.invitations.invite(client.actor, { jobId, artisanId })).toMatchObject({
      ok: false,
      refusal: { reason: "not-open" },
    });
    // An Invitation on a Job no longer Open is not shown.
    expect(await domain.invitations.mine(artisan.actor)).toEqual([]);
    expect(await invitationTells(domain, artisan)).toHaveLength(1);
  });
});

describe("the invite list", () => {
  test("is Browse narrowed to the Job's category, marking those invited", async () => {
    const { domain, given } = await createHarness();
    const zola = await given.matchableArtisan({ name: "Zola Nkosi" });
    const anele = await given.matchableArtisan({ name: "Anele Botha", regions: ["southern"] });
    await given.matchableArtisan({ name: "Tiler Tom", categories: ["tiling"] });
    const client = await given.client();
    const jobId = await given.openJob(client, { matching: "invite-only" });
    await domain.invitations.invite(client.actor, { jobId, artisanId: zola.actor.accountId });

    const list = await domain.invitations.list(client.actor, { jobId });

    expect(list).toEqual([
      expect.objectContaining({ artisanId: anele.actor.accountId, mark: null }),
      expect.objectContaining({ artisanId: zola.actor.accountId, mark: "invited" }),
    ]);
    expect(await domain.invitations.list(client.actor, { jobId, regionId: "table-bay" })).toEqual([
      expect.objectContaining({ artisanId: zola.actor.accountId }),
    ]);
  });

  test("on a gas Job, holds only gas-registered plumbers", async () => {
    const { domain, given } = await createHarness();
    await given.matchableArtisan({ categories: ["plumbing"] });
    const gasPlumber = await given.matchableArtisan({ categories: ["plumbing"], gasWork: true });
    const client = await given.client();
    const jobId = await given.openJob(client, { category: "plumbing", gasWork: true });

    expect(await domain.invitations.list(client.actor, { jobId })).toEqual([
      expect.objectContaining({ artisanId: gasPlumber.actor.accountId }),
    ]);
  });

  test("is the Job's Client's alone", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const other = await given.client();
    const jobId = await given.openJob(client);

    for (const actor of [visitor, other.actor, artisan.actor]) {
      expect(await domain.invitations.list(actor, { jobId })).toBeNull();
    }
  });
});

/** The Tells the Account was given about the Job. */
async function toldOf(domain: Harness["domain"], account: { actor: Actor }, jobId: string) {
  return (await domain.notices.list(account.actor)).filter((notice) => notice.link.includes(jobId));
}

/** The Tells of Invitations the Artisan was given, newest first. */
async function invitationTells(domain: Harness["domain"], artisan: { actor: Actor }) {
  return (await domain.notices.list(artisan.actor)).filter(
    (notice) => notice.event === "job.invited",
  );
}

/** Makes each a minute after the last, so each Account is older than the next. */
async function inOrder<T>(
  clock: Harness["clock"],
  count: number,
  make: () => Promise<T>,
): Promise<T[]> {
  const made: T[] = [];
  for (let i = 0; i < count; i++) {
    made.push(await make());
    clock.advance({ minutes: 1 });
  }
  return made;
}
