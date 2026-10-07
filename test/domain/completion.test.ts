import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import type { Actor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";
import { textPdf } from "../support/pdfs";
import { photo } from "../support/verification";

// Completion, Approval, and Fix requests (#130, ADR 0006): after Work started
// the Artisan marks the work complete; the Client approves, asks for a fix,
// or says nothing for seven days, and the Labour is released, making the
// Engagement Completed.

const DAY = 24 * 60 * 60 * 1000;

describe("the Artisan marks the work complete", () => {
  test("makes the Engagement Awaiting approval, and tells the Client the Approval time", async () => {
    const { domain, given, clock, mailer } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    clock.advance({ days: 2 });

    expect(
      await domain.engagements.complete(artisan.actor, {
        engagementId,
        note: "Both walls have two coats, and the room is cleaned.",
        photos: [await photo(), await photo()],
        documents: [await pdf(["Paint data sheet"])],
      }),
    ).toEqual({ ok: true, value: { state: "made" } });

    const dueAt = new Date(clock.now().getTime() + 7 * DAY);
    for (const engagement of [
      (await domain.jobs.view(client.actor, { jobId }))?.engagement,
      (await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement,
    ]) {
      expect(engagement).toMatchObject({
        state: "awaiting-approval",
        completion: {
          note: "Both walls have two coats, and the room is cleaned.",
          photos: [
            { href: expect.stringMatching(/^\/completion-files\//) },
            { href: expect.any(String) },
          ],
          documents: [{ kind: "pdf", certificate: false, href: expect.any(String) }],
          madeAt: clock.now(),
          approvalAt: dueAt,
        },
        approval: { startedAt: clock.now(), dueAt, elapsed: 0 },
        fixRequest: null,
      });
    }
    const title =
      "The Artisan marked the work complete. Approve or ask for a fix by 14 Oct 2026, 08:00, or it is Approved then: Paint the lounge";
    expect(await toldOf(domain, client, jobId)).toEqual([
      expect.objectContaining({ event: "engagement.completion", title }),
    ]);
    expect(mailer.sentTo(client.email).at(-1)).toMatchObject({ subject: title });
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({ event: "engagement.work-started" }),
    ]);
  });

  test("its photos and documents are served to both parties and nobody else", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    await given.markedComplete(artisan, engagementId, {
      documents: [await pdf(["Paint data sheet"])],
    });
    const completion = (await domain.jobs.view(client.actor, { jobId }))!.engagement!.completion!;
    const photoId = idOf(completion.photos[0]!.href);
    const documentId = idOf(completion.documents[0]!.href);
    const stranger = await given.client();

    for (const party of [client, artisan]) {
      expect(
        await domain.engagements.completionFile(party.actor, { fileId: photoId }),
      ).toMatchObject({ contentType: "image/webp" });
      expect(
        await domain.engagements.completionFile(party.actor, {
          fileId: photoId,
          thumbnail: true,
        }),
      ).toMatchObject({ contentType: "image/webp" });
      expect(
        await domain.engagements.completionFile(party.actor, { fileId: documentId }),
      ).toMatchObject({ contentType: "application/pdf" });
    }
    for (const actor of [stranger.actor, { kind: "visitor" } as Actor]) {
      expect(await domain.engagements.completionFile(actor, { fileId: photoId })).toBeNull();
    }
  });

  test("shows in the Conversation as a row that is not speech", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    clock.advance({ hours: 5 });

    await given.markedComplete(artisan, engagementId);

    expect(await lastRow(domain, client, jobId)).toEqual({
      kind: "event",
      event: "completion.made",
      at: clock.now(),
    });
    expect(await lastRow(domain, artisan, jobId)).toEqual({
      kind: "event",
      event: "completion.made",
      at: clock.now(),
    });
  });

  test("needs Work started", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);

    expect(
      await domain.engagements.complete(artisan.actor, {
        engagementId,
        note: "Done.",
        photos: [await photo()],
      }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "not-started",
        message: "Work has not started yet, so it cannot be marked complete.",
      },
    });
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe("paid");
    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      canComplete: false,
    });
  });

  test("needs a note, 1 to 10 after-work photos, and at most 5 documents", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    const photos = (count: number) => Promise.all(Array.from({ length: count }, () => photo()));

    const cases = [
      {
        input: { note: "  ", photos: await photos(1) },
        message: "Write a note on what was done.",
      },
      {
        input: { note: "x".repeat(2001), photos: await photos(1) },
        message: "A note is at most 2000 characters.",
      },
      {
        input: { note: "Done.", photos: [] },
        message: "Add at least one photo of the finished work.",
      },
      {
        input: { note: "Done.", photos: await photos(11) },
        message: "A Completion has at most 10 photos.",
      },
      {
        input: {
          note: "Done.",
          photos: await photos(1),
          documents: await Promise.all(Array.from({ length: 6 }, () => pdf(["Data sheet"]))),
        },
        message: "A Completion has at most 5 documents.",
      },
    ];
    for (const { input, message } of cases) {
      expect(await domain.engagements.complete(artisan.actor, { engagementId, ...input })).toEqual({
        ok: false,
        refusal: { reason: expect.any(String), message },
      });
    }
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe(
      "work-started",
    );
  });

  test("takes documents as photos or PDFs, never voice notes", async () => {
    const { domain, given } = await createHarness();
    const { artisan, engagementId } = await startedJob(given);

    expect(
      await domain.engagements.complete(artisan.actor, {
        engagementId,
        note: "Done.",
        photos: [await pdf(["Not a photo"])],
      }),
    ).toEqual({
      ok: false,
      refusal: { reason: "not-taken-here", message: "Only photos can be sent here." },
    });
    expect(
      await domain.engagements.complete(artisan.actor, {
        engagementId,
        note: "Done.",
        photos: [await photo()],
        documents: [await photo()],
      }),
    ).toMatchObject({ ok: true, value: { state: "made" } });
  });

  test("is the Hired Artisan's only", async () => {
    const { domain, given } = await createHarness();
    const { client, engagementId } = await startedJob(given);
    const other = await given.matchableArtisan();

    for (const actor of [client.actor, other.actor, { kind: "visitor" } as Actor]) {
      expect(
        await domain.engagements.complete(actor, {
          engagementId,
          note: "Done.",
          photos: [await photo()],
        }),
      ).toMatchObject({ ok: false, refusal: { reason: "not-found" } });
    }
  });

  test("sent twice at once, as by a double tap, makes one Completion and refuses the other", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    const send = async () =>
      domain.engagements.complete(artisan.actor, {
        engagementId,
        note: "Done.",
        photos: [await photo()],
      });

    const results = await Promise.all([send(), send()]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ ok: false });
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.activity).toEqual(
      expect.arrayContaining([expect.objectContaining({ event: "completion.made" })]),
    );
  });

  test("not again while it is Awaiting approval", async () => {
    const { domain, given } = await createHarness();
    const { artisan, engagementId } = await startedJob(given);
    await given.markedComplete(artisan, engagementId);

    expect(
      await domain.engagements.complete(artisan.actor, {
        engagementId,
        note: "Done again.",
        photos: [await photo()],
      }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "awaiting-approval",
        message: "The work is already marked complete.",
      },
    });
  });
});

