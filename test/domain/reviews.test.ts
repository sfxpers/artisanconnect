import { describe, expect, test } from "vitest";
import type { Actor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";

type Account = Awaited<ReturnType<Harness["given"]["client"]>>;

// Reviews (#138, ADR 0012): once an Engagement is Completed, each party
// writes one rating of the other. Neither reads the other's until both have
// written or seven days pass; every Review waits for the Admin, and approved
// Reviews of Artisans are public.

describe("the Review window", () => {
  test("opens when the Engagement is Completed, and both parties are told", async () => {
    const { domain, given, mailer } = await createHarness();
    const { client, artisan, jobId } = await completedJob(given);

    const toClient = "Write a Review of the Artisan by 12 Oct 2026, 08:00: Paint the lounge";
    const toArtisan = "Write a Review of the Client by 12 Oct 2026, 08:00: Paint the lounge";
    expect(await reviewNotices(domain, client)).toEqual([
      expect.objectContaining({
        event: "review.window-opened",
        title: toClient,
        link: `/jobs/${jobId}`,
      }),
    ]);
    expect(await reviewNotices(domain, artisan)).toEqual([
      expect.objectContaining({
        event: "review.window-opened",
        title: toArtisan,
        link: `/jobs/${jobId}`,
      }),
    ]);
    expect(mailer.sentTo(client.email)).toContainEqual(
      expect.objectContaining({ subject: toClient }),
    );
    expect(mailer.sentTo(artisan.email)).toContainEqual(
      expect.objectContaining({ subject: toArtisan }),
    );
  });
});

describe("the Review window, Completed otherwise", () => {
  test("opens when a Client's Dispute ends with the Engagement Completed", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await completedJob(given, {
      until: "marked-complete",
    });
    const disputed = await domain.engagements.dispute(client.actor, {
      engagementId,
      amount: "600",
      reason: "The second coat is missing on the east wall.",
    });
    expect(disputed).toMatchObject({ ok: true });
    clock.advance({ days: 2 });

    expect(
      await domain.engagements.releaseHeld(client.actor, { engagementId, amount: "600" }),
    ).toMatchObject({ ok: true });

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe("completed");
    for (const party of [client, artisan]) {
      expect((await reviewNotices(domain, party)).map((notice) => notice.title)).toEqual([
        expect.stringMatching(/^Write a Review of the (Artisan|Client) by 14 Oct 2026, 08:00/),
      ]);
      expect(await domain.reviews.write(party.actor, { engagementId, rating: 3 })).toMatchObject({
        ok: true,
      });
    }
  });

  test("opens when the Artisan's Dispute of a Fix request ends with the Engagement Completed", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, engagementId } = await completedJob(given, {
      until: "marked-complete",
    });
    await domain.engagements.requestFix(client.actor, {
      engagementId,
      note: "The east wall needs a second coat.",
    });
    await domain.engagements.dispute(artisan.actor, {
      engagementId,
      reason: "Both coats are on; the east wall is a different paint.",
    });
    clock.advance({ hours: 1 });

    await domain.engagements.releaseHeld(client.actor, { engagementId, amount: "1500" });

    for (const party of [client, artisan]) {
      expect((await reviewNotices(domain, party)).map((notice) => notice.event)).toEqual([
        "review.window-opened",
      ]);
    }
    expect(await domain.reviews.write(artisan.actor, { engagementId, rating: 4 })).toMatchObject({
      ok: true,
    });
  });

  test("stays shut when a Dispute against a Cancellation ends the Engagement Cancelled again", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await completedJob(given, {
      until: "marked-complete",
    });
    await domain.engagements.cancel(client.actor, { engagementId });
    await domain.engagements.dispute(artisan.actor, {
      engagementId,
      reason: "The work was finished and marked complete.",
    });

    await domain.engagements.releaseHeld(client.actor, { engagementId, amount: "1500" });

    for (const party of [client, artisan]) {
      expect(await reviewNotices(domain, party)).toEqual([]);
      expect(await domain.reviews.write(party.actor, { engagementId, rating: 4 })).toMatchObject({
        ok: false,
        refusal: { reason: "not-completed" },
      });
    }
  });

  test("opens when the Admin's decision of a Chargeback Completes the Engagement", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId, collectionId } = await completedJob(given, {
      until: "marked-complete",
    });
    const admin = await given.admin();
    await given.chargedBack(collectionId);
    await given.chargebackClosed(collectionId, { outcome: "lost", reversedCents: 210_000 });
    const [open] = (await domain.queues.home(admin.actor, { queue: "chargebacks" }))!.items;
    const item = await domain.queues.item(admin.actor, { itemId: open!.id });
    const fields = Object.fromEntries(
      item!.decisions[0]!.fields.flatMap((field) => [
        [field.key, String(field.totalCents)],
        [`${field.key}.of`, String(field.totalCents)],
      ]),
    );
    expect(
      await domain.queues.decide(admin.actor, {
        itemId: item!.id,
        decision: "decide",
        reason: "The work was done.",
        fields,
      }),
    ).toMatchObject({ ok: true });

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe("completed");
    for (const party of [client, artisan]) {
      expect((await reviewNotices(domain, party)).map((notice) => notice.event)).toEqual([
        "review.window-opened",
      ]);
    }
    // The Artisan's Review is how other Artisans learn the Client charged it back.
    expect(await domain.reviews.write(artisan.actor, { engagementId, rating: 1 })).toMatchObject({
      ok: true,
    });
  });
});

