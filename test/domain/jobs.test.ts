import { describe, expect, test } from "vitest";
import { visitor, type Actor, type AdminActor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";
import { photo } from "../support/verification";

// A Client posts a Job (#121): its trade, site, details, and photos, and
// "Find Artisans for me" or "Only Artisans I invite". A Draft may omit
// anything. Posting reads the text and photos with the Content check, locks
// the trade, the site, the gas answer, and the matching choice, and opens the
// Job for 14 days; the Client may close it, and Renew it once it Expires.

describe("a Draft", () => {
  test("may omit anything, and waits in My Jobs under Needs you", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();

    const saved = await domain.jobs.saveDraft(client.actor, { title: "Leaking geyser" });

    expect(saved).toEqual({ ok: true, value: { jobId: expect.any(String) } });
    expect(await domain.jobs.mine(client.actor)).toEqual({
      needsYou: [expect.objectContaining({ title: "Leaking geyser", state: "draft" })],
      inProgress: [],
      finished: [],
    });
  });

  test("is continued by its Client, keeping the photos kept and adding more", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();
    const { jobId } = expectOk(
      await domain.jobs.saveDraft(client.actor, { title: "Geyser", add: [await photo()] }),
    );
    const [first] = (await domain.jobs.view(client.actor, { jobId }))!.photos;

    const saved = await domain.jobs.saveDraft(client.actor, {
      jobId,
      title: "Leaking geyser",
      category: "plumbing",
      suburbId: "sea-point",
      street: "12 Main Road",
      keep: [first!.id],
      add: [await photo()],
    });

    expect(saved).toEqual({ ok: true, value: { jobId } });
    const job = await domain.jobs.view(client.actor, { jobId });
    expect(job).toMatchObject({
      state: "draft",
      title: "Leaking geyser",
      category: { id: "plumbing", name: "Plumbing" },
      suburb: { id: "sea-point", name: "SEA POINT" },
      region: { id: "table-bay", name: "Table Bay" },
      street: "12 Main Road",
    });
    expect(job!.photos.map((each) => each.id)).toEqual([first!.id, expect.any(String)]);
    expect((await domain.jobs.mine(client.actor))!.needsYou).toHaveLength(1);
  });

  test("is discarded by its Client, with its photos", async () => {
    const { domain, given, files } = await createHarness();
    const client = await given.client();
    const { jobId } = expectOk(
      await domain.jobs.saveDraft(client.actor, { title: "Geyser", add: [await photo()] }),
    );

    expect(await domain.jobs.discard(client.actor, { jobId })).toEqual({ ok: true, value: {} });

    expect(await domain.jobs.view(client.actor, { jobId })).toBeNull();
    expect(await domain.jobs.mine(client.actor)).toEqual({
      needsYou: [],
      inProgress: [],
      finished: [],
    });
    expect((await files.list()).objects).toEqual([]);
  });

  test("is the Client's alone", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();
    const other = await given.client({ name: "Ayesha Khan" });
    const artisan = await given.artisan();
    const { jobId } = expectOk(await domain.jobs.saveDraft(client.actor, { title: "Geyser" }));

    for (const actor of [visitor, other.actor, artisan.actor]) {
      expect(await domain.jobs.view(actor, { jobId })).toBeNull();
      expect(await domain.jobs.saveDraft(actor, { jobId, title: "Mine now" })).toMatchObject({
        ok: false,
      });
      expect(await domain.jobs.discard(actor, { jobId })).toMatchObject({ ok: false });
    }
    expect(await domain.jobs.mine(other.actor)).toMatchObject({ needsYou: [] });
    expect(await domain.jobs.mine(artisan.actor)).toBeNull();
    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ title: "Geyser" });
  });

  test("refuses a suburb that is not on the City's list, and more than 10 photos", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();
    const eleven = await Promise.all(Array.from({ length: 11 }, () => photo()));

    expect(
      await domain.jobs.saveDraft(client.actor, { suburbId: "atlantis-on-sea" }),
    ).toMatchObject({ ok: false, refusal: { reason: "invalid" } });
    expect(await domain.jobs.saveDraft(client.actor, { add: eleven })).toMatchObject({
      ok: false,
      refusal: { message: "A Job has at most 10 photos." },
    });
    expect(await domain.jobs.mine(client.actor)).toMatchObject({ needsYou: [] });
  });
});

