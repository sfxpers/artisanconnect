import { describe, expect, test } from "vitest";
import { visitor } from "@/domain/actor";
import type { Block } from "@/domain/queues";
import { createHarness, type Harness } from "../support/harness";
import {
  decideCheck,
  document,
  identity,
  payoutAccount,
  photo,
  SA_ID,
  submit,
  verificationItem,
  workPhotos,
} from "../support/verification";

// An Artisan submits the checks the spec lists, the Admin accepts or rejects
// each on its own row, and accepted checks become Verification Badges. An
// Artisan is verified for a Service Category only while every check it needs
// is current (#118, ADR 0002).

type Mine = NonNullable<Awaited<ReturnType<Harness["domain"]["verification"]["mine"]>>>;

/** One check of the Artisan's Verification page, by its slot. */
function slot(mine: Mine, key: string) {
  const all = [...mine.once, ...mine.categories.flatMap((group) => group.checks), ...mine.optional];
  const found = all.find((check) => check.slot === key);
  if (!found) throw new Error(`No check in slot ${key}`);
  return found;
}

describe("submitting a check", () => {
  test("puts it before the Admin in one Verification item, and shows it waiting", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan({ name: "Sipho Dlamini" });

    const sent = await domain.verification.submit(artisan.actor, await identity());

    expect(sent).toEqual({ ok: true, value: { checkId: expect.any(String) } });
    expect(slot((await domain.verification.mine(artisan.actor))!, "identity")).toMatchObject({
      name: "Identity document",
      state: "waiting",
    });
    expect(await verificationItem(domain, admin)).toMatchObject({
      queue: "verification",
      title: "Verification: Sipho Dlamini",
    });
  });
});

describe("submitting a check, refused", () => {
  test("for a South African ID number that fails its checksum", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();

    const sent = await domain.verification.submit(
      artisan.actor,
      await identity({ number: "8001015009088" }),
    );

    expect(sent).toEqual({
      ok: false,
      refusal: { reason: "invalid", message: expect.stringMatching(/not valid/) },
    });
    expect((await domain.queues.home(admin.actor))?.counts.verification).toBe(0);
  });

  test("for an Identity Number another Artisan holds, without saying whose", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const holder = await given.artisan({ name: "Sipho Dlamini" });
    const sent = await domain.verification.submit(holder.actor, await identity());
    const item = await verificationItem(domain, admin);
    await decideCheck(
      domain,
      admin,
      { itemId: item.id, checkId: sent.ok ? sent.value.checkId : "" },
      "accept",
    );
    const other = await given.artisan({ name: "Themba Nkosi" });

    const refused = await domain.verification.submit(
      other.actor,
      // Typed with spaces, it is still the same number.
      await identity({ number: "800101 5009 087" }),
    );

    expect(refused).toEqual({
      ok: false,
      refusal: {
        reason: "held",
        message:
          "This Identity Number is already held by another Artisan Account. If it is yours, contact support.",
      },
    });
    expect(JSON.stringify(refused)).not.toMatch(/Sipho|Dlamini/);
  });

  test("for a Payout account another Artisan holds", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const holder = await given.artisan();
    const sent = await domain.verification.submit(holder.actor, await payoutAccount());
    const item = await verificationItem(domain, admin);
    await decideCheck(
      domain,
      admin,
      { itemId: item.id, checkId: sent.ok ? sent.value.checkId : "" },
      "accept",
    );
    const other = await given.artisan();

    expect(
      await domain.verification.submit(
        other.actor,
        await payoutAccount({ accountNumber: "12345 67890" }),
      ),
    ).toMatchObject({ ok: false, refusal: { reason: "held", message: /bank account/ } });
  });

  test("while the same check waits for the Admin", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.artisan();
    await domain.verification.submit(artisan.actor, await identity());

    expect(await domain.verification.submit(artisan.actor, await identity())).toMatchObject({
      ok: false,
      refusal: { reason: "waiting" },
    });
  });

  test("for a work permit, unless the identity document is a foreign passport", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.artisan();
    const permit = await document({ kind: "work-permit", expiresOn: "2028-01-31" });

    expect(await domain.verification.submit(artisan.actor, permit)).toMatchObject({
      ok: false,
      refusal: { reason: "not-needed" },
    });
    await domain.verification.submit(
      artisan.actor,
      await identity({ documentType: "passport", number: "FN123456", country: "ZW" }),
    );
    expect(await domain.verification.submit(artisan.actor, permit)).toMatchObject({ ok: true });
  });

  test.each([
    [
      "two work photos",
      async () => ({
        ...(await workPhotos("tiling")),
        files: { photos: [await photo(), await photo()] },
      }),
      /send 3 photos/,
    ],
    [
      "an identity document with no selfie",
      async () => ({ ...(await identity()), files: { document: [await photo()] } }),
      /selfie/,
    ],
    [
      "an expiry date already past",
      async () => document({ kind: "business-insurance", expiresOn: "2026-10-05" }),
      /expired/,
    ],
    [
      "an expiry date left out",
      async () => document({ kind: "business-insurance" } as never),
      /^Give the expiry date\.$/,
    ],
    [
      "an account number left out",
      async () => {
        const submission = await payoutAccount();
        const { accountNumber: _, ...details } = submission.details as Record<string, string>;
        return { ...submission, details: details as never };
      },
      /^An account number has 6 to 16 digits\.$/,
    ],
  ])("for %s", async (_, submission, message) => {
    const { domain, given } = await createHarness();
    const artisan = await given.artisan();

    expect(await domain.verification.submit(artisan.actor, await submission())).toMatchObject({
      ok: false,
      refusal: { message: expect.stringMatching(message) },
    });
  });

  test("for anyone but an Artisan", async () => {
    const { domain, given } = await createHarness();
    const client = await given.client();

    expect(await domain.verification.submit(client.actor, await identity())).toMatchObject({
      ok: false,
      refusal: { reason: "artisans-only" },
    });
  });
});