describe("the Review window's clocks", () => {
  test("remind a side that has not written 48 hours before it closes, and tell both when it closes", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await completedJob(given);
    clock.advance({ days: 1 });
    await domain.reviews.write(artisan.actor, { engagementId, rating: 4 });

    clock.advance({ days: 3, hours: 23 });
    await domain.system.runDueClocks();
    expect(await reviewNotices(domain, client)).toHaveLength(1);

    clock.advance({ hours: 1 });
    await domain.system.runDueClocks();
    expect((await reviewNotices(domain, client)).at(-1)).toMatchObject({
      event: "review.reminder",
      title:
        "48 hours left to write your Review of the Artisan, until 12 Oct 2026, 08:00: Paint the lounge",
      link: `/jobs/${jobId}`,
    });
    expect((await reviewNotices(domain, artisan)).map((notice) => notice.event)).toEqual([
      "review.window-opened",
    ]);

    clock.advance({ days: 2 });
    await domain.system.runDueClocks();
    for (const party of [client, artisan]) {
      expect((await reviewNotices(domain, party)).at(-1)).toMatchObject({
        event: "review.window-closed",
        title: "The seven days to write Reviews are over: Paint the lounge",
        link: `/jobs/${jobId}`,
      });
    }
  });

  test("do nothing while a Chargeback freezes the Engagement, as every clock on it", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, collectionId } = await completedJob(given);
    await given.chargedBack(collectionId);

    clock.advance({ days: 8 });
    await domain.system.runDueClocks();

    for (const party of [client, artisan]) {
      expect((await reviewNotices(domain, party)).map((notice) => notice.event)).toEqual([
        "review.window-opened",
      ]);
    }
  });

  test("remind neither side that has written", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, engagementId } = await completedJob(given);
    await domain.reviews.write(client.actor, { engagementId, rating: 5 });
    await domain.reviews.write(artisan.actor, { engagementId, rating: 5 });

    clock.advance({ days: 6 });
    await domain.system.runDueClocks();

    for (const party of [client, artisan]) {
      expect((await reviewNotices(domain, party)).map((notice) => notice.event)).toEqual([
        "review.window-opened",
      ]);
    }
  });
});