describe("posting a Job", () => {
  test("opens a complete Draft for 14 days, In progress", async () => {
    const { domain, given, clock } = await createHarness();
    const client = await given.client();
    const jobId = await given.jobDraft(client);

    const posted = await domain.jobs.post(client.actor, { jobId });

    expect(posted).toEqual({ ok: true, value: { state: "open" } });
    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      state: "open",
      category: { id: "painting", name: "Painting" },
      siteType: "home",
      suburb: { id: "sea-point", name: "SEA POINT" },
      region: { id: "table-bay", name: "Table Bay" },
      street: "12 Main Road",
      title: "Paint the lounge",
      description: "Two walls, about 20 square metres.",
      photos: [expect.any(Object)],
      gasWork: null,
      preferredStart: null,
      matching: "matched",
      openedAt: clock.now(),
      expiresAt: new Date(clock.now().getTime() + 14 * DAY),
    });
    expect(await domain.jobs.mine(client.actor)).toEqual({
      needsYou: [],
      inProgress: [expect.objectContaining({ jobId, state: "open" })],
      finished: [],
    });
  });

  test("takes an Invite-only Job and a Preferred start date", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();
    const jobId = await given.jobDraft(client, {
      matching: "invite-only",
      siteType: "business",
      preferredStart: "2026-10-20",
    });

    expect(await domain.jobs.post(client.actor, { jobId })).toMatchObject({ ok: true });

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      matching: "invite-only",
      siteType: "business",
      preferredStart: "2026-10-20",
    });
  });

  test.each([
    ["Service Category", { category: null }, "Choose a Service Category."],
    ["Site type", { siteType: null }, "Choose Home or Business."],
    ["suburb", { suburbId: null }, "Choose the suburb."],
    ["street address", { street: "" }, "Write the street address."],
    ["title", { title: " " }, "Write the title."],
    ["description", { description: "" }, "Write the description."],
    [
      "matching choice",
      { matching: null },
      'Choose "Find Artisans for me" or "Only Artisans I invite".',
    ],
    ["photo", { add: [] }, "Add at least one photo."],
  ])("refuses a Draft with no %s, saying so, and keeps it", async (_, missing, message) => {
    const { domain, given } = await createHarness();
    const client = await given.client();
    const jobId = await given.jobDraft(client, missing);

    expect(await domain.jobs.post(client.actor, { jobId })).toEqual({
      ok: false,
      refusal: { reason: "incomplete", message },
    });
    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ state: "draft" });
  });

  test("refuses a Preferred start date already past", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();
    // The clock reads 5 October 2026.
    const jobId = await given.jobDraft(client, { preferredStart: "2026-10-04" });

    expect(await domain.jobs.post(client.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: { reason: "incomplete", message: "The Preferred start date has passed." },
    });
  });

  test("asks a Plumbing Job whether the work installs or removes gas, and a yes marks it gas work", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();
    const unanswered = await given.jobDraft(client, { category: "plumbing" });
    const gas = await given.jobDraft(client, { category: "plumbing", gasWork: true });
    const noGas = await given.jobDraft(client, { category: "plumbing", gasWork: false });

    expect(await domain.jobs.post(client.actor, { jobId: unanswered })).toMatchObject({
      ok: false,
      refusal: { message: "Say whether the work installs or removes gas." },
    });
    for (const jobId of [gas, noGas]) {
      expect(await domain.jobs.post(client.actor, { jobId })).toMatchObject({ ok: true });
    }
    expect(await domain.jobs.view(client.actor, { jobId: gas })).toMatchObject({ gasWork: true });
    expect(await domain.jobs.view(client.actor, { jobId: noGas })).toMatchObject({
      gasWork: false,
    });
  });

  test("asks no gas question of any other trade", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();
    const jobId = await given.jobDraft(client, { category: "electrical", gasWork: true });

    expect(await domain.jobs.post(client.actor, { jobId })).toMatchObject({ ok: true });

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ gasWork: null });
  });

  test("is for the Client's own Draft only", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();
    const other = await given.client({ name: "Ayesha Khan" });
    const jobId = await given.jobDraft(client);

    expect(await domain.jobs.post(other.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: { reason: "not-found" },
    });
    expect(await domain.jobs.post(client.actor, { jobId })).toMatchObject({ ok: true });
    expect(await domain.jobs.post(client.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: { reason: "not-found" },
    });
  });
});

