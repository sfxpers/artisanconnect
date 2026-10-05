import { describe, expect, test } from "vitest";
import { visitor } from "@/domain/actor";
import type { ContentVerdict } from "@/domain";
import { createHarness, type Harness } from "../support/harness";

// An Account's names go through the Content check like everything sent
// (#116). A sure hit refuses the sign-up with the reason; unsure names are
// Held: the Account is made, but its names exist only for it and the Admin,
// in the Pre-checks queue, until the Admin releases or refuses them.

const IP = "203.0.113.7";

async function signUp(
  { domain }: Harness,
  details: Partial<Parameters<Harness["domain"]["accounts"]["signUp"]>[1]> = {},
) {
  const rules = await domain.marketplaceRules.current(visitor);
  return domain.accounts.signUp(visitor, {
    kind: "client",
    name: "Thandi Mokoena",
    email: "thandi@example.com",
    password: "correct horse battery",
    rulesVersion: rules.version,
    consentsToDataUse: true,
    ip: IP,
    ...details,
  });
}

/** A Client whose names the content reader is unsure about, signed up and proven. */
async function clientWithHeldNames(
  harness: Harness,
  verdict: ContentVerdict = { kind: "unsure", reason: "The trading name may be a handle." },
) {
  harness.contentReader.force(verdict);
  const signedUp = await signUp(harness, { tradingName: "ThandiFixes" });
  if (!signedUp.ok) throw new Error(signedUp.refusal.message);
  const confirmed = await harness.domain.accounts.confirmEmail(visitor, {
    email: "thandi@example.com",
    code: harness.given.codeSentTo("thandi@example.com"),
    ip: IP,
  });
  if (!confirmed.ok) throw new Error(confirmed.refusal.message);
  harness.contentReader.force({ kind: "clear" });
  return confirmed.value.actor;
}

async function preCheckItem(
  harness: Harness,
  admin: Awaited<ReturnType<Harness["given"]["admin"]>>,
) {
  const home = await harness.domain.queues.home(admin.actor, { queue: "pre-checks" });
  const [item] = home?.items ?? [];
  if (!item) throw new Error("No Pre-check is waiting");
  return item;
}

describe("names at sign-up", () => {
  test.each([
    ["a name", { name: "Thandi 082 555 0123" }, /phone number/],
    ["a trading name", { tradingName: "thandifixes.co.za" }, /link/],
  ])(
    "are refused at once if %s carries contact details, and nothing is made",
    async (_, names, message) => {
      const harness = await createHarness();

      const result = await signUp(harness, names);

      expect(result).toEqual({
        ok: false,
        refusal: { reason: "content", message: expect.stringMatching(message) },
      });
      expect(harness.mailer.sentTo("thandi@example.com")).toEqual([]);
      expect(harness.contentReader.reads).toEqual([]);
    },
  );

  test("that the content reader is sure about are refused with its reason", async () => {
    const harness = await createHarness();
    harness.contentReader.force({ kind: "sure-hit", reason: "The name holds a social handle." });

    expect(await signUp(harness, { tradingName: "insta thandi_fixes" })).toEqual({
      ok: false,
      refusal: { reason: "content", message: "The name holds a social handle." },
    });
    expect(harness.contentReader.reads).toEqual([
      {
        text: "Thandi Mokoena\ninsta thandi_fixes",
        photos: [],
        context: { kind: "before-payment" },
      },
    ]);
  });

  test("that are clear are shown, as they always were", async () => {
    const harness = await createHarness();
    const client = await harness.given.client({ name: "Thandi Mokoena" });
    const artisan = await harness.given.artisan();

    expect(await harness.domain.accounts.shownName(artisan.actor, client.actor)).toBe("Thandi M.");
    expect(await harness.domain.accounts.me(client.actor)).toMatchObject({
      names: { shown: true, beingChecked: null, refused: null },
    });
  });

  test.each([
    ["unsure", { kind: "unsure", reason: "The trading name may be a handle." }],
    ["cannot run", { kind: "cannot-run", reason: "Workers AI is busy." }],
  ] as const)(
    "the check is %s about are Held: the Account is made, and only it and the Admin see them",
    async (_, verdict) => {
      const harness = await createHarness();
      const { domain, given } = harness;
      const admin = await given.admin();
      const artisan = await given.artisan();

      const client = await clientWithHeldNames(harness, verdict);

      expect(await domain.accounts.me(client)).toMatchObject({
        name: "Thandi Mokoena",
        tradingName: "ThandiFixes",
        names: {
          shown: false,
          beingChecked: { name: "Thandi Mokoena", tradingName: "ThandiFixes" },
          refused: null,
        },
      });
      expect(await domain.accounts.shownName(artisan.actor, client)).toBeNull();
      expect(await domain.accounts.shownName(admin.actor, client)).toBe("ThandiFixes");
      expect(await domain.accounts.shownName(client, client)).toBe("ThandiFixes");
      // Nobody is told an item was Held.
      expect(await domain.notices.list(client)).toEqual([]);
    },
  );

  test("that are Held reach the Admin's Pre-checks only once the Email is proven", async () => {
    const harness = await createHarness();
    const { domain, given, contentReader } = harness;
    const admin = await given.admin();
    contentReader.force({ kind: "unsure", reason: "The trading name may be a handle." });

    await signUp(harness, { tradingName: "ThandiFixes" });

    expect(await domain.queues.home(admin.actor)).toMatchObject({ counts: { "pre-checks": 0 } });
    await domain.accounts.confirmEmail(visitor, {
      email: "thandi@example.com",
      code: given.codeSentTo("thandi@example.com"),
      ip: IP,
    });
    const home = await domain.queues.home(admin.actor);
    expect(home).toMatchObject({
      counts: { "pre-checks": 1 },
      items: [{ queue: "pre-checks", title: "Names: Thandi Mokoena (ThandiFixes)" }],
    });
  });
});

