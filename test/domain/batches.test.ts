import { describe, expect, test } from "vitest";
import { visitor, type Actor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";

// Batches and Job Matches (#122, ADR 0003): an Open matched Job is offered
// to up to ten eligible Artisans at once, those offered a Job least recently
// first, and again every 24 hours while it has fewer than five Quotes. Each
// Job Match is a Tell; the Artisan may Quote or pass, and passing tells
// nobody. The Client never sees a Batch.

describe("the first Batch", () => {
  test("offers a matched Job at posting, with a Tell to each Artisan", async () => {
    const { domain, given, mailer } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();

    const jobId = await given.openJob(client);

    expect(await domain.matches.mine(artisan.actor)).toEqual([
      expect.objectContaining({ jobId, title: "Paint the lounge" }),
    ]);
    expect(await matchTells(domain, artisan)).toEqual([
      expect.objectContaining({ title: "A Job for you: Paint the lounge", link: `/jobs/${jobId}` }),
    ]);
    expect(mailer.sentTo(artisan.email).at(-1)).toMatchObject({
      subject: "A Job for you: Paint the lounge",
    });
  });
});

describe("a further Batch", () => {
  test("goes every 24 hours to those eligible and not yet offered the Job", async () => {
    const { domain, given, clock } = await createHarness();
    const artisans = await inOrder(clock, 11, () => given.matchableArtisan());
    const client = await given.client();
    const jobId = await given.openJob(client);
    expect(await offeredJob(domain, artisans, jobId)).toEqual(artisans.slice(0, 10));

    clock.advance({ hours: 23, minutes: 59 });
    await domain.system.runDueClocks();
    expect(await offeredJob(domain, artisans, jobId)).toEqual(artisans.slice(0, 10));

    clock.advance({ minutes: 1 });
    await domain.system.runDueClocks();
    expect(await offeredJob(domain, artisans, jobId)).toEqual(artisans);
    expect(await matchTells(domain, artisans[10]!)).toHaveLength(1);
  });

  test("keeps coming while the Job is Open, for an Artisan eligible only later", async () => {
    const { domain, given, clock } = await createHarness();
    const client = await given.client();
    const jobId = await given.openJob(client);
    clock.advance({ days: 1 });
    await domain.system.runDueClocks();
    const later = await given.matchableArtisan();
    expect(await jobIdsOf(domain, later)).toEqual([]);

    clock.advance({ days: 1 });
    await domain.system.runDueClocks();

    expect(await jobIdsOf(domain, later)).toEqual([jobId]);
  });

  test("fills Jobs due together in posting order", async () => {
    const { domain, given, clock } = await createHarness();
    const client = await given.client();
    const posted = await given.openJob(client);
    clock.advance({ minutes: 1 });
    const postedNext = await given.openJob(client, { title: "Paint the kitchen" });
    const artisans = await inOrder(clock, 11, () => given.matchableArtisan());
    // The clocks did not run until both Batches were due.
    clock.set(new Date("2026-10-06T07:00:00Z"));

    await domain.system.runDueClocks();

    expect(await offeredJob(domain, artisans, posted)).toEqual(artisans.slice(0, 10));
    expect(await offeredJob(domain, artisans, postedNext)).toEqual([
      ...artisans.slice(0, 9),
      artisans[10],
    ]);
  });

  test("stops once the Job is closed or Expires, and Renew restarts it without offering anyone twice", async () => {
    const { domain, given, clock } = await createHarness();
    const client = await given.client();
    const early = await given.matchableArtisan();
    const closed = await given.openJob(client);
    const expiring = await given.openJob(client, { title: "Paint the kitchen" });
    expect((await jobIdsOf(domain, early)).sort()).toEqual([closed, expiring].sort());
    expect(await domain.jobs.close(client.actor, { jobId: closed })).toMatchObject({ ok: true });
    clock.advance({ days: 14 });
    await domain.system.runDueClocks();
    // A Match on a Job no longer Open is not shown.
    expect(await jobIdsOf(domain, early)).toEqual([]);
    const late = await given.matchableArtisan();
    clock.advance({ days: 2 });
    await domain.system.runDueClocks();
    expect(await jobIdsOf(domain, late)).toEqual([]);

    expect(await domain.jobs.renew(client.actor, { jobId: expiring })).toMatchObject({ ok: true });

    expect(await jobIdsOf(domain, late)).toEqual([expiring]);
    expect(await jobIdsOf(domain, early)).toEqual([expiring]);
    expect(await matchTells(domain, early)).toHaveLength(2);
    clock.advance({ days: 1 });
    await domain.system.runDueClocks();
    expect(await matchTells(domain, early)).toHaveLength(2);
    expect(await matchTells(domain, late)).toHaveLength(1);
  });

  test("waits while a Job is Held, and goes within the minute of the Admin releasing it", async () => {
    const { domain, given, contentReader } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.jobDraft(client);
    contentReader.force({ kind: "unsure", reason: "It may name a social handle." });
    expect(await domain.jobs.post(client.actor, { jobId })).toMatchObject({
      value: { state: "held" },
    });
    await domain.system.runDueClocks();
    expect(await domain.matches.mine(artisan.actor)).toEqual([]);

    const home = await domain.queues.home(admin.actor, { queue: "pre-checks" });
    const released = await domain.queues.decide(admin.actor, {
      itemId: home!.items[0]!.id,
      decision: "release",
    });
    expect(released).toMatchObject({ ok: true });
    await domain.system.runDueClocks();

    expect(await jobIdsOf(domain, artisan)).toEqual([jobId]);
  });

  test("is not sent in the run that Expires the Job", async () => {
    const { domain, given, clock } = await createHarness();
    const client = await given.client();
    const jobId = await given.openJob(client);
    for (let day = 1; day < 13; day++) {
      clock.advance({ days: 1 });
      await domain.system.runDueClocks();
    }
    // The next Batch falls due a minute before the Job Expires, and the
    // clocks next run once both are due.
    clock.advance({ hours: 23, minutes: 59 });
    await domain.system.runDueClocks();
    const late = await given.matchableArtisan();
    clock.advance({ days: 1, minutes: 1 });

    await domain.system.runDueClocks();

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ state: "expired" });
    expect(await matchTells(domain, late)).toEqual([]);
  });

  test("never goes for an Invite-only Job", async () => {
    const { domain, given, clock } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();

    await given.openJob(client, { matching: "invite-only" });
    clock.advance({ days: 1 });
    await domain.system.runDueClocks();

    expect(await domain.matches.mine(artisan.actor)).toEqual([]);
  });
});