describe("the Content check on posting", () => {
  test.each([
    ["a phone number", { description: "Call me on 082 555 0123" }, /phone number/],
    ["a link", { title: "See paintpros.co.za" }, /link/],
  ])("refuses a Job with %s at once, and keeps the Draft", async (_, fields, message) => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const client = await given.client();
    const jobId = await given.jobDraft(client, fields);

    expect(await domain.jobs.post(client.actor, { jobId })).toEqual({
      ok: false,
      refusal: { reason: "content", message: expect.stringMatching(message) },
    });
    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ state: "draft" });
    expect(await domain.queues.home(admin.actor)).toMatchObject({ counts: { "pre-checks": 0 } });
  });

  test("reads each photo", async () => {
    const { domain, given, contentReader } = await createHarness();
    const client = await given.client();
    const jobId = await given.jobDraft(client);
    contentReader.photosSay("WhatsApp 082 555 0123");

    expect(await domain.jobs.post(client.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: { reason: "content", message: expect.stringMatching(/phone number/) },
    });
  });

  test("refuses what the content reader is sure about, with its reason", async () => {
    const { domain, given, contentReader } = await createHarness();
    const client = await given.client();
    const jobId = await given.jobDraft(client);
    contentReader.force({ kind: "sure-hit", reason: "It asks to pay in cash." });

    expect(await domain.jobs.post(client.actor, { jobId })).toEqual({
      ok: false,
      refusal: { reason: "content", message: "It asks to pay in cash." },
    });
  });
});

describe("a Draft saved while posting reads it", () => {
  test.each([
    ["clear", { kind: "clear" }],
    ["unsure", { kind: "unsure", reason: "It may name a social handle." }],
  ] as const)(
    "is not posted when the Content check is %s, and stays a Draft",
    async (_, verdict) => {
      const harness = await createHarness();
      const { domain, given, contentReader } = harness;
      const admin = await given.admin();
      const client = await given.client();
      const jobId = await given.jobDraft(client);
      const read = contentReader.read;
      // The Client saves a new version while the Content check reads the old one.
      contentReader.read = async () => {
        contentReader.read = read;
        const job = (await domain.jobs.view(client.actor, { jobId }))!;
        await domain.jobs.saveDraft(client.actor, {
          jobId,
          category: job.category?.id,
          siteType: job.siteType,
          suburbId: job.suburb?.id,
          street: job.street,
          title: "Call 0825550123 for the details",
          description: job.description,
          matching: job.matching,
          keep: job.photos.map((each) => each.id),
        });
        return verdict;
      };

      expect(await domain.jobs.post(client.actor, { jobId })).toMatchObject({
        ok: false,
        refusal: { reason: "changed" },
      });
      expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ state: "draft" });
      expect(await domain.queues.home(admin.actor)).toMatchObject({ counts: { "pre-checks": 0 } });
    },
  );
});