describe("the Pre-check of Held names", () => {
  test("shows the Admin the names and why the check Held them, and offers release or refuse", async () => {
    const harness = await createHarness();
    const admin = await harness.given.admin();
    await clientWithHeldNames(harness);
    const { id } = await preCheckItem(harness, admin);

    const item = await harness.domain.queues.item(admin.actor, { itemId: id });

    expect(item).toMatchObject({
      queue: "pre-checks",
      decisions: [
        { key: "release", label: "Release", reason: "optional" },
        { key: "refuse", label: "Refuse", reason: "required" },
      ],
      tabs: [
        {
          key: "names",
          blocks: [
            {
              kind: "facts",
              facts: [
                { label: "Name", value: "Thandi Mokoena" },
                { label: "Trading name", value: "ThandiFixes" },
              ],
            },
          ],
        },
        {
          key: "check",
          blocks: [{ kind: "text", text: "The trading name may be a handle." }],
        },
      ],
      sidebar: [
        {
          title: "Account",
          blocks: [
            {
              kind: "facts",
              facts: [
                { label: "Kind", value: "Client" },
                { label: "Email", value: "thandi@example.com" },
              ],
            },
          ],
        },
      ],
    });
  });

  test("released, shows the names to others, and tells the Account", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await given.artisan();
    const client = await clientWithHeldNames(harness);
    const { id } = await preCheckItem(harness, admin);

    expect(
      await domain.queues.decide(admin.actor, { itemId: id, decision: "release" }),
    ).toMatchObject({
      ok: true,
    });

    expect(await domain.accounts.shownName(artisan.actor, client)).toBe("ThandiFixes");
    expect(await domain.accounts.me(client)).toMatchObject({
      names: { shown: true, beingChecked: null, refused: null },
    });
    expect(await domain.notices.list(client)).toMatchObject([
      { event: "held.names.released", title: "Your names are checked and shown", link: "/account" },
    ]);
    expect(harness.mailer.sentTo("thandi@example.com").at(-1)).toMatchObject({
      subject: "Your names are checked and shown",
    });
  });

  test("refused, needs a reason, and tells the Account, which sees why", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await given.artisan();
    const client = await clientWithHeldNames(harness);
    const { id } = await preCheckItem(harness, admin);

    expect(
      await domain.queues.decide(admin.actor, { itemId: id, decision: "refuse" }),
    ).toMatchObject({
      ok: false,
      refusal: { reason: "reason-required" },
    });
    await domain.queues.decide(admin.actor, {
      itemId: id,
      decision: "refuse",
      reason: "ThandiFixes is an Instagram handle.",
    });

    expect(await domain.accounts.shownName(artisan.actor, client)).toBeNull();
    expect(await domain.accounts.me(client)).toMatchObject({
      names: {
        shown: false,
        beingChecked: null,
        refused: {
          name: "Thandi Mokoena",
          tradingName: "ThandiFixes",
          reason: "ThandiFixes is an Instagram handle.",
        },
      },
    });
    expect(await domain.notices.list(client)).toMatchObject([
      { event: "held.names.refused", title: "Your names were refused", link: "/account" },
    ]);
  });

  test("waits with no time limit", async () => {
    const harness = await createHarness();
    const admin = await harness.given.admin();
    await clientWithHeldNames(harness);

    harness.clock.advance({ days: 400 });
    await harness.domain.system.runDueClocks();

    expect(await harness.domain.queues.home(admin.actor)).toMatchObject({
      counts: { "pre-checks": 1 },
    });
  });
});