describe("writing a Review", () => {
  test("each party writes one, a rating and an optional comment, which waits for the Admin", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await completedJob(given);
    clock.advance({ hours: 3 });

    expect(
      await domain.reviews.write(client.actor, {
        engagementId,
        rating: 5,
        comment: "Neat, quick, and cleaned up after.",
      }),
    ).toEqual({ ok: true, value: { state: "being-checked" } });
    expect(await domain.reviews.write(artisan.actor, { engagementId, rating: 4 })).toEqual({
      ok: true,
      value: { state: "being-checked" },
    });

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.reviews).toEqual({
      closesAt: new Date("2026-10-12T06:00:00Z"),
      open: true,
      mine: {
        rating: 5,
        comment: "Neat, quick, and cleaned up after.",
        state: "being-checked",
        reason: null,
        writtenAt: clock.now(),
      },
      theirs: null,
    });
    expect(
      (await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement?.reviews,
    ).toMatchObject({
      mine: { rating: 4, comment: null, state: "being-checked" },
      theirs: null,
    });
    const admin = await given.admin();
    const home = await domain.queues.home(admin.actor, { queue: "pre-checks" });
    expect(home?.items.map((item) => item.title).sort()).toEqual([
      "Review of Sipho Dlamini, by Thandi Mokoena",
      "Review of Thandi Mokoena, by Sipho Dlamini",
    ]);
  });

  test("is one per party, and cannot be written again or changed", async () => {
    const { domain, given } = await createHarness();
    const { client, engagementId } = await completedJob(given);
    await domain.reviews.write(client.actor, { engagementId, rating: 2 });

    expect(await domain.reviews.write(client.actor, { engagementId, rating: 5 })).toEqual({
      ok: false,
      refusal: { reason: "already-written", message: expect.any(String) },
    });
  });

  test("is not written on a Cancelled Engagement, nor before it is Completed", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await completedJob(given, { until: "hired" });

    for (const party of [client, artisan]) {
      expect(await domain.reviews.write(party.actor, { engagementId, rating: 4 })).toMatchObject({
        ok: false,
        refusal: { reason: "not-completed" },
      });
    }
    expect(await domain.engagements.cancel(client.actor, { engagementId })).toMatchObject({
      ok: true,
    });
    for (const party of [client, artisan]) {
      expect(await domain.reviews.write(party.actor, { engagementId, rating: 4 })).toMatchObject({
        ok: false,
        refusal: { reason: "not-completed" },
      });
    }
  });

  test("is not written once the seven days have passed", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, engagementId } = await completedJob(given);
    clock.advance({ days: 6, hours: 23, minutes: 59 });
    expect(await domain.reviews.write(artisan.actor, { engagementId, rating: 3 })).toMatchObject({
      ok: true,
    });

    clock.advance({ minutes: 1 });

    expect(await domain.reviews.write(client.actor, { engagementId, rating: 3 })).toEqual({
      ok: false,
      refusal: { reason: "window-closed", message: expect.any(String) },
    });
  });

  test("is written only by a party, with a rating from 1 to 5", async () => {
    const { domain, given } = await createHarness();
    const { client, engagementId } = await completedJob(given);
    const stranger = await given.client();

    expect(await domain.reviews.write(stranger.actor, { engagementId, rating: 4 })).toMatchObject({
      ok: false,
      refusal: { reason: "not-found" },
    });
    expect(
      await domain.reviews.write({ kind: "visitor" }, { engagementId, rating: 4 }),
    ).toMatchObject({ ok: false, refusal: { reason: "parties-only" } });
    for (const rating of [0, 6, 4.5]) {
      expect(await domain.reviews.write(client.actor, { engagementId, rating })).toEqual({
        ok: false,
        refusal: { reason: "invalid", message: "Choose a rating from 1 to 5." },
      });
    }
  });

  test("a comment the Content check is sure of is refused, and nothing is recorded", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { client, jobId, engagementId } = await completedJob(given);

    expect(
      await domain.reviews.write(client.actor, {
        engagementId,
        rating: 5,
        comment: "Call him on 082 555 1234, he is cheaper off the app.",
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "content" } });
    contentReader.force({ kind: "sure-hit", reason: "It threatens the Artisan." });
    expect(
      await domain.reviews.write(client.actor, { engagementId, rating: 1, comment: "Watch out." }),
    ).toEqual({ ok: false, refusal: { reason: "content", message: "It threatens the Artisan." } });

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.reviews?.mine).toBeNull();
    expect(await domain.reviews.write(client.actor, { engagementId, rating: 4 })).toMatchObject({
      ok: true,
    });
  });

  test("a comment the Content check is unsure of goes to the Admin with what it made of it", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { client, engagementId } = await completedJob(given);
    contentReader.force({ kind: "unsure", reason: "It may name a social handle." });

    expect(
      await domain.reviews.write(client.actor, {
        engagementId,
        rating: 4,
        comment: "Find his other work at sipho dot paints.",
      }),
    ).toEqual({ ok: true, value: { state: "being-checked" } });

    const admin = await given.admin();
    const item = await reviewItem(domain, admin);
    expect(item?.tabs).toEqual(
      expect.arrayContaining([
        {
          key: "review",
          label: "The Review",
          blocks: [
            {
              kind: "facts",
              facts: [
                { label: "Rating", value: "4 out of 5" },
                { label: "Written", value: expect.any(String) },
              ],
            },
            { kind: "text", text: "Find his other work at sipho dot paints." },
          ],
        },
        {
          key: "check",
          label: "Content check",
          blocks: [{ kind: "text", text: "It may name a social handle." }],
        },
      ]),
    );
    expect(item?.decisions.map((decision) => decision.label)).toEqual([
      "Publish",
      "Refuse: fraud",
      "Refuse: abuse",
      "Refuse: personal data",
    ]);
  });
});

