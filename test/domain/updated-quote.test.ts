import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import type { Actor } from "@/domain/actor";
import type { CreateRefund, Webhook } from "@/domain/ports";
import type { FakePayments } from "@/domain/fakes/payments";
import { formatRands } from "@/domain/money";
import { collectionOf } from "../support/given";
import { createHarness, type Harness } from "../support/harness";
import { photo } from "../support/verification";

// Updated Quote (#134, ADR 0019): before Completion the Artisan may propose
// new Labour and Materials when the site differs, neither lower. It applies
// only when the Client pays the difference plus its Protection Fee; rejected
// or withdrawn, the price stands. Extra Materials are released at acceptance
// if work has started, otherwise at Work started; extra Labour goes with the
// Labour, at the Artisan Fee fixed at Hire.

describe("proposing an Updated Quote", () => {
  test("tells the Client, who sees the difference to pay with its Protection Fee", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    clock.advance({ hours: 1 });

    const proposed = await domain.engagements.proposeUpdatedQuote(artisan.actor, {
      engagementId,
      labour: "1800",
      materials: "650",
    });

    expect(proposed).toEqual({ ok: true, value: { updatedQuoteId: expect.any(String) } });
    const asClient = (await domain.jobs.view(client.actor, { jobId }))?.engagement;
    expect(asClient?.updatedQuote).toEqual({
      updatedQuoteId: proposed.ok && proposed.value.updatedQuoteId,
      proposedAt: clock.now(),
      fromLabourCents: 150_000,
      fromMaterialsCents: 50_000,
      labourCents: 180_000,
      materialsCents: 65_000,
      addsCents: 45_000,
      protectionFeeCents: 2_250,
      payCents: 47_250,
    });
    const asArtisan = (await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement;
    expect(asArtisan?.updatedQuote).toEqual({
      updatedQuoteId: proposed.ok && proposed.value.updatedQuoteId,
      proposedAt: clock.now(),
      fromLabourCents: 150_000,
      fromMaterialsCents: 50_000,
      labourCents: 180_000,
      materialsCents: 65_000,
      addsCents: 45_000,
    });
    expect(asClient?.activity.at(-1)).toEqual({
      event: "updated-quote.proposed",
      at: clock.now(),
    });
    expect(await toldOf(domain, client, jobId)).toEqual([
      expect.objectContaining({
        event: "updated-quote.proposed",
        title: `The Artisan proposed an Updated Quote. Pay the difference, ${formatRands(47_250)} with its Protection Fee, to accept it: Paint the lounge`,
      }),
    ]);
  });

  test("may raise one line and keep the other", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);

    await proposed(domain, artisan, engagementId, { labour: "1500", materials: "700" });

    expect(
      (await domain.jobs.view(client.actor, { jobId }))?.engagement?.updatedQuote,
    ).toMatchObject({
      labourCents: 150_000,
      materialsCents: 70_000,
      addsCents: 20_000,
      payCents: 21_000,
    });
  });

  test("is refused when a line goes down, or nothing goes up", async () => {
    const { domain, given } = await createHarness();
    const { artisan, engagementId } = await hiredJob(given);
    const propose = (labour: string, materials: string) =>
      domain.engagements.proposeUpdatedQuote(artisan.actor, { engagementId, labour, materials });

    expect(await propose("1400", "900")).toEqual({
      ok: false,
      refusal: {
        reason: "lower",
        message: `The Labour cannot go down: it is ${formatRands(150_000)} now. To lower the price, refund it.`,
      },
    });
    expect(await propose("2000", "499.99")).toEqual({
      ok: false,
      refusal: {
        reason: "lower",
        message: `The Materials cannot go down: they are ${formatRands(50_000)} now. To lower the price, refund them.`,
      },
    });
    expect(await propose("1500", "500")).toEqual({
      ok: false,
      refusal: { reason: "no-change", message: "Raise the Labour, the Materials, or both." },
    });
    expect(await propose("abc", "500")).toMatchObject({
      ok: false,
      refusal: { reason: "invalid" },
    });
  });

  test("starts from the price now, lowered by a Refund made while it waits", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await proposed(domain, artisan, engagementId, { labour: "1800", materials: "500" });

    await refunded(domain, artisan, engagementId, { labour: "100" });

    expect(
      (await domain.jobs.view(client.actor, { jobId }))?.engagement?.updatedQuote,
    ).toMatchObject({
      fromLabourCents: 140_000,
      labourCents: 170_000,
      addsCents: 30_000,
      payCents: 31_500,
    });
  });

  test("starts from the price less what the Artisan refunded", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await refunded(domain, artisan, engagementId, { labour: "200" });

    await proposed(domain, artisan, engagementId, { labour: "1400", materials: "500" });

    expect(
      (await domain.jobs.view(client.actor, { jobId }))?.engagement?.updatedQuote,
    ).toMatchObject({ fromLabourCents: 130_000, labourCents: 140_000, addsCents: 10_000 });
  });

  test("keeps the Materials at zero when the Client supplies them", async () => {
    const { domain, given } = await createHarness();
    const { artisan, engagementId } = await hiredJob(given, {
      materials: "0",
      materialsBy: "client",
    });

    expect(
      await domain.engagements.proposeUpdatedQuote(artisan.actor, {
        engagementId,
        labour: "1500",
        materials: "100",
      }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "client-supplies",
        message: "The Client supplies the materials on this Job, so the Materials stay at zero.",
      },
    });
  });

  test("is one at a time, by the Hired Artisan only", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await hiredJob(given);
    const other = await given.matchableArtisan({ name: "Lerato Khumalo" });
    await proposed(domain, artisan, engagementId, { labour: "1800", materials: "500" });

    expect(
      await domain.engagements.proposeUpdatedQuote(artisan.actor, {
        engagementId,
        labour: "1900",
        materials: "500",
      }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "already-proposed",
        message: "Your Updated Quote is waiting for the Client. Withdraw it to propose another.",
      },
    });
    for (const someone of [client, other]) {
      expect(
        await domain.engagements.proposeUpdatedQuote(someone.actor, {
          engagementId,
          labour: "1900",
          materials: "500",
        }),
      ).toMatchObject({ ok: false, refusal: { reason: "not-found" } });
    }
  });

  test("is only before Completion", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await hiredJob(given);
    await given.workStarted(client, engagementId);
    await given.markedComplete(artisan, engagementId);

    expect(
      await domain.engagements.proposeUpdatedQuote(artisan.actor, {
        engagementId,
        labour: "1800",
        materials: "500",
      }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "not-before-completion",
        message: "An Updated Quote can only be proposed before the work is marked complete.",
      },
    });
  });

  test("is not while the Artisan's Completion is being checked", async () => {
    const { domain, given, contentReader } = await createHarness();
    const { client, artisan, engagementId } = await hiredJob(given);
    await given.workStarted(client, engagementId);
    contentReader.force({ kind: "unsure", reason: "It may ask to pay off the platform." });
    const marked = await domain.engagements.complete(artisan.actor, {
      engagementId,
      note: "Done.",
      photos: [await photo()],
    });
    expect(marked).toEqual({ ok: true, value: { state: "held" } });

    expect(
      await domain.engagements.proposeUpdatedQuote(artisan.actor, {
        engagementId,
        labour: "1800",
        materials: "500",
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-before-completion" } });
  });

  test("may come after Work started, and after a Fix request", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await hiredJob(given);
    await given.workStarted(client, engagementId);
    await withdrawn(
      domain,
      artisan,
      await proposed(domain, artisan, engagementId, { labour: "1600", materials: "500" }),
    );
    await given.markedComplete(artisan, engagementId);
    const asked = await domain.engagements.requestFix(client.actor, {
      engagementId,
      note: "The skirting is still unpainted.",
    });
    if (!asked.ok) throw new Error(asked.refusal.message);

    expect(
      await domain.engagements.proposeUpdatedQuote(artisan.actor, {
        engagementId,
        labour: "1700",
        materials: "500",
      }),
    ).toMatchObject({ ok: true });
  });

  test("stops the Artisan marking the work complete until it is answered or withdrawn", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await given.workStarted(client, engagementId);
    await proposed(domain, artisan, engagementId, { labour: "1600", materials: "500" });

    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      canComplete: false,
    });
    await expect(given.markedComplete(artisan, engagementId)).rejects.toThrow(
      "Your Updated Quote is waiting for the Client. Withdraw it, or wait for their answer, to mark the work complete.",
    );
  });
});