describe("withdrawing names being checked", () => {
  test("takes them out of the Pre-checks queue, and the Admin can no longer decide them", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const client = await clientWithHeldNames(harness);
    const { id } = await preCheckItem(harness, admin);

    expect(await domain.accounts.withdrawNames(client)).toEqual({ ok: true, value: {} });

    expect(await domain.queues.home(admin.actor)).toMatchObject({ counts: { "pre-checks": 0 } });
    expect(
      await domain.queues.decide(admin.actor, { itemId: id, decision: "release" }),
    ).toMatchObject({
      ok: false,
      refusal: { reason: "already-decided" },
    });
    expect(await domain.queues.item(admin.actor, { itemId: id })).toMatchObject({
      decided: { decision: "withdrawn", label: "Withdrawn by the sender", by: null },
      decisions: [],
    });
    expect(await domain.accounts.me(client)).toMatchObject({
      names: { shown: false, beingChecked: null, refused: null },
    });
  });

  test("is refused once the Admin has decided them", async () => {
    const harness = await createHarness();
    const admin = await harness.given.admin();
    const client = await clientWithHeldNames(harness);
    const { id } = await preCheckItem(harness, admin);
    await harness.domain.queues.decide(admin.actor, { itemId: id, decision: "release" });

    expect(await harness.domain.accounts.withdrawNames(client)).toMatchObject({
      ok: false,
      refusal: { reason: "nothing-held" },
    });
  });
});

describe("changing names", () => {
  test("to clear ones shows them at once", async () => {
    const harness = await createHarness();
    const client = await harness.given.client();
    const artisan = await harness.given.artisan();

    expect(
      await harness.domain.accounts.changeNames(client.actor, {
        name: "Thandi Mokoena",
        tradingName: "Mokoena Home Repairs",
      }),
    ).toEqual({ ok: true, value: { names: "shown" } });

    expect(await harness.domain.accounts.shownName(artisan.actor, client.actor)).toBe("Mokoena R.");
  });

  test("to ones with contact details is refused, and the names stay as they were", async () => {
    const harness = await createHarness();
    const client = await harness.given.client();

    expect(
      await harness.domain.accounts.changeNames(client.actor, {
        name: "Thandi thandi@example.com",
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "content" } });
    expect(await harness.domain.accounts.me(client.actor)).toMatchObject({
      name: "Thandi Mokoena",
    });
  });

  test("to ones the check is unsure about Holds them, and the names shown stay shown meanwhile", async () => {
    const harness = await createHarness();
    const { domain, given, contentReader } = harness;
    const admin = await given.admin();
    const client = await given.client();
    const artisan = await given.artisan();
    contentReader.force({ kind: "unsure", reason: "It may be a handle." });

    expect(
      await domain.accounts.changeNames(client.actor, {
        name: "Thandi Mokoena",
        tradingName: "TM_fixes",
      }),
    ).toEqual({ ok: true, value: { names: "being-checked" } });

    expect(await domain.accounts.shownName(artisan.actor, client.actor)).toBe("Thandi M.");
    expect(await domain.accounts.me(client.actor)).toMatchObject({
      tradingName: null,
      names: { shown: true, beingChecked: { tradingName: "TM_fixes" } },
    });
    expect(
      await domain.accounts.changeNames(client.actor, { name: "Thandi Mokoena" }),
    ).toMatchObject({ ok: false, refusal: { reason: "names-being-checked" } });
    const { id } = await preCheckItem(harness, admin);
    await domain.queues.decide(admin.actor, { itemId: id, decision: "release" });
    expect(await domain.accounts.shownName(artisan.actor, client.actor)).toBe("TM_fixes");
  });

  test("of an Artisan waits for the Admin even when clear, as the names head the Profile", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await given.verifiedArtisan({ name: "Sipho Dlamini" });
    const client = await given.client();

    expect(
      await domain.accounts.changeNames(artisan.actor, {
        name: "Sipho Dlamini",
        tradingName: "Bright Pipes",
      }),
    ).toEqual({ ok: true, value: { names: "being-checked" } });

    expect(await domain.accounts.shownName(client.actor, artisan.actor)).toBe("Sipho Dlamini");
    expect(
      await domain.profiles.view(visitor, { artisanId: artisan.actor.accountId }),
    ).toMatchObject({ publicName: "Sipho Dlamini" });
    const { id } = await preCheckItem(harness, admin);
    const item = await domain.queues.item(admin.actor, { itemId: id });
    expect(item).toMatchObject({
      tabs: [
        { key: "names" },
        {
          key: "check",
          blocks: [
            {
              kind: "text",
              text: "The Content check found nothing. An Artisan's names head their Profile, so every change waits for the Admin.",
            },
          ],
        },
      ],
    });
    await domain.queues.decide(admin.actor, { itemId: id, decision: "release" });
    expect(
      await domain.profiles.view(visitor, { artisanId: artisan.actor.accountId }),
    ).toMatchObject({ publicName: "Bright Pipes" });
  });

  test("after a refusal gives the Account names that are shown", async () => {
    const harness = await createHarness();
    const { domain, given } = harness;
    const admin = await given.admin();
    const artisan = await given.artisan();
    const client = await clientWithHeldNames(harness);
    const { id } = await preCheckItem(harness, admin);
    await domain.queues.decide(admin.actor, {
      itemId: id,
      decision: "refuse",
      reason: "A handle.",
    });

    await domain.accounts.changeNames(client, { name: "Thandi Mokoena" });

    expect(await domain.accounts.shownName(artisan.actor, client)).toBe("Thandi M.");
    expect(await domain.accounts.me(client)).toMatchObject({
      tradingName: null,
      names: { shown: true, beingChecked: null, refused: null },
    });
  });
});