describe("the Admin's Verification item", () => {
  test("has a row per check with what was sent and the automatic reading", async () => {
    const { domain, given, contentReader } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan({ name: "Sipho Dlamini" });
    contentReader.photosSay("REPUBLIC OF SOUTH AFRICA SIPHO DLAMINI 800101 5009 087");
    const checkId = await submit(domain, artisan, identity());
    const { id: itemId } = await verificationItem(domain, admin);

    const item = await domain.queues.item(admin.actor, { itemId });

    expect(item?.decisions).toEqual([]);
    expect(item?.rows).toEqual([
      {
        id: checkId,
        title: "Identity document",
        state: "Waiting",
        blocks: [
          {
            kind: "facts",
            facts: expect.arrayContaining([
              { label: "Document", value: "South African ID" },
              { label: "Identity Number", value: `South African ID ${SA_ID}` },
            ]),
          },
          {
            kind: "facts",
            facts: [
              { label: "Name in the text", value: "Yes" },
              { label: "Number in the text", value: "Yes" },
            ],
          },
        ],
        reads: [{ key: "documents", label: "the documents" }],
        decisions: [
          expect.objectContaining({ key: "accept", told: "The Artisan" }),
          expect.objectContaining({ key: "reject", reason: "required" }),
        ],
      },
    ]);
  });

  test("opens the documents only on a logged click, by links only an Admin can follow", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan({ name: "Sipho Dlamini" });
    const checkId = await submit(domain, artisan, identity());
    const { id: itemId } = await verificationItem(domain, admin);

    const opened = await domain.queues.open(admin.actor, {
      itemId,
      rowId: checkId,
      read: "documents",
    });

    if (!opened.ok) throw new Error(opened.refusal.message);
    const files = opened.value.find(
      (block): block is Extract<Block, { kind: "files" }> => block.kind === "files",
    )?.files;
    expect(files?.map((file) => [file.kind, file.label])).toEqual([
      ["photo", "Document 1"],
      ["photo", "Selfie 1"],
    ]);
    expect((await domain.admins.auditLog(admin.actor))?.rows[0]).toMatchObject({
      action: "read",
      summary: "Opened the documents (Identity document): Verification: Sipho Dlamini",
    });
    const token = files![0]!.href.replace("/admin/files/", "");
    const file = await domain.queues.file(admin.actor, { token });
    expect(file?.contentType).toBe("image/webp");
    await file?.body.cancel();
    expect(await domain.queues.file(artisan.actor, { token })).toBeNull();
    expect(await domain.queues.file(admin.actor, { token: `${token}x` })).toBeNull();
  });

  test("accepting a check makes it a badge, tells the Artisan, and logs the decision", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan({ name: "Sipho Dlamini" });
    const checkId = await submit(domain, artisan, identity());
    const { id: itemId } = await verificationItem(domain, admin);

    const accepted = await decideCheck(domain, admin, { itemId, checkId }, "accept");

    expect(accepted).toEqual({
      ok: true,
      value: { itemId, rowId: checkId, decision: "accept" },
    });
    expect(slot((await domain.verification.mine(artisan.actor))!, "identity")).toMatchObject({
      state: "accepted",
    });
    expect(await domain.notices.list(artisan.actor)).toEqual([
      expect.objectContaining({
        event: "verification.accepted",
        title: "Verification accepted: Identity document",
        link: "/verification",
      }),
    ]);
    expect((await domain.admins.auditLog(admin.actor))?.rows[0]).toMatchObject({
      action: "queue.row-decided",
      summary: "Accepted Identity document for Sipho Dlamini",
    });
  });

  test("is decided once no check on it waits, and a later check raises a new one", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan({ name: "Sipho Dlamini" });
    const first = await submit(domain, artisan, identity());
    const second = await submit(domain, artisan, payoutAccount());
    const { id: itemId } = await verificationItem(domain, admin);

    await decideCheck(domain, admin, { itemId, checkId: first }, "accept");
    expect((await domain.queues.item(admin.actor, { itemId }))?.decided).toBeNull();
    await decideCheck(domain, admin, { itemId, checkId: second }, "reject", {
      reason: "The letter is not in your name.",
    });

    expect((await domain.queues.item(admin.actor, { itemId }))?.decided).toMatchObject({
      label: "Every check decided",
      by: "admin@example.com",
    });
    expect((await domain.queues.home(admin.actor))?.counts.verification).toBe(0);
    await submit(domain, artisan, payoutAccount());
    expect((await verificationItem(domain, admin)).id).not.toBe(itemId);
  });

  test("rejecting needs a reason, which the Artisan sees, and the Artisan may submit again", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();
    const checkId = await submit(domain, artisan, identity());
    const { id: itemId } = await verificationItem(domain, admin);

    expect(await decideCheck(domain, admin, { itemId, checkId }, "reject")).toMatchObject({
      ok: false,
      refusal: { reason: "reason-required" },
    });
    await decideCheck(domain, admin, { itemId, checkId }, "reject", {
      reason: "The selfie does not show the document.",
    });

    expect(slot((await domain.verification.mine(artisan.actor))!, "identity")).toMatchObject({
      state: "rejected",
      reason: "The selfie does not show the document.",
    });
    expect((await domain.notices.list(artisan.actor))[0]).toMatchObject({
      event: "verification.rejected",
      title: "Verification rejected: Identity document",
    });
    expect(await domain.verification.submit(artisan.actor, await identity())).toMatchObject({
      ok: true,
    });
  });

  test("a check decided once cannot be decided again", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();
    const checkId = await submit(domain, artisan, identity());
    const { id: itemId } = await verificationItem(domain, admin);
    await decideCheck(domain, admin, { itemId, checkId }, "accept");

    expect(
      await decideCheck(domain, admin, { itemId, checkId }, "reject", {
        reason: "Changed my mind",
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-allowed" } });
  });

  test("only an Admin decides a check", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();
    const checkId = await submit(domain, artisan, identity());
    const { id: itemId } = await verificationItem(domain, admin);

    expect(
      await domain.queues.decideRow(artisan.actor, { itemId, rowId: checkId, decision: "accept" }),
    ).toMatchObject({ ok: false, refusal: { reason: "admin-only" } });
  });
});

