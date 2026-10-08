import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import type { Actor } from "@/domain/actor";
import { formatRands } from "@/domain/money";
import type { CreateRefund, Webhook } from "@/domain/ports";
import type { FakePayments } from "@/domain/fakes/payments";
import { createHarness, type Harness } from "../support/harness";

// Refunds by the Artisan (#132, ADR 0008): the Artisan may refund any
// unreleased amount at any time, naming an amount per unreleased line,
// without the Client's agreement. A Refund never includes the Protection Fee.
// If the bank cannot take it, it stays owed and the Admin pays it by hand.

describe("the Artisan refunds", () => {
  test("part of the Labour: the money shows it refunded, and the adapter is asked by our id", async () => {
    const { domain, given, payments } = await createHarness();
    const { client, artisan, jobId, engagementId, collectionId } = await hiredJob(given);

    expect(await domain.engagements.refund(artisan.actor, { engagementId, labour: "400" })).toEqual(
      { ok: true, value: { refundIds: [expect.any(String)] } },
    );

    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.money).toMatchObject({
      paidInCents: 200_000,
      releasedCents: 0,
      refundedCents: 40_000,
      unreleasedCents: 160_000,
      protectionFeeCents: 10_000,
    });
    expect(refundsAsked(payments)).toEqual([
      {
        id: expect.any(String),
        collectionId,
        amountCents: 40_000,
        reason: "Refund by the Artisan",
      },
    ]);
  });
});