describe("reading the other party's Review", () => {
  test("waits until both have written, and for the Admin to publish it", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await completedJob(given);
    const admin = await given.admin();
    await domain.reviews.write(client.actor, { engagementId, rating: 5, comment: "Lovely job." });
    await decideReviews(domain, admin, "publish");

    expect(await theirs(domain, artisan, jobId)).toBeNull();

    clock.advance({ days: 1 });
    await domain.reviews.write(artisan.actor, { engagementId, rating: 4 });

    expect(await theirs(domain, artisan, jobId)).toEqual({
      reviewId: expect.any(String),
      rating: 5,
      comment: "Lovely job.",
      writtenAt: new Date("2026-10-05T06:00:00Z"),
    });
    // The Artisan's waits for the Admin.
    expect(await theirs(domain, client, jobId)).toBeNull();
    await decideReviews(domain, admin, "publish");
    expect(await theirs(domain, client, jobId)).toMatchObject({ rating: 4, comment: null });
  });

  test("is read once the seven days pass, though the reader wrote none", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await completedJob(given);
    const admin = await given.admin();
    await domain.reviews.write(artisan.actor, { engagementId, rating: 3, comment: "Paid late." });
    await decideReviews(domain, admin, "publish");
    clock.advance({ days: 6, hours: 23 });
    expect(await theirs(domain, client, jobId)).toBeNull();

    clock.advance({ hours: 1 });

    expect(await theirs(domain, client, jobId)).toMatchObject({ rating: 3, comment: "Paid late." });
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.reviews).toMatchObject({
      open: false,
      mine: null,
    });
  });
});