describe("on a clock that ticks between reads, as a real one does", () => {
  test("a Completion, made at once or released by the Admin, makes the Engagement Awaiting approval", async () => {
    const { domain, given, clock, contentReader } = await createHarness();
    const first = await startedJob(given);
    const second = await startedJob(given);
    const frozen = clock.now;
    clock.now = () => {
      clock.advance({ minutes: 0.001 });
      return frozen();
    };

    await given.markedComplete(first.artisan, first.engagementId);
    contentReader.force({ kind: "unsure", reason: "It may ask to pay off the platform." });
    await domain.engagements.complete(second.artisan.actor, {
      engagementId: second.engagementId,
      note: "Done.",
      photos: [await photo()],
    });
    const admin = await given.admin();
    const [item] = (await domain.queues.home(admin.actor, { queue: "pre-checks" }))!.items;
    await domain.queues.decide(admin.actor, { itemId: item!.id, decision: "release" });

    for (const { client, jobId } of [first, second]) {
      expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
        state: "awaiting-approval",
        approval: expect.any(Object),
      });
    }
  });
});

describe("the Content check on a Completion", () => {
  test("refuses a sure hit with the reason, and keeps nothing", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { client, jobId, artisan, engagementId } = await startedJob(given);
    contentReader.force({ kind: "sure-hit", reason: "It asks to be paid in cash." });

    expect(
      await domain.engagements.complete(artisan.actor, {
        engagementId,
        note: "Pay me the rest in cash.",
        photos: [await photo()],
      }),
    ).toEqual({
      ok: false,
      refusal: { reason: "content", message: "It asks to be paid in cash." },
    });
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe(
      "work-started",
    );
  });

  test("reads the note, photos, and documents after Payment, where contact may be shared", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { artisan, engagementId } = await startedJob(given);

    expect(
      await domain.engagements.complete(artisan.actor, {
        engagementId,
        note: "Call me on 082 555 1234 if anything peels.",
        photos: [await photo()],
        documents: [await pdf(["Paint data sheet"])],
      }),
    ).toMatchObject({ ok: true, value: { state: "made" } });
    expect(contentReader.reads.at(-1)).toMatchObject({
      text: expect.stringContaining("Paint data sheet"),
      context: { kind: "engagement-conversation", engagementId },
    });
  });

  test("Holds an unsure one: being checked to the Artisan, nothing to the Client, and no seven days yet", async () => {
    const { domain, given, contentReader, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    contentReader.force({ kind: "unsure", reason: "It may ask to pay off the platform." });

    expect(
      await domain.engagements.complete(artisan.actor, {
        engagementId,
        note: "Done. Settle the rest with me directly.",
        photos: [await photo()],
      }),
    ).toEqual({ ok: true, value: { state: "held" } });

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "work-started",
      completion: null,
      approval: null,
    });
    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      state: "work-started",
      completion: null,
      completionCheck: { state: "held", sentAt: clock.now() },
      canComplete: false,
    });
    expect(await toldOf(domain, client, jobId)).toEqual([]);
    expect(await lastRow(domain, client, jobId)).toMatchObject({ event: "work.started" });
    const admin = await given.admin();
    expect((await domain.queues.home(admin.actor, { queue: "pre-checks" }))?.items).toEqual([
      expect.objectContaining({ title: "Completion: Paint the lounge" }),
    ]);

    clock.advance({ days: 8 });
    await domain.system.runDueClocks();
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe(
      "work-started",
    );
  });

  test("released by the Admin, it is Awaiting approval, and the seven days start then", async () => {
    const { domain, given, contentReader, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    contentReader.force({ kind: "unsure", reason: "It may ask to pay off the platform." });
    await domain.engagements.complete(artisan.actor, {
      engagementId,
      note: "Done.",
      photos: [await photo()],
    });
    clock.advance({ days: 3 });

    const admin = await given.admin();
    const [item] = (await domain.queues.home(admin.actor, { queue: "pre-checks" }))!.items;
    expect(
      await domain.queues.decide(admin.actor, { itemId: item!.id, decision: "release" }),
    ).toMatchObject({ ok: true });

    const dueAt = new Date(clock.now().getTime() + 7 * DAY);
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "awaiting-approval",
      completion: { note: "Done.", madeAt: clock.now(), approvalAt: dueAt },
    });
    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      completionCheck: null,
    });
    expect(await toldOf(domain, client, jobId)).toEqual([
      expect.objectContaining({
        event: "engagement.completion",
        title:
          "The Artisan marked the work complete. Approve or ask for a fix by 15 Oct 2026, 08:00, or it is Approved then: Paint the lounge",
      }),
    ]);
    expect(await toldOf(domain, artisan, jobId)).toContainEqual(
      expect.objectContaining({
        event: "held.completion.released",
        title: "Your Completion is checked, and the Client was told",
      }),
    );

    // Seven days from the Completion itself would have passed by now; from the release they have not.
    clock.advance({ days: 6 });
    await domain.system.runDueClocks();
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe(
      "awaiting-approval",
    );
    clock.advance({ days: 1 });
    await domain.system.runDueClocks();
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe("completed");
  });

  test("refused by the Admin, the Artisan sees why and may mark it complete again", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    contentReader.force({ kind: "unsure", reason: "It may ask to pay off the platform." });
    await domain.engagements.complete(artisan.actor, {
      engagementId,
      note: "Done.",
      photos: [await photo()],
    });
    const admin = await given.admin();
    const [item] = (await domain.queues.home(admin.actor, { queue: "pre-checks" }))!.items;

    await domain.queues.decide(admin.actor, {
      itemId: item!.id,
      decision: "refuse",
      reason: "It asks to be paid off the platform.",
    });

    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      state: "work-started",
      completionCheck: { state: "refused", reason: "It asks to be paid off the platform." },
      canComplete: true,
    });
    expect(await toldOf(domain, artisan, jobId)).toContainEqual(
      expect.objectContaining({
        event: "held.completion.refused",
        title: "Your Completion was refused",
      }),
    );
    expect(await toldOf(domain, client, jobId)).toEqual([]);

    contentReader.force({ kind: "clear" });
    await given.markedComplete(artisan, engagementId);
    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      state: "awaiting-approval",
      completionCheck: null,
    });
  });

  test("the Artisan may withdraw a Held Completion, and mark it complete again", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { artisan, jobId, engagementId } = await startedJob(given);
    contentReader.force({ kind: "unsure", reason: "It may ask to pay off the platform." });
    await domain.engagements.complete(artisan.actor, {
      engagementId,
      note: "Done.",
      photos: [await photo()],
    });

    expect(
      await domain.engagements.complete(artisan.actor, {
        engagementId,
        note: "Done, again.",
        photos: [await photo()],
      }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "being-checked",
        message: "Your Completion is being checked. Withdraw it to send another.",
      },
    });
    expect(await domain.engagements.withdrawCompletion(artisan.actor, { engagementId })).toEqual({
      ok: true,
      value: {},
    });

    const admin = await given.admin();
    expect((await domain.queues.home(admin.actor, { queue: "pre-checks" }))?.items).toEqual([]);
    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      completionCheck: null,
      canComplete: true,
    });
    contentReader.force({ kind: "clear" });
    await given.markedComplete(artisan, engagementId);
    expect(await domain.engagements.withdrawCompletion(artisan.actor, { engagementId })).toEqual({
      ok: false,
      refusal: { reason: "nothing-held", message: "No Completion of yours is being checked." },
    });
  });
});