describe("a Refund by the Artisan", () => {
  test("shows in the Conversation as a row that is not speech, with its amount", async () => {
    const { domain, given, clock } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    clock.advance({ hours: 2 });

    await refunded(domain, artisan, engagementId, { materials: "100", labour: "250.50" });

    for (const party of [client, artisan]) {
      expect(await lastRow(domain, party, jobId)).toEqual({
        kind: "event",
        event: "refund",
        text: formatRands(35_050),
        at: clock.now(),
      });
    }
  });

  test("names an amount per unreleased line, up to what is unreleased", async () => {
    const { domain, given } = await createHarness();
    const { artisan, engagementId } = await hiredJob(given);

    expect(
      await domain.engagements.refund(artisan.actor, { engagementId, labour: "1500.01" }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "more-than-unreleased",
        message: `You can refund at most ${formatRands(150_000)} of the Labour.`,
      },
    });
    expect(
      await domain.engagements.refund(artisan.actor, { engagementId, materials: "", labour: "" }),
    ).toEqual({ ok: false, refusal: { reason: "invalid", message: "Name an amount to refund." } });
    expect(
      await domain.engagements.refund(artisan.actor, { engagementId, labour: "-5" }),
    ).toMatchObject({ ok: false, refusal: { reason: "invalid" } });

    await refunded(domain, artisan, engagementId, { materials: "500", labour: "1500" });
    expect(await domain.engagements.refund(artisan.actor, { engagementId, labour: "1" })).toEqual({
      ok: false,
      refusal: {
        reason: "nothing-unreleased",
        message: "Nothing is unreleased on this Job, so nothing can be refunded.",
      },
    });
  });

  test("of the Materials is only before Work started, when they are released", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await given.workStarted(client, engagementId);

    expect(
      await domain.engagements.refund(artisan.actor, { engagementId, materials: "100" }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "more-than-unreleased",
        message: "None of the Materials is unreleased, so none of it can be refunded.",
      },
    });
    await refunded(domain, artisan, engagementId, { labour: "100" });
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.money).toMatchObject({
      releasedCents: 50_000,
      refundedCents: 10_000,
      unreleasedCents: 140_000,
    });
  });

  test("of all the Materials leaves nothing to release at Work started", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await refunded(domain, artisan, engagementId, { materials: "500" });

    await given.workStarted(client, engagementId);

    expect(await moneyRows(engagementId, "release.")).toEqual([]);
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.money).toMatchObject({
      releasedCents: 0,
      refundedCents: 50_000,
      payments: [
        { part: "materials", amountCents: 50_000, unreleasedCents: 0, state: "refunded" },
        { part: "labour", amountCents: 150_000, unreleasedCents: 150_000, state: "unreleased" },
      ],
    });
  });

  test("is only the Hired Artisan's to make", async () => {
    const { domain, given } = await createHarness();
    const { client, engagementId } = await hiredJob(given);
    const other = await given.verifiedArtisan();
    const notFound = {
      ok: false,
      refusal: { reason: "not-found", message: "That Engagement does not exist." },
    };

    for (const actor of [client.actor, other.actor, { kind: "visitor" } as const]) {
      expect(await domain.engagements.refund(actor, { engagementId, labour: "100" })).toEqual(
        notFound,
      );
    }
  });

  test("never has an Artisan Fee taken: only what is released does", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await hiredJob(given);
    await given.workStarted(client, engagementId);
    await refunded(domain, artisan, engagementId, { labour: "400" });
    await given.markedComplete(artisan, engagementId);

    await domain.engagements.approve(client.actor, { engagementId });

    // R1 100 of Labour released at 10%, and R400 refunded with no fee.
    expect(await moneyRows(engagementId, "release.labour")).toEqual([
      { kind: "release.labour", amount_cents: 110_000 },
    ]);
    expect(await moneyRows(engagementId, "release.artisan-fee")).toEqual([
      { kind: "release.artisan-fee", amount_cents: 5_000 },
      { kind: "release.artisan-fee", amount_cents: 11_000 },
    ]);
    expect(await moneyRows(engagementId, "refund.labour")).toEqual([
      { kind: "refund.labour", amount_cents: 40_000 },
    ]);
  });

  test("and the Labour's Release at once never take the same money", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await given.workStarted(client, engagementId);
    await given.markedComplete(artisan, engagementId);

    const [approved, refund] = await Promise.all([
      domain.engagements.approve(client.actor, { engagementId }),
      domain.engagements.refund(artisan.actor, { engagementId, labour: "1500" }),
    ]);

    expect(approved).toEqual({ ok: true, value: null });
    const money = (await domain.jobs.view(client.actor, { jobId }))?.engagement?.money;
    expect(money).toMatchObject({ unreleasedCents: 0 });
    expect(money!.releasedCents + money!.refundedCents).toBe(200_000);
    if (refund.ok) {
      expect(money).toMatchObject({ releasedCents: 50_000, refundedCents: 150_000 });
    } else {
      expect(refund.refusal.reason).toBe("nothing-unreleased");
    }
  });

  test("on a Completed Engagement is refused: nothing is unreleased", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, engagementId } = await hiredJob(given);
    await given.workStarted(client, engagementId);
    await given.markedComplete(artisan, engagementId);
    await domain.engagements.approve(client.actor, { engagementId });

    expect(
      await domain.engagements.refund(artisan.actor, { engagementId, labour: "1" }),
    ).toMatchObject({ ok: false, refusal: { reason: "nothing-unreleased" } });
  });

  test("the adapter does not take at once is sent by the every-minute run", async () => {
    const { domain, given, payments } = await createHarness();
    const { artisan, engagementId } = await hiredJob(given);
    const refund = payments.refund;
    payments.refund = () => Promise.reject(new Error("The provider is down"));
    expect(
      await domain.engagements.refund(artisan.actor, { engagementId, labour: "100" }),
    ).toMatchObject({ ok: true });
    payments.refund = refund;

    await domain.system.runDueClocks();

    expect(refundsAsked(payments)).toEqual([expect.objectContaining({ amountCents: 10_000 })]);
    await domain.system.runDueClocks();
    expect(refundsAsked(payments)).toHaveLength(1);
  });

  test("goes to the adapter one at a time per Payment: the next once the last is answered", async () => {
    const { domain, given, payments } = await createHarness();
    const { artisan, engagementId } = await hiredJob(given);
    await refunded(domain, artisan, engagementId, { labour: "100" });
    await refunded(domain, artisan, engagementId, { labour: "200" });
    await refunded(domain, artisan, engagementId, { materials: "300" });

    const [first] = refundsAsked(payments);
    expect(refundsAsked(payments)).toEqual([expect.objectContaining({ amountCents: 10_000 })]);

    await receive(domain, await payments.succeedRefund(first!.id));
    const [, second] = refundsAsked(payments);
    expect(refundsAsked(payments)).toHaveLength(2);
    expect(second).toMatchObject({ amountCents: 20_000 });

    await receive(domain, await payments.failRefund(second!.id));
    expect(refundsAsked(payments)).toHaveLength(3);
    expect(refundsAsked(payments)[2]).toMatchObject({ amountCents: 30_000 });
  });
});

