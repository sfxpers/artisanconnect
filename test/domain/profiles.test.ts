import { describe, expect, test } from "vitest";
import { visitor, type AdminActor, type Actor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";
import { photo } from "../support/verification";

// Anyone, signed in or not, browses verified Artisans one Service Category at
// a time and opens a public Artisan Profile (#120, ADR 0016). The Artisan
// edits the Profile in place; every edit is read by the Content check and
// waits for the Admin's Pre-check, and the old version shows meanwhile.

/** The public names Browse lists, in its order. */
async function browsed(
  domain: Awaited<ReturnType<typeof createHarness>>["domain"],
  input: { category: string; regionId?: string },
) {
  return (await domain.profiles.browse(visitor, input)).map((artisan) => artisan.publicName);
}

describe("Browse", () => {
  test("lists the Artisans verified for the Service Category, and nobody else", async () => {
    const { domain, given } = await createHarness();
    await given.verifiedArtisan({ name: "Sipho Dlamini", categories: ["plumbing"] });
    await given.verifiedArtisan({ name: "Ayesha Khan", categories: ["electrical", "plumbing"] });
    await given.verifiedArtisan({ name: "Johan Botha", categories: ["electrical"] });
    await given.artisan({ name: "Lerato Nkosi" });

    expect(await browsed(domain, { category: "plumbing" })).toEqual([
      "Ayesha Khan",
      "Sipho Dlamini",
    ]);
    expect(await browsed(domain, { category: "electrical" })).toEqual([
      "Ayesha Khan",
      "Johan Botha",
    ]);
    expect(await browsed(domain, { category: "tiling" })).toEqual([]);
  });

  test("narrowed by Region lists only the Artisans who work in it", async () => {
    const { domain, given } = await createHarness();
    const sipho = await given.verifiedArtisan({ name: "Sipho Dlamini" });
    const ayesha = await given.verifiedArtisan({ name: "Ayesha Khan" });
    await given.verifiedArtisan({ name: "Johan Botha" });
    await domain.regions.choose(sipho.actor, { regionIds: ["table-bay", "southern"] });
    await domain.regions.choose(ayesha.actor, { regionIds: ["southern"] });

    expect(await browsed(domain, { category: "plumbing", regionId: "table-bay" })).toEqual([
      "Sipho Dlamini",
    ]);
    expect(await browsed(domain, { category: "plumbing", regionId: "southern" })).toEqual([
      "Ayesha Khan",
      "Sipho Dlamini",
    ]);
    expect(await browsed(domain, { category: "plumbing", regionId: "helderberg" })).toEqual([]);
  });

  test("puts the Available for Jobs first, then orders by public name A to Z", async () => {
    const { domain, given } = await createHarness();
    const zola = await given.verifiedArtisan({ name: "Zola Mthembu" });
    await given.verifiedArtisan({ name: "Ayesha Khan" });
    const busy = await given.verifiedArtisan({
      name: "Sipho Dlamini",
      tradingName: "Bright Pipes",
    });
    await given.verifiedArtisan({ name: "Johan Botha", tradingName: "cape drains" });
    await domain.availability.set(busy.actor, { available: false });

    expect(await browsed(domain, { category: "plumbing" })).toEqual([
      "Ayesha Khan",
      "cape drains",
      "Zola Mthembu",
      "Bright Pipes",
    ]);
    await domain.availability.set(zola.actor, { available: false });
    expect(await browsed(domain, { category: "plumbing" })).toEqual([
      "Ayesha Khan",
      "cape drains",
      "Bright Pipes",
      "Zola Mthembu",
    ]);
  });

  test("drops an Artisan once a check the category needs expires", async () => {
    const { domain, given, clock } = await createHarness();
    await given.verifiedArtisan({ name: "Sipho Dlamini", categories: ["electrical"] });
    await given.verifiedArtisan({ name: "Ayesha Khan", categories: ["painting"] });

    // The electrical contractor registration expires on 2028-12-31.
    clock.set(new Date("2028-12-31T00:00:00+02:00"));

    expect(await browsed(domain, { category: "electrical" })).toEqual([]);
    expect(await browsed(domain, { category: "painting" })).toEqual(["Ayesha Khan"]);
  });

  test("leaves out an Artisan whose names are being checked", async () => {
    const harness = await createHarness();
    const { domain, given, contentReader } = harness;
    await given.admin();
    contentReader.force({ kind: "unsure", reason: "The trading name may be a handle." });
    await given.verifiedArtisan({ name: "Sipho Dlamini", tradingName: "SiphoFixes" });
    contentReader.force({ kind: "clear" });

    expect(await browsed(domain, { category: "plumbing" })).toEqual([]);
  });

  test("is the same for a Visitor, a Client, and an Artisan", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.verifiedArtisan({ name: "Sipho Dlamini" });
    const client = await given.client();

    const asVisitor = await domain.profiles.browse(visitor, { category: "plumbing" });

    expect(asVisitor).toEqual([
      {
        artisanId: artisan.actor.accountId,
        publicName: "Sipho Dlamini",
        availableForJobs: true,
        gasWork: false,
        regions: [],
      },
    ]);
    expect(await domain.profiles.browse(client.actor, { category: "plumbing" })).toEqual(asVisitor);
    expect(await domain.profiles.browse(artisan.actor, { category: "plumbing" })).toEqual(
      asVisitor,
    );
  });
});