describe("a Held Job", () => {
  test("is being checked, not Open, and waits for the Admin, and nobody is told", async () => {
    const harness = await createHarness();
    const { domain, given, contentReader } = harness;
    const admin = await given.admin();
    const client = await given.client({ name: "Thandi Mokoena" });
    const jobId = await given.jobDraft(client);
    contentReader.force({ kind: "unsure", reason: "It may name a social handle." });

    expect(await domain.jobs.post(client.actor, { jobId })).toEqual({
      ok: true,
      value: { state: "held" },
    });

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      state: "held",
      openedAt: null,
      expiresAt: null,
    });
    expect(await domain.jobs.mine(client.actor)).toMatchObject({
      inProgress: [{ jobId, state: "held" }],
    });
    const { id } = await preCheck(harness, admin);
    const item = await domain.queues.item(admin.actor, { itemId: id });
    expect(item).toMatchObject({
      title: "Job: Paint the lounge",
      decisions: [{ key: "release" }, { key: "refuse" }],
      tabs: [
        {
          key: "job",
          blocks: [
            {
              kind: "facts",
              facts: expect.arrayContaining([
                { label: "Service Category", value: "Painting" },
                { label: "Suburb", value: "SEA POINT" },
                { label: "Region", value: "Table Bay" },
              ]),
            },
            { kind: "text", text: "Paint the lounge\n\nTwo walls, about 20 square metres." },
            { kind: "files", files: [{ kind: "photo", label: "Photo 1" }] },
          ],
        },
        { key: "check", blocks: [{ kind: "text", text: "It may name a social handle." }] },
      ],
      sidebar: [
        {
          title: "Client",
          blocks: [
            {
              kind: "facts",
              facts: [
                { label: "Name", value: "Thandi Mokoena" },
                { label: "Email", value: client.email },
              ],
            },
          ],
        },
      ],
    });
    // The street is the Client's, and the Content check does not read it.
    expect(JSON.stringify(item)).not.toContain("12 Main Road");
    expect(await domain.notices.list(client.actor)).toEqual([]);
  });

  test("is Held when the Content check cannot run", async () => {
    const { domain, given, contentReader } = await createHarness();
    const client = await given.client();
    const jobId = await given.jobDraft(client);
    contentReader.breaks();

    expect(await domain.jobs.post(client.actor, { jobId })).toEqual({
      ok: true,
      value: { state: "held" },
    });
  });

  test("released by the Admin opens for 14 days from then, and the Client is told", async () => {
    const harness = await createHarness();
    const { domain, given, clock } = harness;
    const admin = await given.admin();
    const client = await given.client();
    const jobId = await heldJob(harness, client);
    clock.advance({ days: 2 });

    await decide(harness, admin, "release");

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      state: "open",
      openedAt: clock.now(),
      expiresAt: new Date(clock.now().getTime() + 14 * DAY),
    });
    expect(await domain.notices.list(client.actor)).toEqual([
      expect.objectContaining({
        event: "held.job.released",
        title: "Your Job is checked and Open",
        link: `/jobs/${jobId}`,
      }),
    ]);
  });

  test("refused by the Admin is a Draft again, showing why, and the Client is told", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const client = await given.client();
    const jobId = await heldJob(harness, client);

    await decide(harness, admin, "refuse", "Leave out the handle.");

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      state: "draft",
      refused: { reason: "Leave out the handle." },
    });
    expect(await domain.jobs.mine(client.actor)).toMatchObject({ needsYou: [{ jobId }] });
    expect(await domain.notices.list(client.actor)).toEqual([
      expect.objectContaining({
        event: "held.job.refused",
        title: "Your Job was refused",
        link: `/jobs/${jobId}`,
      }),
    ]);

    // Fixed and posted again, it no longer shows the refusal.
    harness.contentReader.force({ kind: "clear" });
    await domain.jobs.saveDraft(client.actor, {
      ...(await fieldsOf(domain, client, jobId)),
      jobId,
    });
    expect(await domain.jobs.post(client.actor, { jobId })).toMatchObject({ ok: true });
    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      state: "open",
      refused: null,
    });
  });

  test("withdrawn by its Client is a Draft again, and leaves the Admin nothing", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const client = await given.client();
    const other = await given.client({ name: "Ayesha Khan" });
    const jobId = await heldJob(harness, client);

    expect(await domain.jobs.withdraw(other.actor, { jobId })).toMatchObject({ ok: false });
    expect(await domain.jobs.withdraw(client.actor, { jobId })).toEqual({ ok: true, value: {} });

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      state: "draft",
      refused: null,
    });
    expect(await domain.queues.home(admin.actor)).toMatchObject({ counts: { "pre-checks": 0 } });
    expect(await domain.jobs.withdraw(client.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: { reason: "nothing-held" },
    });
  });

  test("cannot be withdrawn once the Admin has decided", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const client = await given.client();
    const jobId = await heldJob(harness, client);
    await decide(harness, admin, "release");

    expect(await domain.jobs.withdraw(client.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: { reason: "nothing-held" },
    });
    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ state: "open" });
  });
});