describe("the Admin's Pre-check", () => {
  test("publishes a Review written in the window even after it closes, telling its author", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await completedJob(given);
    await domain.reviews.write(client.actor, { engagementId, rating: 5 });
    clock.advance({ days: 10 });
    const admin = await given.admin();

    await decideReviews(domain, admin, "publish");

    expect(await theirs(domain, artisan, jobId)).toMatchObject({ rating: 5 });
    expect(
      (await domain.jobs.view(client.actor, { jobId }))?.engagement?.reviews?.mine,
    ).toMatchObject({ state: "published", reason: null });
    expect((await reviewNotices(domain, client)).at(-1)).toMatchObject({
      event: "review.published",
      title: "Your Review is checked and published: Paint the lounge",
      link: `/jobs/${jobId}`,
    });
    expect((await reviewNotices(domain, artisan)).map((notice) => notice.event)).not.toContain(
      "review.published",
    );
  });

  test("refuses one only on a ground, telling its author, and it is never shown", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await completedJob(given);
    await domain.reviews.write(client.actor, {
      engagementId,
      rating: 1,
      comment: "His wife Nomsa Dlamini answers his phone at home.",
    });
    const admin = await given.admin();
    clock.advance({ hours: 1 });

    await decideReviews(domain, admin, "refuse.personal-data", "It names his family and home.");

    expect(
      (await domain.jobs.view(client.actor, { jobId }))?.engagement?.reviews?.mine,
    ).toMatchObject({ state: "refused", reason: "Personal data: It names his family and home." });
    expect((await reviewNotices(domain, client)).at(-1)).toMatchObject({
      event: "review.refused",
      title: "Your Review was refused for personal data: Paint the lounge",
    });
    // Refused, it was written: the Client writes no other.
    expect(await domain.reviews.write(client.actor, { engagementId, rating: 1 })).toMatchObject({
      ok: false,
      refusal: { reason: "already-written" },
    });
    await domain.reviews.write(artisan.actor, { engagementId, rating: 5 });
    clock.advance({ days: 8 });
    expect(await theirs(domain, artisan, jobId)).toBeNull();
  });
});

describe("Reviews of an Artisan", () => {
  test("show on the Profile to anyone, newest first, with one average and count", async () => {
    const { domain, given, clock } = await createHarness();
    const first = await completedJob(given);
    const { artisan } = first;
    const second = await completedJob(given, {
      artisan,
      client: await given.client({ name: "Ayesha Khan" }),
    });
    const third = await completedJob(given, { artisan });
    const admin = await given.admin();
    await domain.reviews.write(first.client.actor, {
      engagementId: first.engagementId,
      rating: 5,
      comment: "Neat and quick.",
    });
    clock.advance({ hours: 1 });
    await domain.reviews.write(second.client.actor, {
      engagementId: second.engagementId,
      rating: 4,
    });
    await decideReviews(domain, admin, "publish");
    // Waiting for the Admin, it is not counted.
    await domain.reviews.write(third.client.actor, { engagementId: third.engagementId, rating: 1 });
    // Neither is read before the seven days, as the Artisan wrote neither.
    expect(
      (await domain.profiles.view({ kind: "visitor" }, { artisanId: artisan.actor.accountId }))
        ?.reviews,
    ).toEqual({
      average: null,
      count: 0,
      items: [],
      more: false,
    });

    clock.advance({ days: 7 });

    const profile = await domain.profiles.view(
      { kind: "visitor" },
      { artisanId: artisan.actor.accountId },
    );
    expect(profile).toMatchObject({ completed: 3 });
    expect(profile?.reviews).toEqual({
      average: 4.5,
      count: 2,
      items: [
        {
          reviewId: expect.any(String),
          rating: 4,
          comment: null,
          writtenAt: new Date("2026-10-05T07:00:00Z"),
          category: { id: "painting", name: "Painting" },
          reviewer: "Ayesha K.",
        },
        {
          reviewId: expect.any(String),
          rating: 5,
          comment: "Neat and quick.",
          writtenAt: new Date("2026-10-05T06:00:00Z"),
          category: { id: "painting", name: "Painting" },
          reviewer: "Thandi M.",
        },
      ],
      more: false,
    });
  });

  test("come 20 at a time", async () => {
    const { domain, given, clock } = await createHarness();
    const first = await completedJob(given);
    const { client, artisan } = first;
    const engagements = [first.engagementId];
    for (let n = 1; n < 21; n += 1) {
      engagements.push((await completedJob(given, { client, artisan })).engagementId);
    }
    for (const [n, engagementId] of engagements.entries()) {
      clock.advance({ minutes: 1 });
      await domain.reviews.write(client.actor, { engagementId, rating: (n % 5) + 1 });
    }
    await decideReviews(domain, await given.admin(), "publish");
    clock.advance({ days: 7 });

    const page = await domain.reviews.ofArtisan(
      { kind: "visitor" },
      { artisanId: artisan.actor.accountId },
    );
    expect(page).toMatchObject({ count: 21, more: true });
    expect(page?.items).toHaveLength(20);
    // The newest, the 21st, was rated 1 (20 % 5 + 1).
    expect(page?.items[0]).toMatchObject({ rating: 1 });
    const next = await domain.reviews.ofArtisan(
      { kind: "visitor" },
      { artisanId: artisan.actor.accountId, page: 1 },
    );
    expect(next).toMatchObject({ count: 21, more: false, items: [{ rating: 1 }] });
  });
});