describe("the Identity Number", () => {
  test("is recorded by the Admin, who may correct it from the document", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();
    const checkId = await submit(domain, artisan, identity({ number: "8001015009087" }));
    const { id: itemId } = await verificationItem(domain, admin);

    expect(
      await decideCheck(domain, admin, { itemId, checkId }, "accept", {
        fields: { number: "8001015009088" },
      }),
    ).toMatchObject({ ok: false, refusal: { message: expect.stringMatching(/not valid/) } });
    expect(
      await decideCheck(domain, admin, { itemId, checkId }, "accept", {
        fields: { number: "9202204720083" },
      }),
    ).toMatchObject({ ok: true });

    const item = await domain.queues.item(admin.actor, { itemId });
    expect(item?.sidebar[0]?.blocks).toEqual([
      {
        kind: "facts",
        facts: expect.arrayContaining([
          { label: "Identity Number", value: "South African ID 9202204720083" },
        ]),
      },
    ]);
  });

  test("accepted for one Artisan cannot be accepted for another", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const first = await given.artisan({ name: "Sipho Dlamini" });
    const second = await given.artisan({ name: "Themba Nkosi" });
    // Both wait at once, so neither was held when sent.
    const firstCheck = await submit(domain, first, identity());
    const secondCheck = await submit(domain, second, identity());
    const items = (await domain.queues.home(admin.actor))!.items;
    const itemOf = (name: string) => items.find((item) => item.title.includes(name))!.id;
    await decideCheck(domain, admin, { itemId: itemOf("Sipho"), checkId: firstCheck }, "accept");

    expect(
      await decideCheck(
        domain,
        admin,
        { itemId: itemOf("Themba"), checkId: secondCheck },
        "accept",
      ),
    ).toMatchObject({ ok: false, refusal: { reason: "held" } });
  });
});