describe("the offer order", () => {
  test("offers ten at most: the never offered first, ties to the older Account", async () => {
    const { domain, given, clock } = await createHarness();
    const artisans = await inOrder(clock, 11, () => given.matchableArtisan());
    const client = await given.client();

    const first = await given.openJob(client);
    expect(await offeredJob(domain, artisans, first)).toEqual(artisans.slice(0, 10));

    clock.advance({ hours: 1 });
    const second = await given.openJob(client, { title: "Paint the kitchen" });
    // The eleventh was never offered a Job; the oldest nine of the rest follow.
    expect(await offeredJob(domain, artisans, second)).toEqual([
      ...artisans.slice(0, 9),
      artisans[10],
    ]);
  });

  test("then the least recently offered, before the older Account, keeping the place while unavailable", async () => {
    const { domain, given, clock } = await createHarness();
    const artisans = await inOrder(clock, 12, () => given.matchableArtisan());
    const older = artisans.slice(0, 10);
    const [newer11, newer12] = artisans.slice(10);
    const client = await given.client();
    await setAvailable(domain, older, false);
    const first = await given.openJob(client);
    expect(await offeredJob(domain, artisans, first)).toEqual([newer11, newer12]);
    await setAvailable(domain, older, true);
    clock.advance({ hours: 1 });
    const second = await given.openJob(client, { title: "Paint the kitchen" });
    expect(await offeredJob(domain, artisans, second)).toEqual(older);
    // Off and on again moves nobody.
    await setAvailable(domain, [newer11!], false);
    await setAvailable(domain, [newer11!], true);
    clock.advance({ hours: 1 });

    const third = await given.openJob(client, { title: "Paint the stoep" });

    // The two newer Accounts were offered a Job two hours ago, the rest one hour ago.
    expect(await offeredJob(domain, artisans, third)).toEqual([
      ...older.slice(0, 8),
      newer11,
      newer12,
    ]);
  });
});

