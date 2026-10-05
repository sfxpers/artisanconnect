import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { visitor, type Actor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";

// Cape Town's eight Development Management Districts and its official suburbs
// are seeded data (#119): a suburb gives a Region, and an Artisan picks the
// one to three Regions they work in and switches Available for Jobs.

/** The ids of the Regions an Artisan works in, A to Z by name. */
async function chosenIds(domain: Harness["domain"], artisan: { actor: Actor }) {
  return (await domain.regions.mine(artisan.actor))?.regions.map((region) => region.id);
}

describe("the seeded Regions", () => {
  test("are the City's eight districts, A to Z, holding every official suburb once", async () => {
    const { domain } = await createHarness();

    const regions = await domain.regions.all(visitor);

    expect(regions.map((region) => region.name)).toEqual([
      "Blaauwberg",
      "Cape Flats",
      "Helderberg",
      "Mitchells Plain/Khayelitsha",
      "Northern",
      "Southern",
      "Table Bay",
      "Tygerberg",
    ]);
    const suburbs = regions.flatMap((region) => region.suburbs);
    expect(suburbs).toHaveLength(778);
    expect(new Set(suburbs.map((suburb) => suburb.id)).size).toBe(778);
    expect(new Set(suburbs.map((suburb) => suburb.name)).size).toBe(778);
  });

  test("list each Region's suburbs A to Z", async () => {
    const { domain } = await createHarness();

    const regions = await domain.regions.all(visitor);

    for (const { suburbs } of regions) {
      const names = suburbs.map((suburb) => suburb.name);
      expect(names).toEqual([...names].sort());
    }
  });

  test.each([
    // Wholly in one district.
    ["ATHLONE", "Cape Flats"],
    ["SEA POINT", "Table Bay"],
    // Straddling two, in the one holding most of its address points.
    ["PHILIPPI", "Mitchells Plain/Khayelitsha"],
    ["MUIZENBERG", "Southern"],
    ["KENSINGTON", "Table Bay"],
    // In a gap between districts, in the one it borders.
    ["CLIFTON", "Table Bay"],
  ])("place %s in %s", async (name, region) => {
    const { domain } = await createHarness();

    const [found] = await domain.regions.searchSuburbs(visitor, { query: name });

    expect(found).toMatchObject({ name, region: { name: region } });
  });

  // No command changes a Region or a suburb, so this checks the database
  // itself refuses: the seed holds even against a bug.
  test("refuse moving, renaming, or removing a suburb or a Region", async () => {
    await createHarness();

    await expect(
      env.DB.prepare("UPDATE suburbs SET region_id = 'southern' WHERE id = 'clifton'").run(),
    ).rejects.toThrow(/never moved, renamed, or removed/);
    await expect(
      env.DB.prepare("UPDATE suburbs SET name = 'CLIFTON BEACH' WHERE id = 'clifton'").run(),
    ).rejects.toThrow(/never moved, renamed, or removed/);
    await expect(env.DB.prepare("DELETE FROM suburbs WHERE id = 'clifton'").run()).rejects.toThrow(
      /never moved, renamed, or removed/,
    );
    await expect(
      env.DB.prepare("UPDATE regions SET name = 'Atlantic' WHERE id = 'table-bay'").run(),
    ).rejects.toThrow(/never changes/);
    await expect(
      env.DB.prepare("DELETE FROM regions WHERE id = 'table-bay'").run(),
    ).rejects.toThrow(/never changes/);
  });
});

describe("searching suburbs", () => {
  test.each([
    ["bel'aire", "BEL'AIRE"],
    ["BELAIRE", "BEL'AIRE"],
    ["  Bel Aire ", "BEL'AIRE"],
    ["bokaap", "BO-KAAP"],
    ["Bo Kaap", "BO-KAAP"],
    ["signal hill lions head", "SIGNAL HILL / LIONS HEAD"],
    ["delft 1&2", "DELFT 1 & 2"],
  ])("ignores case, spaces, and punctuation: %j finds %s", async (query, name) => {
    const { domain } = await createHarness();

    const found = await domain.regions.searchSuburbs(visitor, { query });

    expect(found.map((suburb) => suburb.name)).toContain(name);
  });

  test("finds a suburb by any part of its name, those it starts with first", async () => {
    const { domain } = await createHarness();

    const found = await domain.regions.searchSuburbs(visitor, { query: "Strand" });

    expect(found.map((suburb) => suburb.name)).toEqual([
      "STRAND",
      "STRAND GOLF CLUB",
      "STRAND INDUSTRIA",
      "STRANDFONTEIN",
      "STRANDVALE",
      "BLAAUWBERGSTRAND",
      "GORDONS STRAND ESTATE",
      "MELKBOSCH STRAND",
      "ONVERWACHT - THE STRAND",
    ]);
  });

  test("says the Region of each, to tell apart two that read alike", async () => {
    const { domain } = await createHarness();

    const found = await domain.regions.searchSuburbs(visitor, { query: "Natures Valley" });

    expect(found).toEqual([
      {
        id: "nature-s-valley",
        name: "NATURE'S VALLEY",
        region: { id: "helderberg", name: "Helderberg" },
      },
      {
        id: "natures-valley",
        name: "NATURES VALLEY",
        region: { id: "northern", name: "Northern" },
      },
    ]);
  });

  test("finds every seeded suburb by its published name", async () => {
    const { domain } = await createHarness();
    const regions = await domain.regions.all(visitor);

    for (const region of regions) {
      for (const suburb of region.suburbs) {
        const found = await domain.regions.searchSuburbs(visitor, { query: suburb.name });
        expect(found).toContainEqual({
          id: suburb.id,
          name: suburb.name,
          region: { id: region.id, name: region.name },
        });
      }
    }
  });

  test.each([[""], ["   "], ["'-/"]])("finds nothing for %j", async (query) => {
    const { domain } = await createHarness();

    expect(await domain.regions.searchSuburbs(visitor, { query })).toEqual([]);
  });

  test("gives at most twenty", async () => {
    const { domain } = await createHarness();

    const found = await domain.regions.searchSuburbs(visitor, { query: "a" });

    expect(found).toHaveLength(20);
  });
});

describe("an Artisan's Regions", () => {
  test("are none until the Artisan chooses", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.artisan();

    expect(await domain.regions.mine(artisan.actor)).toEqual({ regions: [] });
  });

  test.each([
    [["southern"]],
    [["southern", "table-bay"]],
    [["southern", "table-bay", "cape-flats"]],
  ])("are the one to three chosen: %j", async (regionIds) => {
    const { domain, given } = await createHarness();
    const artisan = await given.artisan();

    const chosen = await domain.regions.choose(artisan.actor, { regionIds });

    expect(chosen.ok && chosen.value.regions.map((region) => region.id)).toEqual(
      [...regionIds].sort(),
    );
    expect(await chosenIds(domain, artisan)).toEqual([...regionIds].sort());
  });

  test("are replaced by a new choice", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.artisan();
    await domain.regions.choose(artisan.actor, { regionIds: ["southern", "table-bay"] });

    await domain.regions.choose(artisan.actor, { regionIds: ["northern"] });

    expect(await domain.regions.mine(artisan.actor)).toEqual({
      regions: [{ id: "northern", name: "Northern" }],
    });
  });

  test("are each Artisan's own", async () => {
    const { domain, given } = await createHarness();
    const first = await given.artisan();
    const second = await given.artisan();

    await domain.regions.choose(first.actor, { regionIds: ["southern"] });

    expect(await chosenIds(domain, second)).toEqual([]);
  });

  test.each([
    ["none", [], /one to three Regions/],
    ["four", ["southern", "table-bay", "cape-flats", "northern"], /one to three Regions/],
    ["one twice", ["southern", "southern"], /once/],
    ["an unknown one", ["southern", "atlantic"], /not a Region/],
    ["no list", "southern", /one to three Regions/],
    ["nothing at all", undefined, /one to three Regions/],
  ])("refuse %s, and keep the last choice", async (_, regionIds, message) => {
    const { domain, given } = await createHarness();
    const artisan = await given.artisan();
    await domain.regions.choose(artisan.actor, { regionIds: ["helderberg"] });

    const chosen = await domain.regions.choose(artisan.actor, { regionIds } as {
      regionIds: string[];
    });

    expect(chosen).toEqual({
      ok: false,
      refusal: { reason: "invalid", message: expect.stringMatching(message) },
    });
    expect(await chosenIds(domain, artisan)).toEqual(["helderberg"]);
  });

  test("are an Artisan's only", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();

    expect(await domain.regions.choose(client.actor, { regionIds: ["southern"] })).toEqual({
      ok: false,
      refusal: { reason: "artisans-only", message: expect.any(String) },
    });
    expect(await domain.regions.choose(visitor, { regionIds: ["southern"] })).toEqual({
      ok: false,
      refusal: { reason: "artisans-only", message: expect.any(String) },
    });
    expect(await domain.regions.mine(client.actor)).toBeNull();
  });
});