describe("withdrawing or rejecting an Updated Quote", () => {
  test("the Artisan withdraws it, and the Client is told; the price stands", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    const updatedQuoteId = await proposed(domain, artisan, engagementId, {
      labour: "1800",
      materials: "500",
    });
    clock.advance({ hours: 1 });

    expect(
      await domain.engagements.withdrawUpdatedQuote(artisan.actor, { updatedQuoteId }),
    ).toEqual({ ok: true, value: null });

    const engagement = (await domain.jobs.view(client.actor, { jobId }))?.engagement;
    expect(engagement).toMatchObject({ updatedQuote: null, money: { paidInCents: 200_000 } });
    expect(engagement?.activity.at(-1)).toEqual({
      event: "updated-quote.withdrawn",
      at: clock.now(),
    });
    expect((await toldOf(domain, client, jobId))[0]).toMatchObject({
      event: "updated-quote.withdrawn",
      title: "The Artisan withdrew their Updated Quote: Paint the lounge",
    });
    expect(
      await domain.engagements.withdrawUpdatedQuote(artisan.actor, { updatedQuoteId }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-proposed" } });
    // Another may follow.
    await proposed(domain, artisan, engagementId, { labour: "1700", materials: "500" });
  });

  test("the Client rejects it, and the Artisan is told; the price stands", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    const updatedQuoteId = await proposed(domain, artisan, engagementId, {
      labour: "1800",
      materials: "500",
    });
    clock.advance({ hours: 1 });

    expect(await domain.engagements.rejectUpdatedQuote(client.actor, { updatedQuoteId })).toEqual({
      ok: true,
      value: null,
    });

    const engagement = (await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement;
    expect(engagement).toMatchObject({ updatedQuote: null, money: { paidInCents: 200_000 } });
    expect(engagement?.activity.at(-1)).toEqual({
      event: "updated-quote.rejected",
      at: clock.now(),
    });
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({
        event: "updated-quote.rejected",
        title:
          "The Client rejected your Updated Quote, so the price stays as it was: Paint the lounge",
      }),
    ]);
  });

  test("only the parties may answer it, each their own way", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await hiredJob(given);
    const updatedQuoteId = await proposed(domain, artisan, engagementId, {
      labour: "1800",
      materials: "500",
    });

    expect(
      await domain.engagements.withdrawUpdatedQuote(client.actor, { updatedQuoteId }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-found" } });
    expect(
      await domain.engagements.rejectUpdatedQuote(artisan.actor, { updatedQuoteId }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-found" } });
    expect(
      await domain.engagements.acceptUpdatedQuote(artisan.actor, {
        updatedQuoteId,
        feeAcknowledged: true,
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-found" } });
  });
});

describe("accepting an Updated Quote by paying", () => {
  test("asks for the difference plus 5% through checkout, once the fee is acknowledged", async () => {
    const { domain, given, payments } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    const updatedQuoteId = await proposed(domain, artisan, engagementId, {
      labour: "1800",
      materials: "650",
    });

    expect(
      await domain.engagements.acceptUpdatedQuote(client.actor, {
        updatedQuoteId,
        feeAcknowledged: false,
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "fee-not-acknowledged" } });
    const collectionId = await checkout(domain, client, updatedQuoteId);

    expect(
      payments.calls.filter((call) => call.operation === "createCollection").at(-1)?.input,
    ).toMatchObject({
      id: collectionId,
      amountCents: 47_250,
      methods: ["card", "pay_by_bank"],
      returnUrl: `https://artisanconnect.test/jobs/${jobId}`,
    });
    // Nothing applies until the money arrives.
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      money: { paidInCents: 200_000 },
      updatedQuote: { updatedQuoteId },
    });
  });

  test("before Work started: the difference is paid in, the Artisan is told, and the Client gets a Receipt", async () => {
    const { domain, given, payments, mailer, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    const updatedQuoteId = await proposed(domain, artisan, engagementId, {
      labour: "1800",
      materials: "650",
    });
    const collectionId = await checkout(domain, client, updatedQuoteId);
    clock.advance({ hours: 1 });

    await receive(domain, await payments.succeedCollection(collectionId));

    const engagement = (await domain.jobs.view(client.actor, { jobId }))?.engagement;
    expect(engagement).toMatchObject({
      updatedQuote: null,
      money: {
        paidInCents: 245_000,
        releasedCents: 0,
        unreleasedCents: 245_000,
        protectionFeeCents: 12_250,
        payments: [
          { part: "materials", amountCents: 65_000, unreleasedCents: 65_000 },
          { part: "labour", amountCents: 180_000, unreleasedCents: 180_000 },
        ],
      },
    });
    expect(engagement?.activity.at(-1)).toEqual({
      event: "updated-quote.accepted",
      at: clock.now(),
    });
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({
        event: "updated-quote.accepted",
        title: `The Client accepted your Updated Quote and paid the difference, ${formatRands(45_000)}: Paint the lounge`,
      }),
    ]);
    const receipt = mailer.sentTo(client.email).at(-1);
    expect(receipt?.subject).toBe("Receipt for your Updated Quote's Payment: Paint the lounge");
    expect(receipt?.text).toContain(
      [
        `Updated Quote: ${formatRands(245_000)}, up from ${formatRands(200_000)}`,
        `Labour: ${formatRands(180_000)}, up ${formatRands(30_000)}`,
        `Materials: ${formatRands(65_000)}, up ${formatRands(15_000)}`,
        `Difference: ${formatRands(45_000)}`,
        `Protection Fee (5%, not refunded): ${formatRands(2_250)}`,
        `Total paid: ${formatRands(47_250)}`,
      ].join("\n"),
    );
    expect(receipt?.text).toContain(
      `Reference: AC ${collectionId.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
    );
    expect(receipt?.text).toContain("This Receipt is not a tax invoice.");
  });

  test("before Work started: the extra Materials are released at Work started with the rest", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await accepted(domain, given, client, artisan, engagementId, {
      labour: "1800",
      materials: "650",
    });

    await given.workStarted(client, engagementId);

    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      money: {
        releasedCents: 65_000,
        payments: [
          { part: "materials", amountCents: 65_000, unreleasedCents: 0, state: "released" },
          { part: "labour", amountCents: 180_000, unreleasedCents: 180_000 },
        ],
      },
    });
    expect(await ledger(engagementId, "release.")).toEqual([
      { kind: "release.materials", amount_cents: 65_000 },
      { kind: "release.artisan-fee", amount_cents: 6_500 },
    ]);
  });

  test("after Work started: the extra Materials are released at once, at the Artisan Fee fixed at Hire", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await given.workStarted(client, engagementId);

    await accepted(domain, given, client, artisan, engagementId, {
      labour: "1500",
      materials: "650",
    });

    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      money: {
        artisanFeePercent: 10,
        payments: [
          { part: "materials", amountCents: 65_000, unreleasedCents: 0, state: "released" },
          { part: "labour", amountCents: 150_000, unreleasedCents: 150_000 },
        ],
      },
    });
    expect(await ledger(engagementId, "release.")).toEqual([
      { kind: "release.materials", amount_cents: 50_000 },
      { kind: "release.artisan-fee", amount_cents: 5_000 },
      { kind: "release.materials", amount_cents: 15_000 },
      { kind: "release.artisan-fee", amount_cents: 1_500 },
    ]);
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({
        title: `The Client accepted your Updated Quote and paid the difference, ${formatRands(15_000)}. The extra Materials were released: Paint the lounge`,
      }),
    ]);
  });

  test("the extra Labour is released with the Labour at Approval", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await given.workStarted(client, engagementId);
    await accepted(domain, given, client, artisan, engagementId, {
      labour: "1800",
      materials: "500",
    });
    await given.markedComplete(artisan, engagementId);

    const approved = await domain.engagements.approve(client.actor, { engagementId });
    if (!approved.ok) throw new Error(approved.refusal.message);

    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement).toMatchObject({
      state: "completed",
      money: { paidInCents: 230_000, releasedCents: 230_000, unreleasedCents: 0 },
    });
    expect((await ledger(engagementId, "release.labour")).map((row) => row.amount_cents)).toEqual([
      180_000,
    ]);
  });

  test("a second Updated Quote starts from the first one's price", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await accepted(domain, given, client, artisan, engagementId, {
      labour: "1800",
      materials: "500",
    });

    await proposed(domain, artisan, engagementId, { labour: "1900", materials: "500" });

    expect(
      (await domain.jobs.view(client.actor, { jobId }))?.engagement?.updatedQuote,
    ).toMatchObject({
      fromLabourCents: 180_000,
      labourCents: 190_000,
      addsCents: 10_000,
      payCents: 10_500,
    });
  });

  test("a repeated payment event changes nothing twice", async () => {
    const { domain, given, payments } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    const updatedQuoteId = await proposed(domain, artisan, engagementId, {
      labour: "1800",
      materials: "500",
    });
    const collectionId = await checkout(domain, client, updatedQuoteId);
    const webhook = await payments.succeedCollection(collectionId);

    await receive(domain, webhook);
    await receive(domain, webhook);

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.money).toMatchObject({
      paidInCents: 230_000,
      protectionFeeCents: 11_500,
    });
    expect(await toldOf(domain, artisan, jobId)).toHaveLength(1);
  });

  test("is refused once it is no longer proposed", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await hiredJob(given);
    const updatedQuoteId = await proposed(domain, artisan, engagementId, {
      labour: "1800",
      materials: "500",
    });
    await withdrawn(domain, artisan, updatedQuoteId);

    expect(
      await domain.engagements.acceptUpdatedQuote(client.actor, {
        updatedQuoteId,
        feeAcknowledged: true,
      }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "not-proposed",
        message: "This Updated Quote is no longer proposed.",
      },
    });
  });

  // A Refund splits over the Payments from what it read; two at once could each read the same
  // Payment's money as still there, so the database refuses taking more from one than it paid in.
  test("the ledger refuses a Refund of more of a line from one Payment than it paid in", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId, collectionId } = await hiredJob(given);
    await accepted(domain, given, client, artisan, engagementId, {
      labour: "1800",
      materials: "500",
    });

    await expect(
      env.DB.prepare(
        "INSERT INTO ledger_entries (id, event_id, kind, amount_cents, recorded_at, payment_id, engagement_id) VALUES ('r1', 'e1', 'refund.labour', 160000, 0, ?, ?)",
      )
        .bind(collectionId, engagementId)
        .run(),
    ).rejects.toThrow(/more than is unreleased/);
  });

  // Work started reads the Materials unreleased, then releases them in its batch. An Updated
  // Quote's Payment landing between the two would leave its extra Materials unreleased, so the
  // database refuses that batch, and Work started works the Materials out again.
  test("the ledger refuses a Release of Materials that would leave some unreleased", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId, collectionId } = await hiredJob(given);
    await accepted(domain, given, client, artisan, engagementId, {
      labour: "1500",
      materials: "650",
    });

    await expect(
      env.DB.prepare(
        "INSERT INTO ledger_entries (id, event_id, kind, amount_cents, recorded_at, payment_id, engagement_id) VALUES ('r1', 'e1', 'release.materials', 50000, 0, ?, ?)",
      )
        .bind(collectionId, engagementId)
        .run(),
    ).rejects.toThrow(/Materials left unreleased/);
    await given.workStarted(client, engagementId);
    expect(await ledger(engagementId, "release.materials")).toEqual([
      { kind: "release.materials", amount_cents: 65_000 },
    ]);
  });
});

describe("a Payment that arrives once the Updated Quote is no longer proposed", () => {
  test("withdrawn while checkout was open is refunded whole, Protection Fee included", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    const updatedQuoteId = await proposed(domain, artisan, engagementId, {
      labour: "1800",
      materials: "650",
    });
    const collectionId = await checkout(domain, client, updatedQuoteId);
    await withdrawn(domain, artisan, updatedQuoteId);
    clock.advance({ minutes: 5 });

    await receive(domain, await payments.succeedCollection(collectionId));

    expect(refundsAsked(payments)).toEqual([
      {
        id: expect.any(String),
        collectionId,
        amountCents: 47_250,
        reason: "No Hire: updated-quote-ended",
      },
    ]);
    const view = await domain.jobs.view(client.actor, { jobId });
    expect(view?.engagement).toMatchObject({
      updatedQuote: null,
      money: { paidInCents: 200_000, protectionFeeCents: 10_000 },
    });
    expect(view?.notHired).toEqual([
      expect.objectContaining({ amountCents: 47_250, reason: "updated-quote-ended" }),
    ]);
    expect((await toldOf(domain, client, jobId))[0]).toMatchObject({
      event: "payment.not-hired",
      title:
        "Your Payment will be refunded in full, as the Updated Quote was no longer proposed: Paint the lounge",
    });
    expect(await toldOf(domain, artisan, jobId)).toEqual([]);
  });

  test("after a Cancellation is refunded whole, and the Cancellation ended the Updated Quote", async () => {
    const { domain, given, payments } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    const updatedQuoteId = await proposed(domain, artisan, engagementId, {
      labour: "1800",
      materials: "500",
    });
    const collectionId = await checkout(domain, client, updatedQuoteId);
    const cancelled = await domain.engagements.cancel(client.actor, { engagementId });
    if (!cancelled.ok) throw new Error(cancelled.refusal.message);
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.updatedQuote).toBeNull();

    await receive(domain, await payments.succeedCollection(collectionId));

    expect(refundsAsked(payments).map((each) => [each.collectionId, each.amountCents])).toEqual([
      [expect.any(String), 200_000],
      [collectionId, 31_500],
    ]);
  });

  test("after another Payment accepted it is refunded whole", async () => {
    const { domain, given, payments } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    const updatedQuoteId = await proposed(domain, artisan, engagementId, {
      labour: "1800",
      materials: "500",
    });
    const first = await checkout(domain, client, updatedQuoteId);
    const second = await checkout(domain, client, updatedQuoteId);

    await receive(domain, await payments.succeedCollection(first));
    await receive(domain, await payments.succeedCollection(second));

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.money).toMatchObject({
      paidInCents: 230_000,
    });
    expect(refundsAsked(payments)).toEqual([
      expect.objectContaining({ collectionId: second, amountCents: 31_500 }),
    ]);
  });
});

describe("the money an Updated Quote paid in", () => {
  test("is refunded from each Payment's collection, the Hire's first", async () => {
    const { domain, given, payments } = await createHarness();
    const { client, artisan, jobId, engagementId, collectionId } = await hiredJob(given);
    const extra = await accepted(domain, given, client, artisan, engagementId, {
      labour: "1800",
      materials: "500",
    });

    const made = await domain.engagements.refund(artisan.actor, { engagementId, labour: "1700" });

    expect(made).toEqual({
      ok: true,
      value: { refundIds: [expect.any(String), expect.any(String)] },
    });
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      money: { refundedCents: 170_000, unreleasedCents: 60_000 },
      refunds: [
        { amountCents: 150_000, labourCents: 150_000, state: "on-its-way" },
        { amountCents: 20_000, labourCents: 20_000, state: "on-its-way" },
      ],
    });
    expect(refundsAsked(payments)).toEqual([
      expect.objectContaining({ collectionId, amountCents: 150_000 }),
      expect.objectContaining({ collectionId: extra, amountCents: 20_000 }),
    ]);
    // One action, one row in the Conversation.
    expect(
      (await rows(domain, client, jobId)).filter(
        (row) => row.kind === "event" && row.event === "refund",
      ),
    ).toEqual([expect.objectContaining({ text: formatRands(170_000) })]);
  });

  test("is refunded with the rest at a Cancellation before Work started", async () => {
    const { domain, given, payments } = await createHarness();
    const { client, artisan, jobId, engagementId, collectionId } = await hiredJob(given);
    const extra = await accepted(domain, given, client, artisan, engagementId, {
      labour: "1800",
      materials: "650",
    });

    const cancelled = await domain.engagements.cancel(artisan.actor, { engagementId });
    if (!cancelled.ok) throw new Error(cancelled.refusal.message);

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.money).toMatchObject({
      refundedCents: 245_000,
      unreleasedCents: 0,
      protectionFeeCents: 12_250,
    });
    expect(refundsAsked(payments)).toEqual([
      expect.objectContaining({ collectionId, amountCents: 200_000 }),
      expect.objectContaining({ collectionId: extra, amountCents: 45_000 }),
    ]);
  });

  test("its Labour is refunded 72 hours after a Cancellation after Work started; its Materials stay", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const { client, artisan, jobId, engagementId, collectionId } = await hiredJob(given);
    await given.workStarted(client, engagementId);
    const extra = await accepted(domain, given, client, artisan, engagementId, {
      labour: "1800",
      materials: "650",
    });
    const cancelled = await domain.engagements.cancel(client.actor, { engagementId });
    if (!cancelled.ok) throw new Error(cancelled.refusal.message);

    clock.advance({ hours: 72 });
    await domain.system.runDueClocks();

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.money).toMatchObject({
      releasedCents: 65_000,
      refundedCents: 180_000,
      unreleasedCents: 0,
    });
    expect(refundsAsked(payments)).toEqual([
      expect.objectContaining({ collectionId, amountCents: 150_000 }),
      expect.objectContaining({ collectionId: extra, amountCents: 30_000 }),
    ]);
  });
});

/** A Job Hired from the Artisan's Quote: R1 500 of Labour and R500 of Materials unless given. */
async function hiredJob(
  given: Harness["given"],
  fields: Parameters<Harness["given"]["sentQuote"]>[2] = {},
) {
  const client = await given.client();
  const artisan = await given.matchableArtisan({ name: "Sipho Dlamini" });
  const jobId = await given.openJob(client);
  const quoteId = await given.sentQuote(artisan, jobId, { startOn: "2026-10-05", ...fields });
  const collectionId = await given.hired(client, quoteId);
  const engagementId = await given.engagementOf(client, jobId);
  return { client, artisan, jobId, quoteId, engagementId, collectionId };
}

async function proposed(
  domain: Harness["domain"],
  artisan: { actor: Actor },
  engagementId: string,
  amounts: { labour: string; materials: string },
) {
  const made = await domain.engagements.proposeUpdatedQuote(artisan.actor, {
    engagementId,
    ...amounts,
  });
  if (!made.ok) throw new Error(made.refusal.message);
  return made.value.updatedQuoteId;
}

async function withdrawn(
  domain: Harness["domain"],
  artisan: { actor: Actor },
  updatedQuoteId: string,
) {
  const made = await domain.engagements.withdrawUpdatedQuote(artisan.actor, { updatedQuoteId });
  if (!made.ok) throw new Error(made.refusal.message);
}

/** The Client opens a checkout for the Updated Quote, acknowledging the fee: its collection's id. */
async function checkout(
  domain: Harness["domain"],
  client: { actor: Actor },
  updatedQuoteId: string,
) {
  const opened = await domain.engagements.acceptUpdatedQuote(client.actor, {
    updatedQuoteId,
    feeAcknowledged: true,
  });
  if (!opened.ok) throw new Error(opened.refusal.message);
  return collectionOf(opened.value.checkoutUrl);
}

/** The Artisan proposes, and the Client pays the difference: its collection's id. */
async function accepted(
  domain: Harness["domain"],
  given: Harness["given"],
  client: { actor: Actor },
  artisan: { actor: Actor },
  engagementId: string,
  amounts: { labour: string; materials: string },
) {
  const collectionId = await checkout(
    domain,
    client,
    await proposed(domain, artisan, engagementId, amounts),
  );
  await given.paid(collectionId);
  return collectionId;
}

async function refunded(
  domain: Harness["domain"],
  artisan: { actor: Actor },
  engagementId: string,
  amounts: { materials?: string; labour?: string },
) {
  const made = await domain.engagements.refund(artisan.actor, { engagementId, ...amounts });
  if (!made.ok) throw new Error(made.refusal.message);
}

async function receive(domain: Harness["domain"], webhook: Webhook) {
  const received = await domain.system.receivePaymentEvent(webhook);
  if (!received.ok) throw new Error(received.refusal.message);
}

/** Every Refund the payment adapter was asked for, oldest first. */
function refundsAsked(payments: FakePayments): CreateRefund[] {
  return payments.calls
    .filter((call) => call.operation === "refund")
    .map((call) => call.input as CreateRefund);
}

/** What the Account was told of the Job since it was Hired, newest first. */
async function toldOf(domain: Harness["domain"], account: { actor: Actor }, jobId: string) {
  const notices = await domain.notices.list(account.actor);
  return notices.filter(
    (notice) =>
      notice.link === `/jobs/${jobId}` &&
      ![
        "job.matched",
        "job.invited",
        "quote.sent",
        "engagement.hired",
        "engagement.work-started",
      ].includes(notice.event),
  );
}

/** The rows of the Job's one Conversation, as the party sees it. */
async function rows(domain: Harness["domain"], party: { actor: Actor }, jobId: string) {
  const [conversation] = (await domain.conversations.forJob(party.actor, { jobId }))!;
  return (await domain.conversations.view(party.actor, {
    conversationId: conversation!.conversationId,
  }))!.items;
}

/** The Engagement's ledger rows whose kind starts so, oldest first. */
async function ledger(engagementId: string, kind: string) {
  const { results } = await env.DB.prepare(
    "SELECT kind, amount_cents FROM ledger_entries WHERE engagement_id = ? AND kind LIKE ? ORDER BY recorded_at, rowid",
  )
    .bind(engagementId, `${kind}%`)
    .all<{ kind: string; amount_cents: number }>();
  return results;
}