/** Every check of a submission list accepted, through the Artisan's one open item. */
async function acceptAll(
  domain: Harness["domain"],
  admin: { actor: import("@/domain/actor").AdminActor },
  checkIds: string[],
) {
  const { id: itemId } = await verificationItem(domain, admin);
  for (const checkId of checkIds) {
    const accepted = await decideCheck(domain, admin, { itemId, checkId }, "accept");
    if (!accepted.ok) throw new Error(accepted.refusal.message);
  }
  return itemId;
}

describe("being verified for a Service Category", () => {
  test("needs identity, a Payout account, and three work photos in that category", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();
    const artisanId = artisan.actor.accountId;
    const isVerified = (category: string) =>
      domain.verification.verified(artisan.actor, { artisanId, category });

    const checks = [
      await submit(domain, artisan, identity()),
      await submit(domain, artisan, workPhotos("painting")),
    ];
    await acceptAll(domain, admin, checks);
    expect(await isVerified("painting")).toBe(false);

    await acceptAll(domain, admin, [await submit(domain, artisan, payoutAccount())]);

    expect(await isVerified("painting")).toBe(true);
    expect(await isVerified("tiling")).toBe(false);
    expect((await domain.verification.mine(artisan.actor))?.verified).toEqual([
      { category: "painting", gasWork: false },
    ]);
  });

  test("for Plumbing needs a trained plumber, and for gas work a gas practitioner too", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();
    const artisanId = artisan.actor.accountId;
    const ask = (gasWork: boolean) =>
      domain.verification.verified(artisan.actor, { artisanId, category: "plumbing", gasWork });
    await acceptAll(domain, admin, [
      await submit(domain, artisan, identity()),
      await submit(domain, artisan, payoutAccount()),
      await submit(domain, artisan, workPhotos("plumbing")),
    ]);
    expect(await ask(false)).toBe(false);

    await acceptAll(domain, admin, [
      await submit(domain, artisan, document({ kind: "trained-plumber" })),
    ]);
    expect([await ask(false), await ask(true)]).toEqual([true, false]);

    await acceptAll(domain, admin, [
      await submit(
        domain,
        artisan,
        document({ kind: "gas-practitioner", registrationNumber: "G1", expiresOn: "2027-12-31" }),
      ),
    ]);
    expect([await ask(false), await ask(true)]).toEqual([true, true]);
  });

  test("for Electrical needs a registered person and a current contractor registration", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();
    const isVerified = () =>
      domain.verification.verified(artisan.actor, {
        artisanId: artisan.actor.accountId,
        category: "electrical",
      });
    await acceptAll(domain, admin, [
      await submit(domain, artisan, identity()),
      await submit(domain, artisan, payoutAccount()),
      await submit(domain, artisan, workPhotos("electrical")),
      await submit(
        domain,
        artisan,
        document({ kind: "registered-person", registrationNumber: "R1" }),
      ),
    ]);
    expect(await isVerified()).toBe(false);

    await acceptAll(domain, admin, [
      await submit(
        domain,
        artisan,
        document({
          kind: "electrical-contractor",
          registrationNumber: "C1",
          expiresOn: "2027-06-30",
        }),
      ),
    ]);
    expect(await isVerified()).toBe(true);
  });

  test("with a foreign passport needs a work permit; with a South African one it does not", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const foreign = await given.artisan();
    const local = await given.artisan();
    const isVerified = (artisan: typeof foreign) =>
      domain.verification.verified(artisan.actor, {
        artisanId: artisan.actor.accountId,
        category: "roofing",
      });
    for (const [artisan, country, account] of [
      [foreign, "ZW", "1111111111"],
      [local, "ZA", "2222222222"],
    ] as const) {
      const checkIds = [
        await submit(
          domain,
          artisan,
          identity({
            documentType: "passport",
            number: `P${account}`,
            country,
            expiresOn: "2030-01-01",
          }),
        ),
        await submit(domain, artisan, payoutAccount({ accountNumber: account })),
        await submit(domain, artisan, workPhotos("roofing")),
      ];
      await acceptAll(domain, admin, checkIds);
    }
    expect([await isVerified(foreign), await isVerified(local)]).toEqual([false, true]);
    expect(slot((await domain.verification.mine(foreign.actor))!, "work-permit").needed).toBe(
      "required",
    );
    expect(slot((await domain.verification.mine(local.actor))!, "work-permit").needed).toBe(
      "not-needed",
    );

    await acceptAll(domain, admin, [
      await submit(domain, foreign, document({ kind: "work-permit", expiresOn: "2027-05-28" })),
    ]);
    expect(await isVerified(foreign)).toBe(true);
  });

  test("is not changed by the optional badges, which show their dates", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();
    const artisanId = artisan.actor.accountId;
    await acceptAll(domain, admin, [
      await submit(domain, artisan, document({ kind: "police-clearance", issuedOn: "2026-09-01" })),
      await submit(
        domain,
        artisan,
        document({ kind: "business-insurance", expiresOn: "2027-08-31" }),
      ),
    ]);

    expect(
      await domain.verification.verified(artisan.actor, { artisanId, category: "painting" }),
    ).toBe(false);
    expect(await domain.verification.badges({ kind: "visitor" }, { artisanId })).toEqual([
      {
        kind: "police-clearance",
        category: null,
        name: "Police clearance",
        expiresOn: null,
        issuedOn: "2026-09-01",
      },
      {
        kind: "business-insurance",
        category: null,
        name: "Business insurance",
        expiresOn: "2027-08-31",
        issuedOn: null,
      },
    ]);
  });

  test("shows anyone what it checked, but not a work permit, a Payout account, or an identity document's dates", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();
    await acceptAll(domain, admin, [
      await submit(
        domain,
        artisan,
        identity({
          documentType: "passport",
          number: "P1111111111",
          country: "ZW",
          expiresOn: "2030-01-01",
        }),
      ),
      await submit(domain, artisan, payoutAccount()),
      await submit(domain, artisan, workPhotos("roofing")),
      await submit(domain, artisan, document({ kind: "work-permit", expiresOn: "2027-05-28" })),
    ]);

    expect(
      await domain.verification.badges(visitor, { artisanId: artisan.actor.accountId }),
    ).toEqual([
      {
        kind: "identity",
        category: null,
        name: "Identity verified",
        expiresOn: null,
        issuedOn: null,
      },
      {
        kind: "work-photos",
        category: "roofing",
        name: "Work photos, Roofing",
        expiresOn: null,
        issuedOn: null,
      },
    ]);
  });

  test("is what the verified Artisan builder gives", async () => {
    const { domain, given } = await createHarness();
    const artisan = await given.verifiedArtisan({
      categories: ["plumbing", "electrical"],
      gasWork: true,
    });

    expect((await domain.verification.mine(artisan.actor))?.verified).toEqual([
      { category: "plumbing", gasWork: true },
      { category: "electrical", gasWork: false },
    ]);
  });
});