describe("a Refund paid by the bank", () => {
  test("tells the Client, with a Receipt that does not refund the Protection Fee", async () => {
    const { domain, given, payments, mailer } = await createHarness();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await refunded(domain, artisan, engagementId, { materials: "200", labour: "300" });
    const [refund] = refundsAsked(payments);
    expect(await refundNotices(domain, client.actor)).toEqual([]);

    await receive(domain, await payments.succeedRefund(refund!.id));

    const title = `Your Refund of ${formatRands(50_000)} was paid: Paint the lounge`;
    expect(await refundNotices(domain, client.actor)).toEqual([
      expect.objectContaining({ event: "refund.paid", title, link: `/jobs/${jobId}` }),
    ]);
    const receipt = mailer.sentTo(client.email).at(-1);
    expect(receipt?.subject).toBe(title);
    expect(receipt?.text).toContain("Receipt for your Refund on ArtisanConnect.");
    expect(receipt?.text).toContain(`Materials refunded: ${formatRands(20_000)}`);
    expect(receipt?.text).toContain(`Labour refunded: ${formatRands(30_000)}`);
    expect(receipt?.text).toContain(`Total refunded: ${formatRands(50_000)}`);
    expect(receipt?.text).toContain("The Protection Fee is not refunded.");
    expect(receipt?.text).toContain("This Receipt is not a tax invoice.");
    expect(await refundNotices(domain, artisan.actor)).toEqual([]);
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.refunds).toEqual([
      {
        refundId: refund!.id,
        amountCents: 50_000,
        materialsCents: 20_000,
        labourCents: 30_000,
        madeAt: expect.any(Date),
        state: "paid",
      },
    ]);
  });

  test("is paid once, however often its event comes", async () => {
    const { domain, given, payments } = await createHarness();
    const { client, artisan, engagementId } = await hiredJob(given);
    await refunded(domain, artisan, engagementId, { labour: "300" });
    const webhook = await payments.succeedRefund(refundsAsked(payments)[0]!.id);

    await receive(domain, webhook);
    await receive(domain, webhook);

    expect(await refundNotices(domain, client.actor)).toHaveLength(1);
    expect(await moneyRows(engagementId, "refund.paid")).toEqual([
      { kind: "refund.paid", amount_cents: 30_000 },
    ]);
  });

  test("whose sending the adapter took though its answer was lost is recorded sent and paid", async () => {
    const { domain, given, payments } = await createHarness();
    const { artisan, engagementId } = await hiredJob(given);
    const refund = payments.refund;
    payments.refund = async (input) => {
      await refund(input);
      throw new Error("The answer was lost");
    };
    await refunded(domain, artisan, engagementId, { labour: "300" });
    payments.refund = refund;

    await receive(domain, await payments.succeedRefund(refundsAsked(payments)[0]!.id));

    expect(await moneyRows(engagementId, "refund.")).toEqual([
      { kind: "refund.labour", amount_cents: 30_000 },
      { kind: "refund.owed", amount_cents: 30_000 },
      { kind: "refund.sent", amount_cents: 30_000 },
      { kind: "refund.paid", amount_cents: 30_000 },
    ]);
  });

  test("of a Payment that Hired nobody sends a Receipt for the whole of it", async () => {
    const { domain, given, payments, mailer } = await createHarness();
    const client = await given.client();
    const artisan = await given.matchableArtisan();
    const jobId = await given.openJob(client);
    const quoteId = await given.sentQuote(artisan, jobId);
    const collectionId = await given.checkout(client, quoteId);
    await domain.quotes.withdraw(artisan.actor, { jobId });
    await given.paid(collectionId);

    await receive(domain, await payments.succeedRefund(refundsAsked(payments)[0]!.id));

    expect(await refundNotices(domain, client.actor)).toEqual([
      expect.objectContaining({
        title: `Your Refund of ${formatRands(210_000)} was paid: Paint the lounge`,
      }),
    ]);
    const receipt = mailer.sentTo(client.email).at(-1)?.text;
    expect(receipt).toContain("Your whole Payment, Protection Fee included, as no Hire happened:");
    expect(receipt).toContain(`Protection Fee: ${formatRands(10_000)}`);
    expect(receipt).toContain(`Total refunded: ${formatRands(210_000)}`);
    expect((await domain.jobs.view(client.actor, { jobId }))?.notHired).toEqual([
      expect.objectContaining({ amountCents: 210_000, refund: "paid" }),
    ]);
  });
});