describe("Browse", () => {
  test("orders by Available for Jobs, then higher Review average, then more Reviews, then name", async () => {
    const { domain, given, clock } = await createHarness();
    const client = await given.client();
    const rated = async (name: string, ratings: number[]) => {
      const artisan = await given.matchableArtisan({ name });
      for (const rating of ratings) {
        const { engagementId } = await completedJob(given, { client, artisan });
        await domain.reviews.write(client.actor, { engagementId, rating });
      }
      return artisan;
    };
    await rated("Zola Mthembu", [5]);
    await rated("Andile Zulu", [5, 5]);
    await rated("Bongani Shabalala", [4]);
    await rated("Ayanda Dube", []);
    await rated("Cebo Ndlovu", []);
    const away = await rated("Dumi Mahlangu", [5, 5, 5]);
    await domain.availability.set(away.actor, { available: false });
    await decideReviews(domain, await given.admin(), "publish");
    clock.advance({ days: 7 });

    const listed = await domain.profiles.browse({ kind: "visitor" }, { category: "painting" });

    expect(listed.map((artisan) => artisan.publicName)).toEqual([
      "Andile Zulu",
      "Zola Mthembu",
      "Bongani Shabalala",
      "Ayanda Dube",
      "Cebo Ndlovu",
      "Dumi Mahlangu",
    ]);
    expect(listed.map((artisan) => artisan.reviews)).toEqual([
      { average: 5, count: 2 },
      { average: 5, count: 1 },
      { average: 4, count: 1 },
      { average: null, count: 0 },
      { average: null, count: 0 },
      { average: 5, count: 3 },
    ]);
  });
});

describe("the Client's Quote list", () => {
  test("shows each Artisan's Review average and count, and Completed count", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, engagementId } = await completedJob(given);
    await domain.reviews.write(client.actor, { engagementId, rating: 4 });
    await decideReviews(domain, await given.admin(), "publish");
    clock.advance({ days: 7 });
    const jobId = await given.openJob(client, { title: "Paint the bedroom" });
    await given.sentQuote(artisan, jobId);

    expect((await domain.quotes.forJob(client.actor, { jobId }))?.[0]?.artisan).toMatchObject({
      reviews: { average: 4, count: 1 },
      completed: 1,
    });
  });
});