describe("a replacement", () => {
  test("of a Payout account leaves the current one until the Admin accepts it", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();
    const first = await submit(domain, artisan, payoutAccount({ accountNumber: "1111111111" }));
    const itemId = await acceptAll(domain, admin, [first]);
    clock.advance({ days: 1 });

    const second = await submit(domain, artisan, payoutAccount({ accountNumber: "2222222222" }));

    expect(slot((await domain.verification.mine(artisan.actor))!, "payout-account")).toMatchObject({
      state: "accepted",
      replacement: { state: "waiting", reason: null },
    });
    const { id: openItem } = await verificationItem(domain, admin);
    expect(
      (await domain.queues.item(admin.actor, { itemId: openItem }))?.rows?.map((row) => [
        row.id,
        row.state,
      ]),
    ).toEqual([
      [second, "Waiting"],
      [first, "Badge"],
    ]);
    await decideCheck(domain, admin, { itemId: openItem, checkId: second }, "accept");
    expect((await domain.queues.item(admin.actor, { itemId }))?.rows?.map((row) => row.id)).toEqual(
      [second],
    );
    expect(slot((await domain.verification.mine(artisan.actor))!, "payout-account")).toMatchObject({
      state: "accepted",
      replacement: null,
    });
  });
});

describe("removing a badge found false", () => {
  test("ends its Verification and tells the Artisan why, after the item is decided", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.verifiedArtisan({ categories: ["tiling"] });
    const artisanId = artisan.actor.accountId;
    // The item every check was decided on, which is decided now.
    const itemId = (await domain.admins.auditLog(admin.actor))!.rows.find(
      (row) => row.action === "queue.row-decided",
    )!.subjectId!;
    clock.advance({ days: 30 });
    const photosRow = (await domain.queues.item(admin.actor, { itemId }))?.rows?.find(
      (row) => row.title === "Work photos, Tiling",
    );

    const removed = await decideCheck(domain, admin, { itemId, checkId: photosRow!.id }, "remove", {
      reason: "These photos are from a catalogue.",
    });

    expect(removed).toMatchObject({ ok: true });
    expect(
      await domain.verification.verified(artisan.actor, { artisanId, category: "tiling" }),
    ).toBe(false);
    expect(
      slot((await domain.verification.mine(artisan.actor))!, "work-photos:tiling"),
    ).toMatchObject({
      state: "removed",
      reason: "These photos are from a catalogue.",
    });
    expect((await domain.notices.list(artisan.actor))[0]).toMatchObject({
      event: "verification.removed",
      title: "Badge removed: Work photos, Tiling",
    });
  });
});