describe("a Refund the bank cannot take", () => {
  test("stays owed to the Client, tells them, and raises a Support request; nothing is retried", async () => {
    const { domain, given, payments } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await refunded(domain, artisan, engagementId, { labour: "300" });

    await receive(domain, await payments.failRefund(refundsAsked(payments)[0]!.id));
    await domain.system.runDueClocks();

    expect(refundsAsked(payments)).toHaveLength(1);
    expect(await refundNotices(domain, client.actor)).toEqual([
      expect.objectContaining({
        event: "refund.failed",
        title: `Your bank could not take your Refund of ${formatRands(30_000)}. It is still owed to you, and we will pay it by bank transfer: Paint the lounge`,
      }),
    ]);
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement).toMatchObject({
      money: { refundedCents: 30_000 },
      refunds: [{ amountCents: 30_000, state: "owed" }],
    });
    expect(await owedToClient(engagementId)).toBe(30_000);
    const [item] = (await domain.queues.home(admin.actor, { queue: "support" }))!.items;
    expect(item).toMatchObject({
      title: `Failed Refund: a Refund of ${formatRands(30_000)} to Thandi Mokoena`,
    });
    expect((await domain.queues.item(admin.actor, { itemId: item!.id }))?.decisions).toEqual([
      expect.objectContaining({ key: "paid-by-hand", reasonLabel: "Bank transfer reference" }),
    ]);
  });

  test("is paid by the Admin's bank transfer, recorded in the ledger, with a Receipt", async () => {
    const { domain, given, payments, mailer, clock } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, jobId, engagementId } = await hiredJob(given);
    await refunded(domain, artisan, engagementId, { labour: "300" });
    await receive(domain, await payments.failRefund(refundsAsked(payments)[0]!.id));
    const [item] = (await domain.queues.home(admin.actor, { queue: "support" }))!.items;
    clock.advance({ days: 1 });

    expect(
      await domain.queues.decide(admin.actor, {
        itemId: item!.id,
        decision: "paid-by-hand",
        reason: "EFT 4471 from FNB",
      }),
    ).toMatchObject({ ok: true });

    expect(await owedToClient(engagementId)).toBe(0);
    expect(await moneyRows(engagementId, "refund.paid-by-hand")).toEqual([
      { kind: "refund.paid-by-hand", amount_cents: 30_000 },
    ]);
    const title = `Your Refund of ${formatRands(30_000)} was paid by bank transfer: Paint the lounge`;
    expect((await refundNotices(domain, client.actor))[0]).toMatchObject({ title });
    const receipt = mailer.sentTo(client.email).at(-1);
    expect(receipt?.subject).toBe(title);
    expect(receipt?.text).toContain("Paid by bank transfer, reference EFT 4471 from FNB");
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.refunds).toMatchObject([
      { state: "paid" },
    ]);
    expect(
      await domain.queues.decide(admin.actor, {
        itemId: item!.id,
        decision: "paid-by-hand",
        reason: "Again",
      }),
    ).toMatchObject({ ok: false });
  });

  test("needs the transfer's reference to be recorded", async () => {
    const { domain, given, payments } = await createHarness();
    const admin = await given.admin();
    const { artisan, engagementId } = await hiredJob(given);
    await refunded(domain, artisan, engagementId, { labour: "300" });
    await receive(domain, await payments.failRefund(refundsAsked(payments)[0]!.id));
    const [item] = (await domain.queues.home(admin.actor, { queue: "support" }))!.items;

    expect(
      await domain.queues.decide(admin.actor, { itemId: item!.id, decision: "paid-by-hand" }),
    ).toMatchObject({ ok: false });
    expect(
      await domain.queues.decide(admin.actor, { itemId: item!.id, decision: "resolve" }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-allowed" } });
    expect(await owedToClient(engagementId)).toBe(30_000);
  });
});