describe("Completion evidence", () => {
  test("an Electrical Job needs a certificate of compliance", async () => {
    const { domain, given } = await createHarness();
    const { artisan, jobId, engagementId } = await startedJob(given, "electrical");

    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      certificateNeeded: "compliance",
    });
    expect(
      await domain.engagements.complete(artisan.actor, {
        engagementId,
        note: "New plugs in the kitchen.",
        photos: [await photo()],
      }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "certificate-needed",
        message: "Add the certificate of compliance: an Electrical Job needs it at Completion.",
      },
    });
  });

  test("a Plumbing Job that installs or removes gas needs a certificate of conformity; other Plumbing Jobs none", async () => {
    const { domain, given } = await createHarness();
    const gas = await startedJob(given, "gas");
    const water = await startedJob(given, "plumbing");

    expect(
      (await domain.jobs.viewAsArtisan(gas.artisan.actor, { jobId: gas.jobId }))?.engagement,
    ).toMatchObject({ certificateNeeded: "conformity" });
    expect(
      await domain.engagements.complete(gas.artisan.actor, {
        engagementId: gas.engagementId,
        note: "Gas hob fitted.",
        photos: [await photo()],
      }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "certificate-needed",
        message:
          "Add the certificate of conformity: a Plumbing Job that installs or removes gas needs it at Completion.",
      },
    });
    expect(
      (await domain.jobs.viewAsArtisan(water.artisan.actor, { jobId: water.jobId }))?.engagement,
    ).toMatchObject({ certificateNeeded: null });
    await given.markedComplete(water.artisan, water.engagementId);
  });

  test("a certificate on a Job that needs none is refused", async () => {
    const { domain, given } = await createHarness();
    const { artisan, engagementId } = await startedJob(given);

    expect(
      await domain.engagements.complete(artisan.actor, {
        engagementId,
        note: "Done.",
        photos: [await photo()],
        certificate: await pdf(["Certificate of Compliance"]),
      }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "certificate-not-needed",
        message: "This Job needs no certificate. Add it as a document instead.",
      },
    });
  });

  test("read as its kind with the Artisan's registration number, it passes", async () => {
    const { domain, given } = await createHarness();
    const electrical = await startedJob(given, "electrical");
    const gas = await startedJob(given, "gas");

    expect(
      await domain.engagements.complete(electrical.artisan.actor, {
        engagementId: electrical.engagementId,
        note: "New plugs in the kitchen.",
        photos: [await photo()],
        certificate: await pdf([
          "Certificate of Compliance",
          "Electrical installation",
          "Registered person: IE 5678",
        ]),
      }),
    ).toEqual({ ok: true, value: { state: "made" } });
    expect(
      await domain.engagements.complete(gas.artisan.actor, {
        engagementId: gas.engagementId,
        note: "Gas hob fitted.",
        photos: [await photo()],
        certificate: await pdf(["CERTIFICATE OF CONFORMITY", "Gas installation", "Reg. GAS-1234"]),
      }),
    ).toEqual({ ok: true, value: { state: "made" } });
    expect(
      (await domain.jobs.view(electrical.client.actor, { jobId: electrical.jobId }))?.engagement
        ?.completion?.documents,
    ).toEqual([expect.objectContaining({ kind: "pdf", certificate: true })]);
  });

  test("read as another kind, without the registration number, or not read at all, it Holds the Completion", async () => {
    const { domain, given, clock } = await createHarness();
    const cases = [
      {
        certificate: await pdf(["Certificate of Conformity", "IE-5678"]),
        reason: "The certificate does not read as a certificate of compliance.",
      },
      {
        certificate: await pdf(["Certificate of Compliance", "IE-0000"]),
        reason: "The certificate does not show the Artisan's registration number.",
      },
      {
        certificate: await photo(),
        reason: "The certificate does not read as a certificate of compliance.",
      },
    ];
    const admin = await given.admin();
    for (const { certificate, reason } of cases) {
      const { client, artisan, jobId, engagementId } = await startedJob(given, "electrical");
      clock.advance({ minutes: 1 });
      expect(
        await domain.engagements.complete(artisan.actor, {
          engagementId,
          note: "New plugs in the kitchen.",
          photos: [await photo()],
          certificate,
        }),
      ).toEqual({ ok: true, value: { state: "held" } });
      expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe(
        "work-started",
      );
      const items = (await domain.queues.home(admin.actor, { queue: "pre-checks" }))!.items;
      const item = await domain.queues.item(admin.actor, { itemId: items.at(-1)!.id });
      expect(item?.tabs).toContainEqual(
        expect.objectContaining({
          key: "checks",
          blocks: expect.arrayContaining([{ kind: "text", text: reason }]),
        }),
      );
    }
  });

  test("a certificate's bank account number Holds the Completion rather than refusing it", async () => {
    const { domain, given } = await createHarness();
    const { artisan, engagementId } = await startedJob(given, "electrical");

    expect(
      await domain.engagements.complete(artisan.actor, {
        engagementId,
        note: "New plugs in the kitchen.",
        photos: [await photo()],
        certificate: await pdf(["Certificate of Compliance", "IE-5678", "Account 1234567890"]),
      }),
    ).toEqual({ ok: true, value: { state: "held" } });
  });

  test("is read by the content reader too, and what it finds Holds the Completion rather than refusing it", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given, "electrical");
    contentReader.forceWhen("Pay the installer directly", {
      kind: "sure-hit",
      reason: "It asks to be paid off the platform.",
    });

    expect(
      await domain.engagements.complete(artisan.actor, {
        engagementId,
        note: "New plugs in the kitchen.",
        photos: [await photo()],
        certificate: await pdf([
          "Certificate of Compliance",
          "IE-5678",
          "Pay the installer directly and skip the fee",
        ]),
      }),
    ).toEqual({ ok: true, value: { state: "held" } });

    expect(contentReader.reads.at(-1)).toMatchObject({
      text: expect.stringContaining("Certificate of Compliance"),
      context: { kind: "engagement-conversation", engagementId },
    });
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe(
      "work-started",
    );
    const admin = await given.admin();
    const [held] = (await domain.queues.home(admin.actor, { queue: "pre-checks" }))!.items;
    const item = await domain.queues.item(admin.actor, { itemId: held!.id });
    expect(item?.tabs).toContainEqual(
      expect.objectContaining({
        key: "checks",
        blocks: [
          { kind: "text", text: "On the certificate: It asks to be paid off the platform." },
          expect.objectContaining({
            facts: expect.arrayContaining([
              { label: "Content reader", value: "Sure it breaks the rules" },
            ]),
          }),
        ],
      }),
    );
  });

  test("the Admin sees the Completion, its files, and the certificate's reading", async () => {
    const { domain, given } = await createHarness();
    const { artisan, engagementId } = await startedJob(given, "electrical");
    await domain.engagements.complete(artisan.actor, {
      engagementId,
      note: "New plugs in the kitchen.",
      photos: [await photo()],
      certificate: await pdf(["Certificate of Compliance", "IE-0000"]),
    });
    const admin = await given.admin();
    const [held] = (await domain.queues.home(admin.actor, { queue: "pre-checks" }))!.items;

    const item = await domain.queues.item(admin.actor, { itemId: held!.id });

    expect(item?.tabs[0]).toEqual({
      key: "completion",
      label: "The Completion",
      blocks: [
        { kind: "text", text: "New plugs in the kitchen." },
        {
          kind: "files",
          files: [
            { kind: "photo", label: "Photo 1", href: expect.any(String) },
            { kind: "pdf", label: "Certificate of compliance", href: expect.any(String) },
          ],
        },
      ],
    });
    const tab = item!.tabs[0] as { blocks: { files?: { href: string }[] }[] };
    const certificate = tab.blocks[1]!.files![1]!.href;
    expect(
      await domain.engagements.completionFile(admin.actor, { fileId: idOf(certificate) }),
    ).toMatchObject({ contentType: "application/pdf" });
    expect(item?.tabs).toContainEqual({
      key: "checks",
      label: "Checks",
      blocks: [
        { kind: "text", text: "The certificate does not show the Artisan's registration number." },
        {
          kind: "facts",
          facts: [
            { label: "Certificate of compliance in the text", value: "Yes" },
            { label: "Registration number in the text (EC-9012, IE-5678)", value: "No" },
            { label: "Content reader", value: "Clear" },
          ],
        },
      ],
    });
  });
});