describe("a check that expires", () => {
  test("reminds the Artisan 30 and 7 days before, and stops being current on its expiry date", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.verifiedArtisan({ categories: ["electrical"] });
    const artisanId = artisan.actor.accountId;
    const renewing = await submit(
      domain,
      artisan,
      document({
        kind: "electrical-contractor",
        registrationNumber: "EC-1",
        expiresOn: "2027-01-15",
      }),
    );
    // The builder's registration lasts to 2028; this one replaces it.
    await acceptAll(domain, admin, [renewing]);
    const isVerified = () =>
      domain.verification.verified(artisan.actor, { artisanId, category: "electrical" });
    const titles = async () =>
      (await domain.notices.list(artisan.actor))
        .filter((notice) => notice.event !== "verification.accepted")
        .map((notice) => notice.title);

    clock.set(new Date("2026-12-15T21:59:00Z")); // 23:59 in South Africa, a day early
    await domain.system.runDueClocks();
    expect(await titles()).toEqual([]);
    clock.set(new Date("2026-12-15T22:00:00Z")); // 16 December begins: 30 days to go
    await domain.system.runDueClocks();
    expect(await titles()).toEqual(["Expires in 30 days: Electrical contractor registration"]);

    clock.set(new Date("2027-01-08T00:00:00Z"));
    await domain.system.runDueClocks();
    expect((await titles())[0]).toBe("Expires in 7 days: Electrical contractor registration");

    clock.set(new Date("2027-01-14T21:59:59Z"));
    await domain.system.runDueClocks();
    expect(await isVerified()).toBe(true);
    clock.set(new Date("2027-01-14T22:00:00Z")); // 15 January begins
    await domain.system.runDueClocks();
    expect(await isVerified()).toBe(false);
    expect((await titles())[0]).toBe("Expired: Electrical contractor registration");
    expect(
      slot((await domain.verification.mine(artisan.actor))!, "electrical-contractor"),
    ).toMatchObject({ state: "expired", expiresOn: "2027-01-15" });
  });

  test("tells nothing once a renewal replaces it", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();
    const first = await submit(
      domain,
      artisan,
      document({ kind: "business-insurance", expiresOn: "2026-12-31" }),
    );
    await acceptAll(domain, admin, [first]);
    await acceptAll(domain, admin, [
      await submit(
        domain,
        artisan,
        document({ kind: "business-insurance", expiresOn: "2027-12-31" }),
      ),
    ]);

    clock.set(new Date("2027-01-01T00:00:00Z"));
    await domain.system.runDueClocks();

    expect((await domain.notices.list(artisan.actor)).map((notice) => notice.event)).toEqual([
      "verification.accepted",
      "verification.accepted",
    ]);
  });
});