describe("Reviews of a Client", () => {
  test("are read beside the Job Match by an Artisan offered, invited to, or Quoting on the Client's Job, and nobody else", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, engagementId } = await completedJob(given);
    await domain.reviews.write(artisan.actor, { engagementId, rating: 2, comment: "Paid late." });
    await decideReviews(domain, await given.admin(), "publish");
    clock.advance({ days: 7 });
    const offered = await given.matchableArtisan({ name: "Lerato Nkosi" });
    const elsewhere = await given.matchableArtisan({ regions: ["southern"] });
    const jobId = await given.openJob(client, { title: "Paint the bedroom" });

    const shown = {
      average: 2,
      count: 1,
      items: [
        {
          reviewId: expect.any(String),
          rating: 2,
          comment: "Paid late.",
          writtenAt: new Date("2026-10-05T06:00:00Z"),
          category: { id: "painting", name: "Painting" },
          reviewer: "Sipho Dlamini",
        },
      ],
      more: false,
    };
    expect((await domain.jobs.viewAsArtisan(offered.actor, { jobId }))?.client).toEqual({
      shownName: "Thandi M.",
      reviews: shown,
      completed: 1,
    });
    expect(await domain.reviews.ofClient(offered.actor, { jobId })).toEqual(shown);
    for (const actor of [elsewhere.actor, client.actor, { kind: "visitor" } as Actor]) {
      expect(await domain.reviews.ofClient(actor, { jobId })).toBeNull();
    }

    const [review] = (await domain.reviews.ofClient(offered.actor, { jobId }))!.items;
    expect(
      await domain.reports.report(offered.actor, {
        about: { kind: "review", id: review!.reviewId },
        reason: "fake-or-misleading",
      }),
    ).toEqual({ ok: true, value: {} });

    await domain.matches.pass(offered.actor, { jobId });
    expect(await domain.reviews.ofClient(offered.actor, { jobId })).toBeNull();
    const invited = await domain.invitations.invite(client.actor, {
      jobId,
      artisanId: elsewhere.actor.accountId,
    });
    expect(invited).toMatchObject({ ok: true });
    expect(await domain.reviews.ofClient(elsewhere.actor, { jobId })).toEqual(shown);
  });
});

describe("Reporting a Review", () => {
  test("anyone signed in may Report a Review shown, and the Admin may remove it, telling its author", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await completedJob(given);
    await domain.reviews.write(client.actor, {
      engagementId,
      rating: 1,
      comment: "Never hire him, he is a crook.",
    });
    const admin = await given.admin();
    await decideReviews(domain, admin, "publish");
    clock.advance({ days: 7 });
    const reviewId = (
      await domain.reviews.ofArtisan({ kind: "visitor" }, { artisanId: artisan.actor.accountId })
    )?.items[0]?.reviewId;
    const reader = await given.client();

    expect(
      await domain.reports.report(reader.actor, {
        about: { kind: "review", id: reviewId! },
        reason: "threat-or-abuse",
      }),
    ).toEqual({ ok: true, value: {} });
    expect(
      await domain.reports.report(artisan.actor, {
        about: { kind: "review", id: reviewId! },
        reason: "fake-or-misleading",
        note: "This Client never paid the second half.",
      }),
    ).toEqual({ ok: true, value: {} });

    const [open] = (await domain.queues.home(admin.actor, { queue: "reports" }))!.items;
    // The first reporter read it on the Profile, without the Job.
    expect(open?.title).toBe("Report of a Review: Sipho Dlamini");
    const item = await domain.queues.item(admin.actor, { itemId: open!.id });
    expect(item?.decisions.map((decision) => decision.label)).toEqual([
      "Dismiss",
      "Remove: fraud",
      "Remove: abuse",
      "Remove: personal data",
      "Warn",
      "Suspend",
      "Leaving: warn",
      "Leaving, openly dodging the fees: suspend",
    ]);
    expect(item?.tabs).toContainEqual(
      expect.objectContaining({
        key: "review",
        label: "The Review",
        blocks: expect.arrayContaining([{ kind: "text", text: "Never hire him, he is a crook." }]),
      }),
    );
    clock.advance({ hours: 1 });

    expect(
      await domain.queues.decide(admin.actor, {
        itemId: open!.id,
        decision: "remove.abuse",
        reason: "It calls him a crook.",
      }),
    ).toMatchObject({ ok: true });

    expect(
      await domain.reviews.ofArtisan({ kind: "visitor" }, { artisanId: artisan.actor.accountId }),
    ).toMatchObject({ average: null, count: 0, items: [] });
    expect(await theirs(domain, artisan, jobId)).toBeNull();
    expect(
      (await domain.jobs.view(client.actor, { jobId }))?.engagement?.reviews?.mine,
    ).toMatchObject({ state: "removed", reason: "Abuse: It calls him a crook." });
    expect((await reviewNotices(domain, client)).at(-1)).toMatchObject({
      event: "review.removed",
      title: "Your Review was removed for abuse: Paint the lounge",
      link: `/jobs/${jobId}`,
    });
  });

  test("is only of a Review the reporter can read, and never of their own", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await completedJob(given);
    await domain.reviews.write(artisan.actor, { engagementId, rating: 2, comment: "Rude." });
    await domain.reviews.write(client.actor, { engagementId, rating: 5 });
    await decideReviews(domain, await given.admin(), "publish");
    const reviewId = (await theirs(domain, client, jobId))!.reviewId;
    const reader = await given.client();
    const report = (actor: Actor) =>
      domain.reports.report(actor, { about: { kind: "review", id: reviewId }, reason: "other" });

    // A Review of a Client is read by the Client, and Artisans offered its Jobs, not by anyone.
    expect(await report(reader.actor)).toMatchObject({
      ok: false,
      refusal: { reason: "not-found" },
    });
    expect(await report(artisan.actor)).toMatchObject({ ok: false, refusal: { reason: "own" } });
    expect(await report(client.actor)).toEqual({ ok: true, value: {} });
    expect(await domain.notices.list(client.actor)).toContainEqual(
      expect.objectContaining({ event: "report.received", link: `/jobs/${jobId}` }),
    );
  });
});