describe("editing a posted Job", () => {
  test("changes the title, description, photos, Site type, and Preferred start, and nothing else", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const client = await given.client();
    const jobId = await given.openJob(client, { add: [await photo(), await photo()] });
    const [, second] = (await domain.jobs.view(client.actor, { jobId }))!.photos;

    const edited = await domain.jobs.edit(client.actor, {
      jobId,
      title: "Paint the lounge and hall",
      description: "Three walls now.",
      siteType: "business",
      preferredStart: "2026-11-02",
      keep: [second!.id],
      add: [await photo()],
    });

    expect(edited).toEqual({ ok: true, value: { edit: "applied" } });
    const job = await domain.jobs.view(client.actor, { jobId });
    expect(job).toMatchObject({
      state: "open",
      title: "Paint the lounge and hall",
      description: "Three walls now.",
      siteType: "business",
      preferredStart: "2026-11-02",
      category: { id: "painting" },
      suburb: { id: "sea-point" },
      street: "12 Main Road",
      gasWork: null,
      matching: "matched",
      edit: { beingChecked: null, refused: null },
    });
    expect(job!.photos.map((each) => each.id)).toEqual([second!.id, expect.any(String)]);
  });

  test("locks the trade, the site, the gas answer, and the matching choice at posting", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const client = await given.client();
    const jobId = await given.openJob(client, { category: "plumbing", gasWork: true });

    expect(
      await domain.jobs.saveDraft(client.actor, { jobId, category: "tiling", gasWork: false }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-found" } });

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      category: { id: "plumbing" },
      gasWork: true,
      suburb: { id: "sea-point" },
      street: "12 Main Road",
      matching: "matched",
    });
  });

  test("refuses no photo, a past Preferred start, or no change", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const client = await given.client();
    const jobId = await given.openJob(client);
    const job = (await domain.jobs.view(client.actor, { jobId }))!;
    const asPosted = {
      jobId,
      title: job.title,
      description: job.description,
      siteType: job.siteType!,
      preferredStart: null,
      keep: job.photos.map((each) => each.id),
    };

    expect(await domain.jobs.edit(client.actor, { ...asPosted, keep: [] })).toMatchObject({
      ok: false,
      refusal: { message: "Add at least one photo." },
    });
    expect(
      await domain.jobs.edit(client.actor, { ...asPosted, preferredStart: "2026-10-01" }),
    ).toMatchObject({ ok: false, refusal: { message: "The Preferred start date has passed." } });
    expect(await domain.jobs.edit(client.actor, { ...asPosted, title: "" })).toMatchObject({
      ok: false,
      refusal: { message: "Write the title." },
    });
    expect(await domain.jobs.edit(client.actor, asPosted)).toMatchObject({
      ok: false,
      refusal: { reason: "unchanged" },
    });
  });

  test("keeps a Preferred start date that has passed since, while the rest changes", async () => {
    const harness = await createHarness();
    const { domain, given, clock } = harness;
    const client = await given.client();
    const jobId = await given.openJob(client, { preferredStart: "2026-10-07" });
    clock.advance({ days: 5 });

    expect(await editTitle(harness, client, jobId, "Paint the hall")).toMatchObject({ ok: true });

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      title: "Paint the hall",
      preferredStart: "2026-10-07",
    });
  });

  test("is read by the Content check, and a sure hit is refused and changes nothing", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const client = await given.client();
    const jobId = await given.openJob(client);

    expect(
      await editTitle(harness, client, jobId, "Paint the lounge, call 082 555 0123"),
    ).toMatchObject({
      ok: false,
      refusal: { reason: "content", message: expect.stringMatching(/phone number/) },
    });
    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      title: "Paint the lounge",
    });
  });

  test("the Content check is unsure about waits for the Admin, and the Job shows as posted meanwhile", async () => {
    const harness = await createHarness();
    const { domain, given, contentReader } = harness;
    const admin = await given.admin();
    const client = await given.client();
    const jobId = await given.openJob(client);
    contentReader.force({ kind: "unsure", reason: "It may name a social handle." });

    expect(await editTitle(harness, client, jobId, "Paint by @brushes")).toEqual({
      ok: true,
      value: { edit: "being-checked" },
    });

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      state: "open",
      title: "Paint the lounge",
      edit: { beingChecked: { title: "Paint by @brushes" }, refused: null },
    });
    const { id } = await preCheck(harness, admin);
    expect(await domain.queues.item(admin.actor, { itemId: id })).toMatchObject({
      title: "Job edit: Paint the lounge",
      tabs: [
        {
          key: "edit",
          blocks: expect.arrayContaining([
            { kind: "text", text: expect.stringContaining("Paint by @brushes") },
          ]),
        },
        {
          key: "shown",
          blocks: expect.arrayContaining([
            { kind: "text", text: expect.stringContaining("Paint the lounge") },
          ]),
        },
        { key: "check", blocks: [{ kind: "text", text: "It may name a social handle." }] },
      ],
    });
    contentReader.force({ kind: "clear" });
    expect(await editTitle(harness, client, jobId, "Paint the hall")).toMatchObject({
      ok: false,
      refusal: { reason: "being-checked" },
    });
  });

  test("Held and released by the Admin is applied, and the Client is told", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await heldEdit(harness, client, jobId, "Paint by @brushes");

    await decide(harness, admin, "release");

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      title: "Paint by @brushes",
      edit: { beingChecked: null, refused: null },
    });
    expect(await domain.notices.list(client.actor)).toEqual([
      expect.objectContaining({
        event: "held.job-edit.released",
        title: "Your Job edit is checked and shown",
        link: `/jobs/${jobId}`,
      }),
    ]);
  });

  test("Held and refused by the Admin leaves the Job as it was, showing why", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await heldEdit(harness, client, jobId, "Paint by @brushes");

    await decide(harness, admin, "refuse", "Leave out the handle.");

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      title: "Paint the lounge",
      edit: {
        beingChecked: null,
        refused: { title: "Paint by @brushes", reason: "Leave out the handle." },
      },
    });
    expect(await domain.notices.list(client.actor)).toEqual([
      expect.objectContaining({
        event: "held.job-edit.refused",
        title: "Your Job edit was refused",
      }),
    ]);
    expect(await editTitle(harness, client, jobId, "Paint the hall")).toMatchObject({ ok: true });
    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      title: "Paint the hall",
      edit: { beingChecked: null, refused: null },
    });
  });

  test("Held and withdrawn by the Client leaves the Job as it was, and deletes the photos it added", async () => {
    const harness = await createHarness();
    const { domain, given, files } = harness;
    const admin = await given.admin();
    const client = await given.client();
    const jobId = await given.openJob(client);
    const before = (await files.list()).objects.map((object) => object.key);
    harness.contentReader.force({ kind: "unsure", reason: "It may name a social handle." });
    const job = (await domain.jobs.view(client.actor, { jobId }))!;
    expectOk(
      await domain.jobs.edit(client.actor, {
        jobId,
        title: job.title,
        description: job.description,
        siteType: job.siteType!,
        keep: job.photos.map((each) => each.id),
        add: [await photo()],
      }),
    );

    expect(await domain.jobs.withdraw(client.actor, { jobId })).toEqual({ ok: true, value: {} });

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      state: "open",
      photos: [{ id: job.photos[0]!.id }],
      edit: { beingChecked: null, refused: null },
    });
    expect(await domain.queues.home(admin.actor)).toMatchObject({ counts: { "pre-checks": 0 } });
    expect((await files.list()).objects.map((object) => object.key)).toEqual(before);
  });

  test("is for an Open or Expired Job only", async () => {
    const harness = await createHarness();
    const { domain, given, clock } = harness;
    const client = await given.client();
    const expired = await given.openJob(client);
    clock.advance({ days: 14 });
    await domain.system.runDueClocks();
    const closed = await given.openJob(client);
    await domain.jobs.close(client.actor, { jobId: closed });
    const held = await heldJob(harness, client);
    const unposted = await given.jobDraft(client);

    expect(await editTitle(harness, client, expired, "Paint the hall")).toMatchObject({
      ok: true,
    });
    for (const jobId of [closed, held, unposted]) {
      expect(await editTitle(harness, client, jobId, "Paint the hall")).toMatchObject({
        ok: false,
        refusal: { reason: "not-editable" },
      });
    }
  });
});