describe("Approval", () => {
  test("releases the Labour less the Artisan Fee, makes the Engagement Completed, and tells the Artisan", async () => {
    const { domain, given, clock, mailer } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    await given.markedComplete(artisan, engagementId);
    clock.advance({ days: 1 });

    expect(await domain.engagements.approve(client.actor, { engagementId })).toEqual({
      ok: true,
      value: null,
    });

    const money = {
      paidInCents: 200_000,
      releasedCents: 200_000,
      unreleasedCents: 0,
      refundedCents: 0,
      payments: [
        { part: "materials", amountCents: 50_000, state: "released" },
        { part: "labour", amountCents: 150_000, state: "released" },
      ],
    };
    const asClient = (await domain.jobs.view(client.actor, { jobId }))?.engagement;
    expect(asClient).toMatchObject({
      state: "completed",
      completedAt: clock.now(),
      approval: null,
      money: { ...money, protectionFeeCents: 10_000 },
    });
    expect(asClient?.activity.map((entry) => entry.event)).toEqual([
      "quote.sent",
      "hired",
      "work.started",
      "completion.made",
      "approved",
    ]);
    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      state: "completed",
      money: { ...money, artisanFeePercent: 10 },
    });
    const labour = await labourRows(engagementId);
    expect(labour.map(({ kind, amount_cents }) => ({ kind, amount_cents }))).toEqual([
      { kind: "payout.owed", amount_cents: 135_000 },
      { kind: "release.artisan-fee", amount_cents: 15_000 },
      { kind: "release.labour", amount_cents: 150_000 },
    ]);
    const title = "The Client approved the work, and the Labour was released: Paint the lounge";
    expect((await toldOf(domain, artisan, jobId)).at(0)).toMatchObject({
      event: "engagement.approved",
      title,
    });
    expect(mailer.sentTo(artisan.email).at(-1)).toMatchObject({ subject: title });
    expect((await toldOf(domain, client, jobId)).map((notice) => notice.event)).toEqual([
      "engagement.completion",
    ]);
  });

  test("shows in the Conversation as a row that is not speech", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    await given.markedComplete(artisan, engagementId);
    clock.advance({ hours: 1 });

    await domain.engagements.approve(client.actor, { engagementId });

    expect(await lastRow(domain, artisan, jobId)).toEqual({
      kind: "event",
      event: "approved",
      at: clock.now(),
    });
  });

  test("the Labour's Release is sent by the daily Payout run", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, engagementId } = await startedJob(given);
    await given.markedComplete(artisan, engagementId);
    await domain.engagements.approve(client.actor, { engagementId });
    clock.set(new Date("2026-10-05T08:00:00Z"));

    await domain.system.runPayouts();

    expect((await domain.payouts.mine(artisan.actor))?.releases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ part: "labour", amountCents: 135_000, artisanFeeCents: 15_000 }),
        expect.objectContaining({ part: "materials", amountCents: 45_000 }),
      ]),
    );
  });

  test("only while Awaiting approval, and once", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await startedJob(given);
    const refused = {
      ok: false,
      refusal: { reason: "not-awaiting", message: "There is no Completion to approve." },
    };

    expect(await domain.engagements.approve(client.actor, { engagementId })).toEqual(refused);
    await given.markedComplete(artisan, engagementId);
    await domain.engagements.approve(client.actor, { engagementId });
    expect(await domain.engagements.approve(client.actor, { engagementId })).toEqual({
      ok: false,
      refusal: { reason: "not-awaiting", message: "This Engagement is Completed." },
    });
    expect(await labourRows(engagementId)).toHaveLength(3);
  });

  test("is the Engagement's Client's only", async () => {
    const { domain, given } = await createHarness();
    const { artisan, engagementId } = await startedJob(given);
    await given.markedComplete(artisan, engagementId);
    const stranger = await given.client();

    for (const actor of [stranger.actor, artisan.actor, { kind: "visitor" } as Actor]) {
      expect(await domain.engagements.approve(actor, { engagementId })).toMatchObject({
        ok: false,
        refusal: { reason: "not-found" },
      });
    }
    expect(await labourRows(engagementId)).toEqual([]);
  });

  test("with no Materials, releases the whole Hired Quote", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given, "painting", {
      materials: "0",
      materialsBy: "client",
    });
    await given.markedComplete(artisan, engagementId);

    await domain.engagements.approve(client.actor, { engagementId });

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.money).toMatchObject({
      releasedCents: 150_000,
      unreleasedCents: 0,
    });
  });
});