describe("who is eligible", () => {
  test("only an Artisan verified for the category, in the Region, and Available for Jobs", async () => {
    const { domain, given } = await createHarness();
    const eligible = await given.matchableArtisan();
    const otherTrade = await given.matchableArtisan({ categories: ["tiling"] });
    const otherRegion = await given.matchableArtisan({ regions: ["southern"] });
    const unavailable = await given.matchableArtisan();
    expect(await domain.availability.set(unavailable.actor, { available: false })).toMatchObject({
      ok: true,
    });
    const unverified = await given.artisan();
    await domain.regions.choose(unverified.actor, { regionIds: ["table-bay"] });
    const noRegions = await given.verifiedArtisan({ categories: ["painting"] });
    const client = await given.client();

    const jobId = await given.openJob(client);

    expect(await domain.matches.mine(eligible.actor)).toEqual([expect.objectContaining({ jobId })]);
    for (const artisan of [otherTrade, otherRegion, unavailable, unverified, noRegions]) {
      expect(await domain.matches.mine(artisan.actor)).toEqual([]);
      expect(await matchTells(domain, artisan)).toEqual([]);
    }
  });

  test("only a gas-registered plumber on a gas Job", async () => {
    const { domain, given } = await createHarness();
    const plumber = await given.matchableArtisan({ categories: ["plumbing"] });
    const gasPlumber = await given.matchableArtisan({ categories: ["plumbing"], gasWork: true });
    const client = await given.client();

    const gasJob = await given.openJob(client, { category: "plumbing", gasWork: true });
    const otherJob = await given.openJob(client, { category: "plumbing", gasWork: false });

    expect(await jobIdsOf(domain, plumber)).toEqual([otherJob]);
    expect((await jobIdsOf(domain, gasPlumber)).sort()).toEqual([gasJob, otherJob].sort());
  });

  test("not an Artisan whose Verification has lapsed", async () => {
    const { domain, given, clock } = await createHarness();
    // The electrical contractor registration expires on 31 December 2028.
    const electrician = await given.matchableArtisan({ categories: ["electrical"] });
    const client = await given.client();
    clock.set(new Date("2029-01-02T08:00:00Z"));

    await given.openJob(client, { category: "electrical" });

    expect(await domain.matches.mine(electrician.actor)).toEqual([]);
  });
});