describe("who sees a Job", () => {
  test("no Visitor, Artisan, or other Client reads it, its suburb, or its street", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const client = await given.client();
    const other = await given.client({ name: "Ayesha Khan" });
    const artisan = await given.verifiedArtisan({ categories: ["painting"] });
    await domain.regions.choose(artisan.actor, { regionIds: ["table-bay"] });
    const jobId = await given.openJob(client);

    for (const viewer of [visitor, other.actor, artisan.actor]) {
      expect(await domain.jobs.view(viewer, { jobId })).toBeNull();
    }
    expect(await domain.jobs.mine(artisan.actor)).toBeNull();
    expect(await domain.jobs.mine(visitor)).toBeNull();
  });

  test("serves its photos to its Client and the Admin, and nobody else", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const client = await given.client();
    const other = await given.client({ name: "Ayesha Khan" });
    const artisan = await given.verifiedArtisan({ categories: ["painting"] });
    const jobId = await given.openJob(client);
    const [shown] = (await domain.jobs.view(client.actor, { jobId }))!.photos;
    harness.contentReader.force({ kind: "unsure", reason: "It may name a social handle." });
    const job = (await domain.jobs.view(client.actor, { jobId }))!;
    expectOk(
      await domain.jobs.edit(client.actor, {
        jobId,
        title: job.title,
        description: job.description,
        siteType: job.siteType!,
        keep: [shown!.id],
        add: [await photo()],
      }),
    );
    const [, waiting] = (await domain.jobs.view(client.actor, { jobId }))!.edit.beingChecked!
      .photos;

    for (const photoId of [shown!.id, waiting!.id]) {
      for (const viewer of [client.actor, admin.actor]) {
        expect(await domain.jobs.photo(viewer, { jobId, photoId })).toMatchObject({
          contentType: "image/webp",
        });
        expect(await domain.jobs.photo(viewer, { jobId, photoId, thumbnail: true })).toMatchObject({
          contentType: "image/webp",
        });
      }
      for (const viewer of [visitor, other.actor, artisan.actor]) {
        expect(await domain.jobs.photo(viewer, { jobId, photoId })).toBeNull();
      }
    }
    expect(await domain.jobs.photo(client.actor, { jobId, photoId: "nope" })).toBeNull();
    // Only the Job named holds it.
    harness.contentReader.force({ kind: "clear" });
    expect(
      await domain.jobs.photo(admin.actor, {
        jobId: await given.openJob(client),
        photoId: waiting!.id,
      }),
    ).toBeNull();
  });
});