/**
 * A Client's Painting Job, Hired from the default Quote, its work started,
 * marked complete, and Approved by the Client today (5 October 2026, 08:00),
 * or taken only as far as asked. The Artisan is Sipho Dlamini; the Client,
 * Thandi Mokoena, unless given.
 */
async function completedJob(
  given: Harness["given"],
  parties: {
    until?: "hired" | "marked-complete" | "approved";
    client?: Account;
    artisan?: Account;
  } = {},
) {
  const { until = "approved" } = parties;
  const client = parties.client ?? (await given.client({ name: "Thandi Mokoena" }));
  const artisan = parties.artisan ?? (await given.matchableArtisan({ name: "Sipho Dlamini" }));
  const jobId = await given.openJob(client);
  const quoteId = await given.sentQuote(artisan, jobId, { startOn: "2026-10-05" });
  const collectionId = await given.hired(client, quoteId);
  const engagementId = await given.engagementOf(client, jobId);
  const job = { client, artisan, jobId, quoteId, engagementId, collectionId };
  if (until === "hired") return job;
  await given.workStarted(client, engagementId);
  await given.markedComplete(artisan, engagementId);
  if (until === "marked-complete") return job;
  await given.approved(client, engagementId);
  return job;
}

/** The Admin's page of the one Review waiting in Pre-checks. */
async function reviewItem(domain: Harness["domain"], admin: { actor: Actor }) {
  const home = await domain.queues.home(admin.actor, { queue: "pre-checks" });
  const [first] = home?.items ?? [];
  return first ? domain.queues.item(admin.actor, { itemId: first.id }) : null;
}

/** What the Account was told of Reviews, oldest first. */
async function reviewNotices(domain: Harness["domain"], account: { actor: Actor }) {
  const notices = await domain.notices.list(account.actor);
  return notices.filter((notice) => notice.event.startsWith("review.")).reverse();
}

/** The Admin decides every Review waiting in Pre-checks the same way. */
async function decideReviews(
  domain: Harness["domain"],
  admin: { actor: Actor },
  decision: string,
  reason?: string,
) {
  const home = await domain.queues.home(admin.actor, { queue: "pre-checks" });
  for (const item of home?.items ?? []) {
    const decided = await domain.queues.decide(admin.actor, { itemId: item.id, decision, reason });
    if (!decided.ok) throw new Error(decided.refusal.message);
  }
}

/** The other party's Review as the party reads it on the Job page. */
async function theirs(domain: Harness["domain"], party: { actor: Actor }, jobId: string) {
  const job =
    party.actor.kind === "client"
      ? await domain.jobs.view(party.actor, { jobId })
      : await domain.jobs.viewAsArtisan(party.actor, { jobId });
  return job?.engagement?.reviews?.theirs;
}