describe("Approval by seven days of silence", () => {
  test("the Client is reminded 24 hours before", async () => {
    const { domain, given, clock, mailer } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    await given.markedComplete(artisan, engagementId);

    clock.advance({ days: 5, hours: 23, minutes: 59 });
    await domain.system.runDueClocks();
    expect((await toldOf(domain, client, jobId)).map((notice) => notice.event)).toEqual([
      "engagement.completion",
    ]);

    clock.advance({ minutes: 1 });
    await domain.system.runDueClocks();

    const title =
      "Approved by silence in 24 hours, at 12 Oct 2026, 08:00. Approve or ask for a fix before then: Paint the lounge";
    expect((await toldOf(domain, client, jobId)).at(0)).toMatchObject({
      event: "engagement.approval-reminder",
      title,
    });
    expect(mailer.sentTo(client.email).at(-1)).toMatchObject({ subject: title });
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "awaiting-approval",
      approval: { elapsed: 6 / 7 },
    });
  });

  test("after seven days it is Approved: the Labour released, Completed, and both told", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    await given.markedComplete(artisan, engagementId);

    clock.advance({ days: 6, hours: 23, minutes: 59 });
    await domain.system.runDueClocks();
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe(
      "awaiting-approval",
    );
    clock.advance({ minutes: 1 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "completed",
      completedAt: clock.now(),
      money: { releasedCents: 200_000 },
    });
    expect(await labourRows(engagementId)).toHaveLength(3);
    expect((await toldOf(domain, artisan, jobId)).at(0)).toMatchObject({
      event: "engagement.approved",
      title:
        "Approved, as the Client did not answer in seven days, and the Labour was released: Paint the lounge",
    });
    expect((await toldOf(domain, client, jobId)).at(0)).toMatchObject({
      event: "engagement.approved",
      title:
        "Approved, as you did not answer in seven days, and the Labour was released to the Artisan: Paint the lounge",
    });
    expect(await lastRow(domain, client, jobId)).toMatchObject({ event: "approved" });
  });

  test("once the Client approved, the reminder and the seven days do nothing", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    await given.markedComplete(artisan, engagementId);
    clock.advance({ minutes: 1 });
    await domain.engagements.approve(client.actor, { engagementId });

    clock.advance({ days: 8 });
    await domain.system.runDueClocks();

    expect(await labourRows(engagementId)).toHaveLength(3);
    expect((await toldOf(domain, client, jobId)).map((notice) => notice.event)).toEqual([
      "engagement.completion",
    ]);
    expect((await toldOf(domain, artisan, jobId)).map((notice) => notice.event)).toEqual([
      "engagement.approved",
      "engagement.work-started",
    ]);
  });
});