/** Edits a posted Job's title, leaving the rest as it is. */
async function editTitle(
  { domain }: Harness,
  client: { actor: Actor },
  jobId: string,
  title: string,
) {
  const job = (await domain.jobs.view(client.actor, { jobId }))!;
  return domain.jobs.edit(client.actor, {
    jobId,
    title,
    description: job.description,
    siteType: job.siteType!,
    preferredStart: job.preferredStart,
    keep: job.photos.map((each) => each.id),
  });
}

/** An edit the Content check was unsure about, waiting for the Admin. */
async function heldEdit(harness: Harness, client: { actor: Actor }, jobId: string, title: string) {
  harness.contentReader.force({ kind: "unsure", reason: "It may name a social handle." });
  const edited = expectOk(await editTitle(harness, client, jobId, title));
  harness.contentReader.force({ kind: "clear" });
  if (edited.edit !== "being-checked") throw new Error("Expected the edit to be Held");
}

describe("closing a Job", () => {
  test("closes an Open Job before Hire, which is Finished", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const client = await given.client();
    const jobId = await given.openJob(client);

    expect(await domain.jobs.close(client.actor, { jobId })).toEqual({ ok: true, value: {} });

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ state: "closed" });
    expect(await domain.jobs.mine(client.actor)).toEqual({
      needsYou: [],
      inProgress: [],
      finished: [expect.objectContaining({ jobId, state: "closed" })],
    });
    expect(await domain.jobs.close(client.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: { reason: "not-open" },
    });
  });

  test("withdraws an edit waiting for the Admin", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const client = await given.client();
    const jobId = await given.openJob(client);
    await heldEdit(harness, client, jobId, "Paint by @brushes");

    expect(await domain.jobs.close(client.actor, { jobId })).toEqual({ ok: true, value: {} });

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      state: "closed",
      title: "Paint the lounge",
      edit: { beingChecked: null },
    });
    expect(await domain.queues.home(admin.actor)).toMatchObject({ counts: { "pre-checks": 0 } });
  });

  test("is only for the Client's own Open Job", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const client = await given.client();
    const other = await given.client({ name: "Ayesha Khan" });
    const jobId = await given.openJob(client);
    const draftId = await given.jobDraft(client);
    const heldId = await heldJob(harness, client);

    expect(await domain.jobs.close(other.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: { reason: "not-found" },
    });
    for (const id of [draftId, heldId]) {
      expect(await domain.jobs.close(client.actor, { jobId: id })).toMatchObject({
        ok: false,
        refusal: { reason: "not-open" },
      });
    }
  });
});