describe("the automatic reading", () => {
  test("refuses work photos with contact details, as anything shown to others is", async () => {
    const { domain, given, contentReader } = await createHarness();
    const artisan = await given.artisan();
    contentReader.photosSay("Call me on 082 555 1234");

    expect(
      await domain.verification.submit(artisan.actor, await workPhotos("painting")),
    ).toMatchObject({ ok: false, refusal: { reason: "content" } });
  });

  test("shows an unsure Content check on work photos to the Admin, who decides", async () => {
    const { domain, given, contentReader } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();
    contentReader.force({ kind: "unsure", reason: "A photo may show a business card." });
    await submit(domain, artisan, workPhotos("painting"));
    const { id: itemId } = await verificationItem(domain, admin);

    const [row] = (await domain.queues.item(admin.actor, { itemId }))!.rows!;

    expect(row?.blocks[1]).toEqual({
      kind: "facts",
      facts: [{ label: "Content check", value: "Unsure: A photo may show a business card." }],
    });
  });

  test("asks the bank again about a Payout account while its answer is pending", async () => {
    const { domain, given, payments } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();
    await submit(domain, artisan, identity());
    payments.setBankAccountVerification({ state: "pending" });
    const checkId = await submit(domain, artisan, payoutAccount());
    const { id: itemId } = await verificationItem(domain, admin);
    const bankFacts = async () =>
      (await domain.queues.item(admin.actor, { itemId }))!.rows!.find((row) => row.id === checkId)!
        .blocks[1];

    expect(await bankFacts()).toMatchObject({
      facts: expect.arrayContaining([{ label: "Bank check", value: "Waiting for the bank" }]),
    });
    payments.setBankAccountVerification({
      state: "done",
      accountOpen: true,
      acceptsCredits: true,
      identityMatch: true,
      surnameMatch: false,
      initialsMatch: true,
    });

    expect(await bankFacts()).toMatchObject({
      facts: expect.arrayContaining([
        { label: "Account open", value: "Yes" },
        { label: "Surname matches", value: "No" },
      ]),
    });
    const asked = () => payments.calls.filter((call) => call.operation === "verifyBankAccount");
    expect(asked()[0]?.input).toMatchObject({
      identityNumber: SA_ID,
      surname: "Dlamini",
      initials: "S",
    });
    // Once answered, it is kept and not asked again.
    const times = asked().length;
    await bankFacts();
    expect(asked()).toHaveLength(times);
  });
});

describe("an Identity Number replaced", () => {
  test("is no longer held, once the Admin accepts the one replacing it", async () => {
    const { domain, given, clock } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();
    // Accepted by mistake: it was someone else's number.
    await acceptAll(domain, admin, [await submit(domain, artisan, identity({ number: SA_ID }))]);
    clock.advance({ days: 1 });
    await acceptAll(domain, admin, [
      await submit(domain, artisan, identity({ number: "9202204720083" })),
    ]);
    const owner = await given.artisan();

    expect(
      await domain.verification.submit(owner.actor, await identity({ number: SA_ID })),
    ).toMatchObject({ ok: true });
  });
});

describe("a work permit", () => {
  test("may be sent while a foreign passport waits to replace a South African ID", async () => {
    const { domain, given } = await createHarness();
    const admin = await given.admin();
    const artisan = await given.artisan();
    await acceptAll(domain, admin, [await submit(domain, artisan, identity())]);
    await submit(
      domain,
      artisan,
      identity({ documentType: "passport", number: "FN123456", country: "ZW" }),
    );

    expect(
      await domain.verification.submit(
        artisan.actor,
        await document({ kind: "work-permit", expiresOn: "2028-01-31" }),
      ),
    ).toMatchObject({ ok: true });
  });
});