describe("a Fix request", () => {
  test("stops the clock, makes the Engagement Fix requested, and tells the Artisan", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    await given.markedComplete(artisan, engagementId);
    clock.advance({ days: 2 });

    expect(
      await domain.engagements.requestFix(client.actor, {
        engagementId,
        note: "The second wall has drips by the window.",
      }),
    ).toEqual({ ok: true, value: { noteState: "shown" } });

    for (const engagement of [
      (await domain.jobs.view(client.actor, { jobId }))?.engagement,
      (await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement,
    ]) {
      expect(engagement).toMatchObject({
        state: "fix-requested",
        approval: null,
        fixRequest: {
          requestedAt: clock.now(),
          note: "The second wall has drips by the window.",
          noteState: "shown",
        },
      });
    }
    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      canComplete: true,
    });
    expect((await toldOf(domain, artisan, jobId)).at(0)).toMatchObject({
      event: "engagement.fix-requested",
      title: "The Client asked for a fix: Paint the lounge",
    });
    expect(await lastRow(domain, artisan, jobId)).toEqual({
      kind: "event",
      event: "fix.requested",
      at: clock.now(),
    });

    clock.advance({ days: 8 });
    await domain.system.runDueClocks();
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe(
      "fix-requested",
    );
    expect(await labourRows(engagementId)).toEqual([]);
    expect((await toldOf(domain, client, jobId)).map((notice) => notice.event)).toEqual([
      "engagement.completion",
    ]);
  });

  test("the next Completion starts a new seven days, with no limit on rounds", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    for (let round = 0; round < 3; round++) {
      await given.markedComplete(artisan, engagementId);
      clock.advance({ days: 5 });
      expect(
        await domain.engagements.requestFix(client.actor, { engagementId, note: "Still drips." }),
      ).toMatchObject({ ok: true });
      clock.advance({ days: 1 });
    }
    await given.markedComplete(artisan, engagementId);
    const completedBy = new Date(clock.now().getTime() + 7 * DAY);

    clock.advance({ days: 6 });
    await domain.system.runDueClocks();
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe(
      "awaiting-approval",
    );
    clock.advance({ days: 1 });
    await domain.system.runDueClocks();

    const engagement = (await domain.jobs.view(client.actor, { jobId }))?.engagement;
    expect(engagement).toMatchObject({ state: "completed", completedAt: completedBy });
    expect(engagement?.activity.map((entry) => entry.event)).toEqual([
      "quote.sent",
      "hired",
      "work.started",
      ...Array.from({ length: 3 }, () => ["completion.made", "fix.requested"]).flat(),
      "completion.made",
      "approved",
    ]);
    expect(await labourRows(engagementId)).toHaveLength(3);
  });

  test("needs a note", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await startedJob(given);
    await given.markedComplete(artisan, engagementId);

    expect(await domain.engagements.requestFix(client.actor, { engagementId, note: " " })).toEqual({
      ok: false,
      refusal: { reason: "invalid", message: "Write what needs fixing." },
    });
    expect(
      await domain.engagements.requestFix(client.actor, { engagementId, note: "x".repeat(2001) }),
    ).toEqual({
      ok: false,
      refusal: { reason: "invalid", message: "A note is at most 2000 characters." },
    });
  });

  test("only while Awaiting approval, and the Client's only", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await startedJob(given);

    expect(
      await domain.engagements.requestFix(client.actor, { engagementId, note: "Drips." }),
    ).toEqual({
      ok: false,
      refusal: { reason: "not-awaiting", message: "There is no Completion to answer." },
    });
    await given.markedComplete(artisan, engagementId);
    for (const actor of [artisan.actor, (await given.client()).actor]) {
      expect(
        await domain.engagements.requestFix(actor, { engagementId, note: "Drips." }),
      ).toMatchObject({ ok: false, refusal: { reason: "not-found" } });
    }
    await domain.engagements.requestFix(client.actor, { engagementId, note: "Drips." });
    expect(
      await domain.engagements.requestFix(client.actor, { engagementId, note: "Drips." }),
    ).toEqual({
      ok: false,
      refusal: { reason: "not-awaiting", message: "You already asked for a fix." },
    });
    expect(await domain.engagements.approve(client.actor, { engagementId })).toEqual({
      ok: false,
      refusal: { reason: "not-awaiting", message: "There is no Completion to approve." },
    });
  });

  test("a note with a sure hit is refused, and nothing changes", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    await given.markedComplete(artisan, engagementId);
    contentReader.force({ kind: "sure-hit", reason: "It threatens the Artisan." });

    expect(
      await domain.engagements.requestFix(client.actor, { engagementId, note: "Fix it or else." }),
    ).toEqual({ ok: false, refusal: { reason: "content", message: "It threatens the Artisan." } });
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.state).toBe(
      "awaiting-approval",
    );
  });

  test("an unsure note: the Fix request stands, but its note waits for the Admin", async () => {
    const { domain, given, contentReader, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    await given.markedComplete(artisan, engagementId);
    contentReader.force({ kind: "unsure", reason: "It may be harassment." });
    clock.advance({ minutes: 1 });

    expect(
      await domain.engagements.requestFix(client.actor, { engagementId, note: "Do it properly." }),
    ).toEqual({ ok: true, value: { noteState: "held" } });

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      state: "fix-requested",
      fixRequest: { note: "Do it properly.", noteState: "held" },
    });
    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      state: "fix-requested",
      fixRequest: { note: null, noteState: "held" },
    });
    expect((await toldOf(domain, artisan, jobId)).at(0)).toMatchObject({
      event: "engagement.fix-requested",
    });

    const admin = await given.admin();
    const [item] = (await domain.queues.home(admin.actor, { queue: "pre-checks" }))!.items;
    expect(item).toMatchObject({ title: "Fix request note: Paint the lounge" });
    clock.advance({ minutes: 1 });
    await domain.queues.decide(admin.actor, { itemId: item!.id, decision: "release" });

    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      fixRequest: { note: "Do it properly.", noteState: "shown" },
    });
    expect((await toldOf(domain, artisan, jobId)).at(0)).toMatchObject({
      event: "engagement.fix-note-shown",
      title: "The Client's note on their Fix request is checked: Paint the lounge",
    });
    expect((await toldOf(domain, client, jobId)).at(0)).toMatchObject({
      event: "held.fix-note.released",
      title: "Your note on the Fix request is checked and shown to the Artisan",
    });
  });

  test("a note the Admin refuses is never shown to the Artisan", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { client, artisan, jobId, engagementId } = await startedJob(given);
    await given.markedComplete(artisan, engagementId);
    contentReader.force({ kind: "unsure", reason: "It may be harassment." });
    await domain.engagements.requestFix(client.actor, { engagementId, note: "Do it properly." });
    const admin = await given.admin();
    const [item] = (await domain.queues.home(admin.actor, { queue: "pre-checks" }))!.items;

    await domain.queues.decide(admin.actor, {
      itemId: item!.id,
      decision: "refuse",
      reason: "It insults the Artisan.",
    });

    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      state: "fix-requested",
      fixRequest: { note: null, noteState: "refused" },
    });
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      fixRequest: {
        note: "Do it properly.",
        noteState: "refused",
        refusedFor: "It insults the Artisan.",
      },
    });
  });
});