describe("an Artisan Profile", () => {
  test("shows the categories verified, badges, Regions, Completed count, rating, and Reviews, and no contact", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.verifiedArtisan({
      name: "Sipho Dlamini",
      tradingName: "Bright Pipes",
      categories: ["plumbing", "painting"],
      gasWork: true,
    });
    await domain.regions.choose(artisan.actor, { regionIds: ["table-bay", "southern"] });

    const profile = await domain.profiles.view(visitor, { artisanId: artisan.actor.accountId });

    expect(profile).toEqual({
      artisanId: artisan.actor.accountId,
      publicName: "Bright Pipes",
      about: "",
      photos: [],
      categories: [
        { category: "plumbing", name: "Plumbing", gasWork: true },
        { category: "painting", name: "Painting", gasWork: false },
      ],
      badges: [
        expect.objectContaining({ name: "Identity verified", expiresOn: null }),
        expect.objectContaining({ name: "Work photos, Plumbing" }),
        expect.objectContaining({ name: "Trained plumber" }),
        expect.objectContaining({ name: "Gas practitioner registration", expiresOn: "2028-12-31" }),
        expect.objectContaining({ name: "Work photos, Painting" }),
      ],
      regions: [
        { id: "southern", name: "Southern" },
        { id: "table-bay", name: "Table Bay" },
      ],
      availableForJobs: true,
      completed: 0,
      reviews: { average: null, count: 0, items: [] },
    });
    expect(JSON.stringify(profile)).not.toContain("@example.com");
  });

  test("is the same for anyone who opens it", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.verifiedArtisan();
    const client = await given.client();
    const other = await given.verifiedArtisan({ name: "Ayesha Khan" });
    const admin = await given.admin();
    const input = { artisanId: artisan.actor.accountId };

    const asVisitor = await domain.profiles.view(visitor, input);

    expect(asVisitor).not.toBeNull();
    for (const viewer of [client.actor, other.actor, artisan.actor, admin.actor]) {
      expect(await domain.profiles.view(viewer, input)).toEqual(asVisitor);
    }
  });

  test("stays open once the Artisan's Verification lapses, showing no category, out of Browse", async () => {
    const { domain, given, clock } = await createHarness();
    const artisan = await given.verifiedArtisan({
      name: "Sipho Dlamini",
      categories: ["electrical"],
    });

    // The electrical contractor registration expires on 2028-12-31.
    clock.set(new Date("2028-12-31T00:00:00+02:00"));

    const profile = await domain.profiles.view(visitor, { artisanId: artisan.actor.accountId });
    expect(profile).toMatchObject({ publicName: "Sipho Dlamini", categories: [] });
    expect(profile!.badges.map((badge) => badge.name)).not.toContain(
      "Electrical contractor registration",
    );
    expect(await browsed(domain, { category: "electrical" })).toEqual([]);
  });

  test("does not exist for an Artisan verified for nothing, a Client, or an unknown id", async () => {
    const { domain, given } = await createHarness();
    const unverified = await given.artisan();
    const client = await given.client();

    for (const artisanId of [unverified.actor.accountId, client.actor.accountId, "nobody"]) {
      expect(await domain.profiles.view(visitor, { artisanId })).toBeNull();
    }
  });
});