describe("a Job Match", () => {
  test("shows the Artisan the Region, never the suburb or street, the details and photos, and the Client's shown name and record", async () => {
    const { domain, given, clock } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client({ name: "Thandi Mokoena" });
    const jobId = await given.openJob(client, { preferredStart: "2026-10-20" });

    const job = await domain.jobs.viewAsArtisan(artisan.actor, { jobId });

    expect(job).toEqual({
      jobId,
      state: "open",
      category: { id: "painting", name: "Painting" },
      siteType: "home",
      region: { id: "table-bay", name: "Table Bay" },
      title: "Paint the lounge",
      description: "Two walls, about 20 square metres.",
      photos: [expect.objectContaining({ href: expect.any(String) })],
      gasWork: null,
      preferredStart: "2026-10-20",
      offeredAt: clock.now(),
      client: { shownName: "Thandi M.", reviews: { average: null, count: 0 }, completed: 0 },
    });
    const [photo] = job!.photos;
    expect(await domain.jobs.photo(artisan.actor, { photoId: photo!.id })).toMatchObject({
      contentType: expect.stringMatching(/^image\//),
    });
    expect(await domain.matches.mine(artisan.actor)).toEqual([
      {
        jobId,
        title: "Paint the lounge",
        description: "Two walls, about 20 square metres.",
        category: { id: "painting", name: "Painting" },
        siteType: "home",
        region: "Table Bay",
        gasWork: null,
        preferredStart: "2026-10-20",
        photo: expect.objectContaining({ thumbnailHref: expect.any(String) }),
        offeredAt: clock.now(),
      },
    ]);
  });

  test("is the Artisan's alone: nobody else sees the Job as offered, nor its photos", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    const other = await given.matchableArtisan({ regions: ["southern"] });
    const [photo] = (await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))!.photos;

    for (const actor of [visitor, other.actor, client.actor]) {
      expect(await domain.jobs.viewAsArtisan(actor, { jobId })).toBeNull();
    }
    expect(await domain.jobs.view(artisan.actor, { jobId })).toBeNull();
    expect(await domain.jobs.photo(other.actor, { photoId: photo!.id })).toBeNull();
    expect(await domain.jobs.photo(visitor, { photoId: photo!.id })).toBeNull();
  });

  test("may be passed, telling nobody, and the Job is not offered to the Artisan again", async () => {
    const { domain, given, clock } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    const [photo] = (await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))!.photos;
    const told = {
      client: await domain.notices.list(client.actor),
      artisan: await domain.notices.list(artisan.actor),
    };

    expect(await domain.matches.pass(artisan.actor, { jobId })).toEqual({ ok: true, value: {} });

    expect(await domain.matches.mine(artisan.actor)).toEqual([]);
    expect(await domain.jobs.viewAsArtisan(artisan.actor, { jobId })).toBeNull();
    expect(await domain.jobs.photo(artisan.actor, { photoId: photo!.id })).toBeNull();
    expect(await domain.notices.list(client.actor)).toEqual(told.client);
    expect(await domain.notices.list(artisan.actor)).toEqual(told.artisan);
    expect(await domain.matches.pass(artisan.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: { reason: "not-found" },
    });
    clock.advance({ days: 1 });
    await domain.system.runDueClocks();
    expect(await domain.matches.mine(artisan.actor)).toEqual([]);
  });

  test("cannot be passed once the Job is no longer Open, and shows again when it is Renewed", async () => {
    const { domain, given, clock } = await createHarness();
    const artisan = await given.matchableArtisan();
    const client = await given.client();
    const jobId = await given.openJob(client);
    clock.advance({ days: 14 });
    await domain.system.runDueClocks();

    expect(await domain.matches.pass(artisan.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: { reason: "not-found" },
    });

    expect(await domain.jobs.renew(client.actor, { jobId })).toMatchObject({ ok: true });
    expect(await jobIdsOf(domain, artisan)).toEqual([jobId]);
  });

  test("cannot be passed by anyone not holding it", async () => {
    const { domain, given } = await createHarness();
    await given.matchableArtisan();
    const other = await given.matchableArtisan({ regions: ["southern"] });
    const client = await given.client();
    const jobId = await given.openJob(client);

    for (const actor of [visitor, client.actor, other.actor]) {
      expect(await domain.matches.pass(actor, { jobId })).toMatchObject({
        ok: false,
        refusal: { reason: "not-found" },
      });
    }
  });

  test("is never shown to the Client: no Batch and no count", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();
    const unmatched = await given.openJob(client, { matching: "invite-only" });
    await given.matchableArtisan();
    await given.matchableArtisan();

    const matched = await given.openJob(client);

    const seen = await domain.jobs.view(client.actor, { jobId: matched });
    const unseen = await domain.jobs.view(client.actor, { jobId: unmatched });
    expect(Object.keys(seen!).sort()).toEqual(Object.keys(unseen!).sort());
    expect(JSON.stringify(seen)).not.toMatch(/batch|offer|"matches"|jobMatch/i);
    expect(JSON.stringify(await domain.jobs.mine(client.actor))).not.toMatch(
      /batch|offer|"matches"|jobMatch/i,
    );
    expect(await domain.matches.mine(client.actor)).toBeNull();
    expect(await domain.notices.list(client.actor)).toEqual([]);
  });
});

/** The Tells of Job Matches the Artisan was given, newest first. */
async function matchTells(domain: Harness["domain"], artisan: { actor: Actor }) {
  return (await domain.notices.list(artisan.actor)).filter(
    (notice) => notice.event === "job.matched",
  );
}

/** The Jobs the Artisan holds a Job Match for. */
async function jobIdsOf(domain: Harness["domain"], artisan: { actor: Actor }) {
  return ((await domain.matches.mine(artisan.actor)) ?? []).map((match) => match.jobId);
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

/** Which of the Artisans hold a Job Match for the Job, in the order given. */
async function offeredJob<T extends { actor: Actor }>(
  domain: Harness["domain"],
  artisans: T[],
  jobId: string,
): Promise<T[]> {
  const holding: T[] = [];
  for (const artisan of artisans) {
    if ((await jobIdsOf(domain, artisan)).includes(jobId)) holding.push(artisan);
  }
  return holding;
}

async function setAvailable(
  domain: Harness["domain"],
  artisans: { actor: Actor }[],
  available: boolean,
) {
  for (const artisan of artisans) {
    const set = await domain.availability.set(artisan.actor, { available });
    if (!set.ok) throw new Error(set.refusal.message);
  }
}