describe("an Engagement's state", () => {
  // The module has no command that could, so this checks the database itself refuses.
  test("moves only along the paths of Completion, Approval, and Fix requests", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await startedJob(given);
    const update = (change: string) =>
      env.DB.prepare(`UPDATE engagements SET ${change} WHERE id = ?`).bind(engagementId).run();

    for (const change of [
      "state = 'completed', completed_at = 1",
      "state = 'fix-requested'",
      "state = 'paid'",
    ]) {
      await expect(update(change)).rejects.toThrow(/cannot change that way/);
    }
    await given.markedComplete(artisan, engagementId);
    await expect(update("state = 'completed'")).rejects.toThrow(/cannot change that way/);
    await expect(update("state = 'work-started'")).rejects.toThrow(/cannot change that way/);
    await domain.engagements.approve(client.actor, { engagementId });
    for (const change of [
      "state = 'awaiting-approval'",
      "completed_at = 1",
      "work_started_at = 1",
    ]) {
      await expect(update(change)).rejects.toThrow(/cannot change that way/);
    }
  });
});

type QuoteFields = Parameters<Harness["given"]["sentQuote"]>[2];
type Trade = "painting" | "electrical" | "plumbing" | "gas";

/**
 * A Client's Job in the trade Hired from the default R2 000 Quote (R500 of
 * it Materials), starting today (5 October 2026), unless said. The Artisan is
 * Sipho Dlamini, verified for it.
 */