/** The one Pre-check waiting, as the Admin finds it on the home stream. */
async function preCheck({ domain }: Harness, admin: { actor: AdminActor }) {
  const home = await domain.queues.home(admin.actor, { queue: "pre-checks" });
  const [item, ...more] = home?.items ?? [];
  if (!item || more.length > 0) throw new Error("Expected one Pre-check waiting");
  return item;
}

/** Sends a Profile edit that must not be refused. */
async function edit(
  { domain }: Harness,
  artisan: { actor: Actor },
  input: { about: string; keep?: string[]; add?: Blob[] },
) {
  const sent = await domain.profiles.edit(artisan.actor, { keep: [], add: [], ...input });
  if (!sent.ok) throw new Error(sent.refusal.message);
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

/** A verified Artisan whose Profile shows this version, released by the Admin. */
async function artisanShowing(
  harness: Harness,
  admin: { actor: AdminActor },
  version: { about: string; add?: Blob[] },
) {
  const artisan = await harness.given.verifiedArtisan({ name: "Sipho Dlamini" });
  await edit(harness, artisan, version);
  await decide(harness, admin, "release");
  return artisan;
}

describe("editing the Profile", () => {
  test("waits for the Admin's Pre-check, and the old version shows meanwhile", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await given.verifiedArtisan({ name: "Sipho Dlamini" });
    const input = { artisanId: artisan.actor.accountId };

    const sent = await domain.profiles.edit(artisan.actor, {
      about: "Twenty years fixing geysers.",
      keep: [],
      add: [await photo()],
    });

    expect(sent).toEqual({ ok: true, value: { profile: "being-checked" } });
    expect(await domain.profiles.view(visitor, input)).toMatchObject({ about: "", photos: [] });
    expect(await domain.profiles.mine(artisan.actor)).toMatchObject({
      shown: { about: "", photos: [] },
      beingChecked: { about: "Twenty years fixing geysers.", photos: [expect.any(Object)] },
      refused: null,
    });
    expect(await preCheck(harness, admin)).toMatchObject({ title: "Profile: Sipho Dlamini" });
    // Nobody is told an edit waits.
    expect(await domain.notices.list(artisan.actor)).not.toContainEqual(
      expect.objectContaining({ event: expect.stringMatching(/profile/) }),
    );
  });

  test("once the Admin releases it, shows it, and tells the Artisan", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await given.verifiedArtisan({ name: "Sipho Dlamini" });
    await edit(harness, artisan, { about: "Twenty years fixing geysers.", add: [await photo()] });

    await decide(harness, admin, "release");

    const profile = await domain.profiles.view(visitor, { artisanId: artisan.actor.accountId });
    expect(profile).toMatchObject({
      about: "Twenty years fixing geysers.",
      photos: [{ id: expect.any(String), width: 64, height: 48 }],
    });
    expect(await domain.profiles.mine(artisan.actor)).toMatchObject({
      shown: { about: "Twenty years fixing geysers." },
      beingChecked: null,
      refused: null,
    });
    expect(await domain.notices.list(artisan.actor)).toContainEqual(
      expect.objectContaining({
        event: "held.profile.released",
        title: "Your Profile edit is accepted and shown",
        link: "/profile",
      }),
    );
  });

  test("refused by the Admin leaves the old version shown, and tells the Artisan why", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await artisanShowing(harness, admin, { about: "Geysers and leaks." });
    await edit(harness, artisan, { about: "The best plumber in Cape Town." });

    await decide(harness, admin, "refuse", "A Profile may not claim to be the best.");

    expect(
      await domain.profiles.view(visitor, { artisanId: artisan.actor.accountId }),
    ).toMatchObject({ about: "Geysers and leaks." });
    expect(await domain.profiles.mine(artisan.actor)).toMatchObject({
      shown: { about: "Geysers and leaks." },
      beingChecked: null,
      refused: {
        about: "The best plumber in Cape Town.",
        reason: "A Profile may not claim to be the best.",
      },
    });
    expect(await domain.notices.list(artisan.actor)).toContainEqual(
      expect.objectContaining({
        event: "held.profile.refused",
        title: "Your Profile edit was refused",
        link: "/profile",
      }),
    );
  });

  test.each([
    ["a phone number", "Call me on 082 555 0123", /phone number/],
    ["a link", "See siphofixes.co.za", /link/],
  ])("with %s is refused at once, and nothing waits", async (_, about, message) => {
    const harness = await createHarness();
    const admin = await harness.given.admin();
    const artisan = await harness.given.verifiedArtisan();

    const sent = await harness.domain.profiles.edit(artisan.actor, { about, keep: [], add: [] });

    expect(sent).toEqual({
      ok: false,
      refusal: { reason: "content", message: expect.stringMatching(message) },
    });
    expect(await harness.domain.queues.home(admin.actor)).toMatchObject({
      counts: { "pre-checks": 0 },
    });
    expect(await harness.domain.profiles.mine(artisan.actor)).toMatchObject({
      beingChecked: null,
      refused: null,
    });
  });

  test("that the content reader is sure about is refused with its reason", async () => {
    const harness = await createHarness();
    const artisan = await harness.given.verifiedArtisan();
    harness.contentReader.force({ kind: "sure-hit", reason: "It asks to be paid in cash." });

    const sent = await harness.domain.profiles.edit(artisan.actor, {
      about: "Cash only, cheaper that way.",
      keep: [],
      add: [],
    });

    expect(sent).toEqual({
      ok: false,
      refusal: { reason: "content", message: "It asks to be paid in cash." },
    });
  });

  test("has each photo added read by the Content check", async () => {
    const harness = await createHarness();
    const artisan = await harness.given.verifiedArtisan();
    harness.contentReader.photosSay("Sipho Plumbing 082 555 0123");

    const sent = await harness.domain.profiles.edit(artisan.actor, {
      about: "My van.",
      keep: [],
      add: [await photo()],
    });

    expect(sent).toMatchObject({
      ok: false,
      refusal: { reason: "content", message: expect.stringMatching(/phone number/) },
    });
  });

  test("the Content check is unsure about waits too, and the Admin sees why", async () => {
    const harness = await createHarness();
    const admin = await harness.given.admin();
    const artisan = await harness.given.verifiedArtisan();
    harness.contentReader.force({ kind: "unsure", reason: "It may name a social handle." });

    await edit(harness, artisan, { about: "Find me as sipho_fixes." });

    const { id } = await preCheck(harness, admin);
    const item = await harness.domain.queues.item(admin.actor, { itemId: id });
    expect(item).toMatchObject({
      decisions: [{ key: "release" }, { key: "refuse" }],
      tabs: [
        { key: "edit", blocks: [{ kind: "text", text: "Find me as sipho_fixes." }] },
        { key: "shown", blocks: [{ kind: "text", text: "No About text." }] },
        { key: "check", blocks: [{ kind: "text", text: "It may name a social handle." }] },
      ],
    });
  });

  test("waits one at a time, and a withdrawn edit leaves the old version shown", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await artisanShowing(harness, admin, { about: "Geysers and leaks." });
    await edit(harness, artisan, { about: "Geysers, leaks, and drains." });

    expect(
      await domain.profiles.edit(artisan.actor, { about: "Anything else", keep: [], add: [] }),
    ).toMatchObject({ ok: false, refusal: { reason: "being-checked" } });
    expect(await domain.profiles.withdraw(artisan.actor)).toEqual({ ok: true, value: {} });

    expect(await domain.profiles.mine(artisan.actor)).toMatchObject({
      shown: { about: "Geysers and leaks." },
      beingChecked: null,
      refused: null,
    });
    expect(await domain.queues.home(admin.actor)).toMatchObject({ counts: { "pre-checks": 0 } });
    expect(await domain.profiles.withdraw(artisan.actor)).toMatchObject({
      ok: false,
      refusal: { reason: "nothing-held" },
    });
    await edit(harness, artisan, { about: "Geysers, leaks, and drains." });
  });

  test("cannot withdraw an edit the Admin has decided", async () => {
    const harness = await createHarness();
    const admin = await harness.given.admin();
    const artisan = await harness.given.verifiedArtisan();
    await edit(harness, artisan, { about: "Geysers and leaks." });
    const { id } = await preCheck(harness, admin);
    await harness.domain.queues.decide(admin.actor, { itemId: id, decision: "release" });

    expect(await harness.domain.profiles.withdraw(artisan.actor)).toMatchObject({
      ok: false,
      refusal: { reason: "nothing-held" },
    });
  });

  test("keeps, removes, and adds photos, in the order sent", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await artisanShowing(harness, admin, {
      about: "Geysers and leaks.",
      add: [await photo(), await photo(), await photo()],
    });
    const before = (await domain.profiles.mine(artisan.actor))!.shown.photos.map((p) => p.id);

    await edit(harness, artisan, {
      about: "Geysers and leaks.",
      keep: [before[2]!, before[0]!],
      add: [await photo()],
    });
    await decide(harness, admin, "release");

    const after = (await domain.profiles.mine(artisan.actor))!.shown.photos.map((p) => p.id);
    expect(after).toHaveLength(3);
    expect(after.slice(0, 2)).toEqual([before[2], before[0]]);
    expect(before).not.toContain(after[2]);
  });

  test("refuses more than 10 photos, a photo not on the Profile, or no change", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await artisanShowing(harness, admin, {
      about: "Geysers and leaks.",
      add: [await photo()],
    });
    const [shown] = (await domain.profiles.mine(artisan.actor))!.shown.photos;
    const eleven = await Promise.all(Array.from({ length: 10 }, () => photo()));

    expect(
      await domain.profiles.edit(artisan.actor, {
        about: "Geysers and leaks.",
        keep: [shown!.id],
        add: eleven,
      }),
    ).toMatchObject({ ok: false, refusal: { message: "A Profile has at most 10 photos." } });
    expect(
      await domain.profiles.edit(artisan.actor, { about: "New", keep: ["nope"], add: [] }),
    ).toMatchObject({ ok: false, refusal: { reason: "invalid" } });
    expect(
      await domain.profiles.edit(artisan.actor, {
        about: "  Geysers and leaks. ",
        keep: [shown!.id],
        add: [],
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "unchanged" } });
    expect(
      await domain.profiles.edit(artisan.actor, { about: "x".repeat(1001), keep: [], add: [] }),
    ).toMatchObject({ ok: false, refusal: { reason: "invalid" } });
    expect(await domain.queues.home(admin.actor)).toMatchObject({ counts: { "pre-checks": 0 } });
  });

  test("is only for an Artisan", async () => {
    const harness = await createHarness();
    const client = await harness.given.client();

    for (const actor of [visitor, client.actor]) {
      expect(
        await harness.domain.profiles.edit(actor, { about: "Hello", keep: [], add: [] }),
      ).toMatchObject({ ok: false, refusal: { reason: "artisans-only" } });
      expect(await harness.domain.profiles.mine(actor)).toBeNull();
    }
  });
});