describe("a paused Refund", () => {
  test("stays unpaid with no Tell; after 3 days the Client is told it is delayed, not lost, and a Support request is raised", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, engagementId } = await hiredJob(given);
    await refunded(domain, artisan, engagementId, { labour: "300" });
    const [refund] = refundsAsked(payments);

    await receive(domain, await payments.pauseRefund(refund!.id));
    clock.advance({ days: 3, minutes: -1 });
    await domain.system.runDueClocks();
    expect(await refundNotices(domain, client.actor)).toEqual([]);

    clock.advance({ minutes: 1 });
    await domain.system.runDueClocks();
    expect(await refundNotices(domain, client.actor)).toEqual([
      expect.objectContaining({
        event: "refund.delayed",
        title: `Your Refund of ${formatRands(30_000)} is delayed, not lost: Paint the lounge`,
      }),
    ]);
    expect((await domain.queues.home(admin.actor, { queue: "support" }))?.items).toMatchObject([
      { title: `Paused money: a Refund of ${formatRands(30_000)} to Thandi Mokoena` },
    ]);

    // Once the float is topped up, it is paid as any other.
    clock.advance({ hours: 1 });
    await receive(domain, await payments.succeedRefund(refund!.id));
    expect((await refundNotices(domain, client.actor))[0]).toMatchObject({ event: "refund.paid" });
  });

  test("paid within 3 days raises nothing", async () => {
    const { domain, given, payments, clock } = await createHarness();
    const admin = await given.admin();
    const { client, artisan, engagementId } = await hiredJob(given);
    await refunded(domain, artisan, engagementId, { labour: "300" });
    const [refund] = refundsAsked(payments);
    await receive(domain, await payments.pauseRefund(refund!.id));
    clock.advance({ days: 1 });
    await receive(domain, await payments.succeedRefund(refund!.id));

    clock.advance({ days: 3 });
    await domain.system.runDueClocks();

    expect((await refundNotices(domain, client.actor)).map((n) => n.event)).toEqual([
      "refund.paid",
    ]);
    expect((await domain.queues.home(admin.actor, { queue: "support" }))?.items).toEqual([]);
  });

  test("holds back the Payment's next Refund until it is answered", async () => {
    const { domain, given, payments } = await createHarness();
    const { artisan, engagementId } = await hiredJob(given);
    await refunded(domain, artisan, engagementId, { labour: "100" });
    await receive(domain, await payments.pauseRefund(refundsAsked(payments)[0]!.id));

    await refunded(domain, artisan, engagementId, { labour: "200" });
    await domain.system.runDueClocks();

    expect(refundsAsked(payments)).toHaveLength(1);
  });
});

/** A Painting Job Hired from a Quote of R1 500 Labour and R500 Materials. */
async function hiredJob(given: Harness["given"]) {
  const client = await given.client();
  const artisan = await given.matchableArtisan();
  const jobId = await given.openJob(client);
  const quoteId = await given.sentQuote(artisan, jobId, { startOn: "2026-10-05" });
  const collectionId = await given.hired(client, quoteId);
  const engagementId = await given.engagementOf(client, jobId);
  return { client, artisan, jobId, quoteId, engagementId, collectionId };
}

/** Every Refund the payment adapter was asked for, oldest first. */
function refundsAsked(payments: FakePayments): CreateRefund[] {
  return payments.calls
    .filter((call) => call.operation === "refund")
    .map((call) => call.input as CreateRefund);
}

/** The Artisan refunds amounts of the Engagement's lines, in rands. */
async function refunded(
  domain: Harness["domain"],
  artisan: { actor: Actor },
  engagementId: string,
  amounts: { materials?: string; labour?: string },
) {
  const made = await domain.engagements.refund(artisan.actor, { engagementId, ...amounts });
  if (!made.ok) throw new Error(made.refusal.message);
  return made.value.refundIds[0]!;
}

async function receive(domain: Harness["domain"], webhook: Webhook) {
  const received = await domain.system.receivePaymentEvent(webhook);
  if (!received.ok) throw new Error(received.refusal.message);
}

/** The newest row of the Job's one Conversation, as the party sees it. */
async function lastRow(domain: Harness["domain"], party: { actor: Actor }, jobId: string) {
  const [conversation] = (await domain.conversations.forJob(party.actor, { jobId }))!;
  return (
    await domain.conversations.view(party.actor, { conversationId: conversation!.conversationId })
  )?.items.at(-1);
}

/** The Engagement's ledger rows whose kind starts so, oldest first. */
async function moneyRows(engagementId: string, kind: string) {
  const { results } = await env.DB.prepare(
    "SELECT kind, amount_cents FROM ledger_entries WHERE engagement_id = ? AND kind LIKE ? ORDER BY recorded_at, rowid",
  )
    .bind(engagementId, `${kind}%`)
    .all<{ kind: string; amount_cents: number }>();
  return results;
}

/** What the Account was told of Refunds, newest first. */
async function refundNotices(domain: Harness["domain"], actor: Actor) {
  return (await domain.notices.list(actor)).filter((notice) => notice.event.startsWith("refund."));
}

/** What the Engagement's Refunds still owe the Client, from the ledger. */
async function owedToClient(engagementId: string) {
  const row = await env.DB.prepare(
    `SELECT coalesce(sum(CASE kind WHEN 'refund.owed' THEN amount_cents
       WHEN 'refund.paid' THEN -amount_cents WHEN 'refund.paid-by-hand' THEN -amount_cents
       ELSE 0 END), 0) AS cents FROM ledger_entries WHERE engagement_id = ?`,
  )
    .bind(engagementId)
    .first<{ cents: number }>();
  return row?.cents;
}