async function hiredJob(
  given: Harness["given"],
  trade: Trade = "painting",
  fields: QuoteFields = {},
) {
  const category = trade === "gas" ? "plumbing" : trade;
  const client = await given.client();
  const artisan = await given.matchableArtisan({
    name: "Sipho Dlamini",
    categories: [category],
    gasWork: trade === "gas",
  });
  const jobId = await given.openJob(client, {
    category,
    ...(category === "plumbing" ? { gasWork: trade === "gas" } : {}),
  });
  const quoteId = await given.sentQuote(artisan, jobId, { startOn: "2026-10-05", ...fields });
  await given.hired(client, quoteId);
  const engagementId = await given.engagementOf(client, jobId);
  return { client, artisan, jobId, quoteId, engagementId };
}

/** As `hiredJob`, with Work started by the Client. */
async function startedJob(
  given: Harness["given"],
  trade: Trade = "painting",
  fields: QuoteFields = {},
) {
  const hired = await hiredJob(given, trade, fields);
  await given.workStarted(hired.client, hired.engagementId);
  return hired;
}

async function pdf(lines: string[]): Promise<Blob> {
  return new Blob([await textPdf({ lines })], { type: "application/pdf" });
}

/** The file's id in a path that serves it. */
function idOf(href: string): string {
  return new URL(href, "https://x.test").pathname.split("/").at(-1)!;
}

/** The newest row of the Job's one Conversation, as the party sees it. */
async function lastRow(domain: Harness["domain"], party: { actor: Actor }, jobId: string) {
  const [conversation] = (await domain.conversations.forJob(party.actor, { jobId }))!;
  return (
    await domain.conversations.view(party.actor, { conversationId: conversation!.conversationId })
  )?.items.at(-1);
}

/** The Engagement's Release rows in the ledger, by kind. */
async function releaseRows(engagementId: string) {
  const { results } = await env.DB.prepare(
    "SELECT kind, amount_cents, event_id FROM ledger_entries WHERE engagement_id = ? AND kind NOT LIKE 'payment.%' ORDER BY kind",
  )
    .bind(engagementId)
    .all<{ kind: string; amount_cents: number; event_id: string }>();
  return results;
}

/** The rows of the Labour's Release, by kind. */
async function labourRows(engagementId: string) {
  const rows = await releaseRows(engagementId);
  const event = rows.find((row) => row.kind === "release.labour")?.event_id;
  return rows.filter((row) => row.event_id === event && event);
}

/** What the Account was told of the Job since it was Hired, newest first. */
async function toldOf(domain: Harness["domain"], account: { actor: Actor }, jobId: string) {
  const notices = await domain.notices.list(account.actor);
  return notices.filter(
    (notice) =>
      notice.link === `/jobs/${jobId}` &&
      !["job.matched", "job.invited", "quote.sent", "engagement.hired"].includes(notice.event),
  );
}