describe("the Profiles anyone may open", () => {
  test("are listed for search engines, lapsed ones too, and nobody else's", async () => {
    const harness = await createHarness();
    const { domain, given, clock, contentReader } = harness;
    const plumber = await given.verifiedArtisan({ name: "Sipho Dlamini" });
    const electrician = await given.verifiedArtisan({
      name: "Ayesha Khan",
      categories: ["electrical"],
    });
    await given.artisan({ name: "Lerato Nkosi" });
    await given.client();
    contentReader.force({ kind: "unsure", reason: "The trading name may be a handle." });
    await given.verifiedArtisan({ name: "Johan Botha", tradingName: "JohanFixes" });
    contentReader.force({ kind: "clear" });
    clock.set(new Date("2028-12-31T00:00:00+02:00"));

    const listed = await domain.profiles.listed(visitor);

    expect(listed.map((profile) => profile.artisanId).sort()).toEqual(
      [plumber.actor.accountId, electrician.actor.accountId].sort(),
    );
  });
});

describe("a Profile photo", () => {
  test("is served to anyone once shown, and before that only to its Artisan and the Admin", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await given.verifiedArtisan();
    const other = await given.verifiedArtisan({ name: "Ayesha Khan" });
    await edit(harness, artisan, { about: "My work.", add: [await photo()] });
    const [waiting] = (await domain.profiles.mine(artisan.actor))!.beingChecked!.photos;
    const input = { photoId: waiting!.id };

    expect(await domain.profiles.photo(visitor, input)).toBeNull();
    expect(await domain.profiles.photo(other.actor, input)).toBeNull();
    expect(await domain.profiles.photo(artisan.actor, input)).toMatchObject({
      contentType: "image/webp",
    });
    expect(await domain.profiles.photo(admin.actor, input)).toMatchObject({
      contentType: "image/webp",
    });

    await decide(harness, admin, "release");

    const shown = await domain.profiles.photo(visitor, input);
    const thumbnail = await domain.profiles.photo(visitor, { ...input, thumbnail: true });
    expect(shown).toMatchObject({ contentType: "image/webp" });
    expect(thumbnail).toMatchObject({ contentType: "image/webp" });
    expect(thumbnail!.size).toBeLessThanOrEqual(shown!.size);
  });

  test("is no longer served to anyone else once an edit removes it", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await artisanShowing(harness, admin, { about: "Mine.", add: [await photo()] });
    const [shown] = (await domain.profiles.mine(artisan.actor))!.shown.photos;

    await edit(harness, artisan, { about: "Mine.", keep: [] });
    expect(await domain.profiles.photo(visitor, { photoId: shown!.id })).not.toBeNull();
    await decide(harness, admin, "release");

    expect(await domain.profiles.photo(visitor, { photoId: shown!.id })).toBeNull();
  });

  test("added by an edit the Artisan withdraws is deleted, and one kept stays", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await artisanShowing(harness, admin, { about: "Mine.", add: [await photo()] });
    const [kept] = (await domain.profiles.mine(artisan.actor))!.shown.photos;
    await edit(harness, artisan, { about: "Mine.", keep: [kept!.id], add: [await photo()] });
    const [, added] = (await domain.profiles.mine(artisan.actor))!.beingChecked!.photos;

    await domain.profiles.withdraw(artisan.actor);

    expect(await domain.profiles.photo(artisan.actor, { photoId: added!.id })).toBeNull();
    expect(
      await domain.profiles.photo(artisan.actor, { photoId: added!.id, thumbnail: true }),
    ).toBeNull();
    expect(await domain.profiles.photo(visitor, { photoId: kept!.id })).not.toBeNull();
  });

  test("of an Artisan verified for nothing is served to nobody else", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await given.artisan();
    await edit(harness, artisan, { about: "Soon verified.", add: [await photo()] });
    await decide(harness, admin, "release");
    const [shown] = (await domain.profiles.mine(artisan.actor))!.shown.photos;

    expect(await domain.profiles.mine(artisan.actor)).toMatchObject({ profile: null });
    expect(await domain.profiles.photo(visitor, { photoId: shown!.id })).toBeNull();
    expect(await domain.profiles.photo(artisan.actor, { photoId: shown!.id })).not.toBeNull();
  });
});