describe("Available for Jobs", () => {
  test("is on for a new Artisan", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.artisan();

    expect(await domain.availability.mine(artisan.actor)).toEqual({ availableForJobs: true });
  });

  test("turns off and on", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.artisan();

    const off = await domain.availability.set(artisan.actor, { available: false });
    expect(off).toEqual({ ok: true, value: { availableForJobs: false } });
    expect(await domain.availability.mine(artisan.actor)).toEqual({ availableForJobs: false });

    const on = await domain.availability.set(artisan.actor, { available: true });
    expect(on).toEqual({ ok: true, value: { availableForJobs: true } });
    expect(await domain.availability.mine(artisan.actor)).toEqual({ availableForJobs: true });
  });

  test("keeps the Artisan's Regions", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.artisan();
    await domain.regions.choose(artisan.actor, { regionIds: ["southern"] });

    await domain.availability.set(artisan.actor, { available: false });

    expect(await chosenIds(domain, artisan)).toEqual(["southern"]);
  });

  test("is each Artisan's own", async () => {
    const { domain, given } = await createHarness();
    const first = await given.artisan();
    const second = await given.artisan();

    await domain.availability.set(first.actor, { available: false });

    expect(await domain.availability.mine(second.actor)).toEqual({ availableForJobs: true });
  });

  test("refuses anything but on or off, and stays as it was", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.artisan();

    const set = await domain.availability.set(artisan.actor, {
      available: "false" as unknown as boolean,
    });

    expect(set).toEqual({
      ok: false,
      refusal: { reason: "invalid", message: expect.any(String) },
    });
    expect(await domain.availability.mine(artisan.actor)).toEqual({ availableForJobs: true });
  });

  test("is an Artisan's only", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();

    expect(await domain.availability.set(client.actor, { available: false })).toEqual({
      ok: false,
      refusal: { reason: "artisans-only", message: expect.any(String) },
    });
    expect(await domain.availability.mine(client.actor)).toBeNull();
    expect(await domain.availability.mine(visitor)).toBeNull();
  });
});