describe("a Job's 14 days", () => {
  test("end in Expiry without a Hire, with the Client reminded 24 hours before", async () => {
    const harness = await createHarness();
    const { domain, given, clock } = harness;
    const client = await given.client();
    const jobId = await given.openJob(client);

    clock.advance({ days: 13 });
    await domain.system.runDueClocks();

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ state: "open" });
    expect(await domain.notices.list(client.actor)).toEqual([
      expect.objectContaining({
        event: "job.expiring",
        title: "Your Job expires in 24 hours: Paint the lounge",
        link: `/jobs/${jobId}`,
      }),
    ]);

    clock.advance({ days: 1 });
    await domain.system.runDueClocks();

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ state: "expired" });
    expect(await domain.notices.list(client.actor)).toContainEqual(
      expect.objectContaining({
        event: "job.expired",
        title: "Your Job expired: Paint the lounge",
        link: `/jobs/${jobId}`,
      }),
    );
    expect(await domain.jobs.mine(client.actor)).toMatchObject({
      finished: [{ jobId, state: "expired" }],
    });
  });

  test("count from the Admin's release of a Held Job", async () => {
    const harness = await createHarness();
    const { domain, given, clock } = harness;
    const admin = await given.admin();
    const client = await given.client();
    const jobId = await heldJob(harness, client);
    clock.advance({ days: 3 });
    await decide(harness, admin, "release");

    clock.advance({ days: 13, hours: 23 });
    await domain.system.runDueClocks();

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ state: "open" });
    clock.advance({ hours: 1 });
    await domain.system.runDueClocks();
    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ state: "expired" });
  });

  test("end with no reminder or Expiry once the Job is closed", async () => {
    const harness = await createHarness();
    const { domain, given, clock } = harness;
    const client = await given.client();
    const jobId = await given.openJob(client);
    await domain.jobs.close(client.actor, { jobId });

    clock.advance({ days: 15 });
    await domain.system.runDueClocks();

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ state: "closed" });
    expect(await domain.notices.list(client.actor)).toEqual([]);
  });
});

describe("renewing a Job", () => {
  test("opens an Expired Job for a new 14 days, from now", async () => {
    const harness = await createHarness();
    const { domain, given, clock } = harness;
    const client = await given.client();
    const jobId = await given.openJob(client);
    clock.advance({ days: 20 });
    await domain.system.runDueClocks();

    expect(await domain.jobs.renew(client.actor, { jobId })).toEqual({ ok: true, value: {} });

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      state: "open",
      openedAt: clock.now(),
      expiresAt: new Date(clock.now().getTime() + 14 * DAY),
    });
    expect(await domain.jobs.mine(client.actor)).toMatchObject({
      inProgress: [{ jobId, state: "open" }],
    });

    clock.advance({ days: 13 });
    await domain.system.runDueClocks();
    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ state: "open" });
    expect(
      (await domain.notices.list(client.actor)).filter((each) => each.event === "job.expiring"),
    ).toHaveLength(2);
    clock.advance({ days: 1 });
    await domain.system.runDueClocks();
    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ state: "expired" });
  });

  test("is only for the Client's own Expired Job", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const client = await given.client();
    const jobId = await given.openJob(client);

    expect(await domain.jobs.renew(client.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: { reason: "not-expired" },
    });
    await domain.jobs.close(client.actor, { jobId });
    expect(await domain.jobs.renew(client.actor, { jobId })).toMatchObject({
      ok: false,
      refusal: { reason: "not-expired" },
    });
  });
});

/** A Job the Content check was unsure about, waiting for the Admin. */
async function heldJob(harness: Harness, client: { actor: Actor }) {
  const jobId = await harness.given.jobDraft(client);
  harness.contentReader.force({ kind: "unsure", reason: "It may name a social handle." });
  const posted = expectOk(await harness.domain.jobs.post(client.actor, { jobId }));
  harness.contentReader.force({ kind: "clear" });
  if (posted.state !== "held") throw new Error("Expected the Job to be Held");
  return jobId;
}

/** A Draft's fields as saved, photos kept, to save it again. */
async function fieldsOf(domain: Harness["domain"], client: { actor: Actor }, jobId: string) {
  const job = (await domain.jobs.view(client.actor, { jobId }))!;
  return {
    category: job.category?.id,
    siteType: job.siteType,
    suburbId: job.suburb?.id,
    street: job.street,
    title: job.title,
    description: job.description,
    gasWork: job.gasWork,
    preferredStart: job.preferredStart,
    matching: job.matching,
    keep: job.photos.map((each) => each.id),
  };
}

/** The one Pre-check waiting, as the Admin finds it on the home stream. */
async function preCheck({ domain }: Harness, admin: { actor: AdminActor }) {
  const home = await domain.queues.home(admin.actor, { queue: "pre-checks" });
  const [item, ...more] = home?.items ?? [];
  if (!item || more.length > 0) throw new Error("Expected one Pre-check waiting");
  return item;
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

const DAY = 24 * 60 * 60 * 1000;

/** The value of a command that must not be refused. */
function expectOk<T>(result: { ok: true; value: T } | { ok: false; refusal: { message: string } }) {
  if (!result.ok) throw new Error(result.refusal.message);
  return result.value;
}
