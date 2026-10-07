import { describe, expect, test } from "vitest";
import type { Actor, AdminActor } from "@/domain/actor";
import { createHarness, type Harness } from "../support/harness";
import { formatRands } from "@/domain/money";
import { collectionOf } from "../support/given";

// Hire by Payment (#126, ADR 0004): the Client Hires a Sent Quote by paying
// the Quote plus the 5% Protection Fee through the adapter's checkout. Only
// the collection's event Hires, and the Hire is asked again when it arrives:
// if it can no longer happen, the whole Payment is refunded.

describe("hiring a Sent Quote", () => {
  test("opens a checkout for the Quote plus the Protection Fee, by card or Instant EFT, and changes nothing yet", async () => {
    const { domain, given, payments } = await createHarness();
    const { client, artisan, jobId, quoteId } = await quoted(given);

    const opened = await domain.engagements.hire(client.actor, { quoteId, feeAcknowledged: true });

    expect(opened).toEqual({ ok: true, value: { checkoutUrl: expect.any(String) } });
    const collectionId = collectionOf(opened.ok ? opened.value.checkoutUrl : "");
    expect(checkoutsOpened(payments)).toEqual([
      {
        operation: "createCollection",
        input: expect.objectContaining({
          id: collectionId,
          amountCents: 210_000,
          methods: ["card", "pay_by_bank"],
          returnUrl: `https://artisanconnect.test/jobs/${jobId}`,
        }),
      },
    ]);
    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      state: "open",
      engagement: null,
    });
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({ state: "sent" }),
    ]);
    expect(await toldOf(domain, artisan, jobId)).toEqual([]);
  });

  test("needs the Client to acknowledge that the Protection Fee is not refunded", async () => {
    const { domain, given, payments } = await createHarness();
    const { client, quoteId } = await quoted(given);

    expect(
      await domain.engagements.hire(client.actor, { quoteId, feeAcknowledged: false }),
    ).toEqual({
      ok: false,
      refusal: {
        reason: "fee-not-acknowledged",
        message: "Tick that the Protection Fee is not refunded, to pay for this Quote.",
      },
    });
    expect(checkoutsOpened(payments)).toEqual([]);
  });

  test("is the Job's Client's only", async () => {
    const { domain, given } = await createHarness();
    const { artisan, quoteId } = await quoted(given);
    const stranger = await given.client();

    for (const actor of [stranger.actor, artisan.actor, { kind: "visitor" } as Actor]) {
      expect(
        await domain.engagements.hire(actor, { quoteId, feeAcknowledged: true }),
      ).toMatchObject({ ok: false, refusal: { reason: "not-found" } });
    }
  });

  test("only of a Sent Quote", async () => {
    const { domain, given } = await createHarness();
    const { client, quoteId } = await quoted(given);
    await domain.quotes.decline(client.actor, { quoteId });

    expect(await domain.engagements.hire(client.actor, { quoteId, feeAcknowledged: true })).toEqual(
      {
        ok: false,
        refusal: { reason: "not-sent", message: "Only a Sent Quote can be Hired." },
      },
    );
  });

  test("not of an Artisan no longer verified for the Job's trade", async () => {
    const harness = await createHarness();
    const { client, quoteId } = await quoted(harness.given);
    await removeBadge(harness, "Work photos, Painting");

    expect(
      await harness.domain.engagements.hire(client.actor, { quoteId, feeAcknowledged: true }),
    ).toMatchObject({ ok: false, refusal: { reason: "not-verified" } });
    expect(checkoutsOpened(harness.payments)).toEqual([]);
  });

  test("works on an Expired Job with a Quote still Sent, without a Renew", async () => {
    const { domain, given, clock } = await createHarness();
    const client = await given.client();
    const artisan = await given.matchableArtisan();
    const jobId = await given.openJob(client);
    clock.advance({ hours: 1 });
    const quoteId = await given.sentQuote(artisan, jobId);
    clock.advance({ days: 14, minutes: -30 });
    await domain.system.runDueClocks();
    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ state: "expired" });

    await given.hired(client, quoteId);

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      state: "hired",
      engagement: expect.objectContaining({ state: "paid" }),
    });
  });
});

describe("when the Payment arrives", () => {
  test("the Quote is Hired: the Engagement is Paid, the Job Hired, and the Artisan told", async () => {
    const { domain, given, clock, mailer } = await createHarness();
    const { client, artisan, jobId, quoteId } = await quoted(given);
    const sentAt = clock.now();
    clock.advance({ hours: 2 });

    await given.hired(client, quoteId);

    const job = await domain.jobs.view(client.actor, { jobId });
    expect(job).toMatchObject({ state: "hired", takesQuotes: false });
    expect(job?.engagement).toMatchObject({
      state: "paid",
      hiredAt: clock.now(),
      startOn: "2026-11-02",
      durationDays: 3,
      warranty: "Twelve months on peeling.",
      artisan: {
        artisanId: artisan.actor.accountId,
        publicName: "Sipho Dlamini",
        badges: [
          expect.objectContaining({ name: "Identity verified" }),
          expect.objectContaining({ name: "Work photos, Painting" }),
        ],
      },
      quote: expect.objectContaining({ quoteId, totalCents: 200_000 }),
      activity: [
        { event: "quote.sent", at: sentAt },
        { event: "hired", at: clock.now() },
      ],
    });
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({ quoteId, state: "hired" }),
    ]);
    expect(await toldOf(domain, artisan, jobId)).toEqual([
      expect.objectContaining({
        event: "engagement.hired",
        title: "You were Hired: Paint the lounge",
      }),
    ]);
    expect(mailer.sentTo(artisan.email).at(-1)).toMatchObject({
      subject: "You were Hired: Paint the lounge",
    });
    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.quote).toMatchObject({
      state: "hired",
    });
  });

  test("writes the Payment and the Protection Fee to the ledger, nothing released", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, quoteId } = await quoted(given);

    await given.hired(client, quoteId);

    const money = {
      paidInCents: 200_000,
      releasedCents: 0,
      unreleasedCents: 200_000,
      refundedCents: 0,
      payments: [
        { part: "materials", amountCents: 50_000, state: "unreleased" },
        { part: "labour", amountCents: 150_000, state: "unreleased" },
      ],
    };
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.money).toEqual({
      ...money,
      protectionFeeCents: 10_000,
    });
    expect((await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement?.money).toEqual({
      ...money,
      artisanFeePercent: 10,
    });
  });

  test("the Client never sees the Artisan Fee, and the Artisan never sees the Protection Fee", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, quoteId } = await quoted(given);

    await given.hired(client, quoteId);

    const asClient = JSON.stringify(await domain.jobs.view(client.actor, { jobId }));
    const asArtisan = JSON.stringify(await domain.jobs.viewAsArtisan(artisan.actor, { jobId }));
    expect(asClient).not.toMatch(/artisanFee/i);
    expect(asArtisan).not.toMatch(/protectionFee/i);
  });

  test("the Artisan Fee is 10% in a Client Relationship with no Completed Engagement, fixed at Hire", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, quoteId } = await quoted(given);

    await given.hired(client, quoteId);

    expect(
      (await domain.jobs.viewAsArtisan(artisan.actor, { jobId }))?.engagement?.money,
    ).toMatchObject({ artisanFeePercent: 10 });
  });

  test("the Artisan sees the suburb and street, which no Artisan saw before", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, quoteId } = await quoted(given);
    const before = await domain.jobs.viewAsArtisan(artisan.actor, { jobId });
    expect(before).toMatchObject({ address: null, region: { name: "Table Bay" } });
    expect(JSON.stringify(before)).not.toMatch(/Main Road|SEA POINT/);

    await given.hired(client, quoteId);

    expect(await domain.jobs.viewAsArtisan(artisan.actor, { jobId })).toMatchObject({
      address: { suburb: "SEA POINT", street: "12 Main Road" },
    });
  });

  test("the other Sent Quotes are Declined and their Artisans told; Held ones are never Sent", async () => {
    const harness = await createHarness();
    const { domain, given, contentReader } = harness;
    const { client, jobId, quoteId } = await quoted(given);
    const other = await given.matchableArtisan({ name: "Ayanda Khumalo" });
    const held = await given.matchableArtisan({ name: "Lerato Nkosi" });
    await domain.invitations.invite(client.actor, { jobId, artisanId: other.actor.accountId });
    await domain.invitations.invite(client.actor, { jobId, artisanId: held.actor.accountId });
    const otherQuoteId = await given.sentQuote(other, jobId);
    contentReader.force({ kind: "unsure", reason: "It may name a social handle." });
    await given.sentQuote(held, jobId).catch(() => {});
    contentReader.force({ kind: "clear" });

    await given.hired(client, quoteId);

    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({ quoteId, state: "hired" }),
      expect.objectContaining({ quoteId: otherQuoteId, state: "declined" }),
    ]);
    expect(await toldOf(domain, other, jobId)).toEqual([
      expect.objectContaining({ title: "Your Quote was declined: Paint the lounge" }),
    ]);
    expect((await domain.jobs.viewAsArtisan(held.actor, { jobId }))?.quote).toBeNull();
    const admin = await given.admin();
    expect((await domain.queues.home(admin.actor, { queue: "pre-checks" }))?.items).toEqual([]);
  });

  test("only the Hired Quote's Conversation takes messages", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, quoteId } = await quoted(given);
    const other = await given.matchableArtisan({ name: "Ayanda Khumalo" });
    await domain.invitations.invite(client.actor, { jobId, artisanId: other.actor.accountId });
    await given.sentQuote(other, jobId);

    await given.hired(client, quoteId);

    const [hiredOne] = (await domain.conversations.forJob(artisan.actor, { jobId }))!;
    const [declinedOne] = (await domain.conversations.forJob(other.actor, { jobId }))!;
    expect(
      await domain.conversations.send(artisan.actor, {
        conversationId: hiredOne!.conversationId,
        text: "I'll bring drop sheets.",
      }),
    ).toMatchObject({ ok: true });
    expect(
      await domain.conversations.send(other.actor, {
        conversationId: declinedOne!.conversationId,
        text: "Still available if you need me.",
      }),
    ).toMatchObject({ ok: false, refusal: { reason: "read-only" } });
  });

  test("joins the Artisan's Active Jobs, without the address", async () => {
    const { domain, given } = await createHarness();
    const { client, artisan, jobId, quoteId } = await quoted(given);

    await given.hired(client, quoteId);

    const mine = await domain.quotes.mine(artisan.actor);
    expect(mine).toEqual([expect.objectContaining({ jobId, quoteId, state: "hired" })]);
    expect(JSON.stringify(mine)).not.toMatch(/Main Road|SEA POINT/);
  });

  test("the Client gets an email Receipt that is not a tax invoice", async () => {
    const { domain, given, mailer } = await createHarness();
    const { client, quoteId } = await quoted(given);

    await given.hired(client, quoteId);

    const receipt = mailer.sentTo(client.email).at(-1);
    expect(receipt?.subject).toBe("Receipt for your Payment: Paint the lounge");
    expect(receipt?.text).toContain("Artisan: Sipho Dlamini");
    expect(receipt?.text).toContain(
      `Quote: ${formatRands(200_000)} (Labour ${formatRands(150_000)}, Materials ${formatRands(50_000)})`,
    );
    expect(receipt?.text).toContain(`Protection Fee (5%, not refunded): ${formatRands(10_000)}`);
    expect(receipt?.text).toContain(`Total paid: ${formatRands(210_000)}`);
    expect(receipt?.text).toContain("This Receipt is not a tax invoice.");
    // The Client is not told in Notices: the Receipt is an email.
    expect((await domain.notices.list(client.actor)).map((notice) => notice.event)).not.toContain(
      "payment.receipt",
    );
  });

  test("a VAT-registered Artisan's amounts are said to include VAT on the Receipt", async () => {
    const { domain, given, mailer } = await createHarness();
    const client = await given.client();
    const artisan = await given.matchableArtisan();
    const vat = await domain.accounts.setVatNumber(artisan.actor, { vatNumber: "4123456789" });
    if (!vat.ok) throw new Error(vat.refusal.message);
    const jobId = await given.openJob(client);
    const quoteId = await given.sentQuote(artisan, jobId);

    await given.hired(client, quoteId);

    expect(mailer.sentTo(client.email).at(-1)?.text).toContain(
      "The Quote's amounts include VAT (VAT number 4123456789).",
    );
  });
});

describe("a failed attempt", () => {
  test("changes nothing, and the Client may try again", async () => {
    const { domain, given, payments } = await createHarness();
    const { client, artisan, jobId, quoteId } = await quoted(given);
    const first = await given.checkout(client, quoteId);

    const failed = await domain.system.receivePaymentEvent(await payments.failCollection(first));

    expect(failed).toEqual({ ok: true, value: {} });
    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      state: "open",
      engagement: null,
      notHired: [],
    });
    expect(await domain.quotes.forJob(client.actor, { jobId })).toEqual([
      expect.objectContaining({ state: "sent" }),
    ]);
    expect(await toldOf(domain, artisan, jobId)).toEqual([]);

    await given.hired(client, quoteId);
    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ state: "hired" });
  });
});

describe("payment events", () => {
  test("one not signed by the provider is refused and changes nothing", async () => {
    const { domain, given, payments } = await createHarness();
    const { client, jobId, quoteId } = await quoted(given);
    const webhook = await payments.succeedCollection(await given.checkout(client, quoteId));

    const forged = await domain.system.receivePaymentEvent({ ...webhook, headers: {} });

    expect(forged).toEqual({
      ok: false,
      refusal: {
        reason: "unverified",
        message: "That payment event is not signed by the provider.",
      },
    });
    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({ state: "open" });
  });

  test("a repeated one changes nothing twice", async () => {
    const { domain, given, payments, mailer } = await createHarness();
    const { client, artisan, jobId, quoteId } = await quoted(given);
    const webhook = await payments.succeedCollection(await given.checkout(client, quoteId));
    await domain.system.receivePaymentEvent(webhook);
    const emails = mailer.sent.length;

    expect(await domain.system.receivePaymentEvent(webhook)).toEqual({ ok: true, value: {} });

    expect(mailer.sent.length).toBe(emails);
    expect(await toldOf(domain, artisan, jobId)).toHaveLength(1);
    expect((await domain.jobs.view(client.actor, { jobId }))?.engagement?.money).toMatchObject({
      paidInCents: 200_000,
      protectionFeeCents: 10_000,
    });
  });

  test("a failure arriving after a later attempt's success changes nothing", async () => {
    const { domain, given, payments } = await createHarness();
    const { client, jobId, quoteId } = await quoted(given);
    const abandoned = await given.checkout(client, quoteId);
    await given.hired(client, quoteId);

    await domain.system.receivePaymentEvent(await payments.failCollection(abandoned, "expired"));

    expect(await domain.jobs.view(client.actor, { jobId })).toMatchObject({
      state: "hired",
      engagement: expect.objectContaining({ state: "paid" }),
      notHired: [],
    });
  });
});

describe("the Hire is asked again when the Payment arrives", () => {
  test("a second Payment, after the Quote was Hired by another, is refunded whole and Hires nothing", async () => {
    const { domain, given, payments } = await createHarness();
    const { client, artisan, jobId, quoteId } = await quoted(given);
    const second = await given.checkout(client, quoteId);
    await given.hired(client, quoteId);

    await given.paid(second, "pay_by_bank");

    expect(payments.calls.filter((call) => call.operation === "refund")).toEqual([
      {
        operation: "refund",
        input: expect.objectContaining({ collectionId: second, amountCents: 210_000 }),
      },
    ]);
    const job = await domain.jobs.view(client.actor, { jobId });
    expect(job?.notHired).toEqual([
      { paymentId: second, amountCents: 210_000, reason: "quote-ended", at: expect.any(Date) },
    ]);
    expect(job?.engagement?.money).toMatchObject({ paidInCents: 200_000 });
    expect(await toldOf(domain, artisan, jobId)).toHaveLength(1);
  });

  test.each([
    [
      "Withdrawn by its Artisan",
      async ({ domain }: Harness, q: Quoted) => {
        await domain.quotes.withdraw(q.artisan.actor, { jobId: q.jobId });
      },
      "quote-ended",
    ],
    [
      "revised by its Artisan",
      async ({ domain }: Harness, q: Quoted) => {
        const revised = await domain.quotes.revise(q.artisan.actor, {
          jobId: q.jobId,
          ...QUOTE,
          labour: "1800",
        });
        if (!revised.ok) throw new Error(revised.refusal.message);
      },
      "quote-changed",
    ],
    [
      "of an Artisan no longer verified",
      async (harness: Harness) => removeBadge(harness, "Work photos, Painting"),
      "not-verified",
    ],
  ])(
    "a Quote %s while the checkout was open: the whole Payment, Protection Fee included, is refunded",
    async (_, change, reason) => {
      const harness = await createHarness();
      const { domain, given, payments } = harness;
      const q = await quoted(given);
      const collectionId = await given.checkout(q.client, q.quoteId);
      await change(harness, q);

      await given.paid(collectionId);

      expect(payments.calls.filter((call) => call.operation === "refund")).toEqual([
        {
          operation: "refund",
          input: expect.objectContaining({ collectionId, amountCents: 210_000 }),
        },
      ]);
      expect(await domain.jobs.view(q.client.actor, { jobId: q.jobId })).toMatchObject({
        engagement: null,
        notHired: [expect.objectContaining({ amountCents: 210_000, reason })],
      });
      expect(await domain.notices.list(q.client.actor)).toContainEqual(
        expect.objectContaining({
          event: "payment.not-hired",
          title: "Your Payment will be refunded, as no Hire happened: Paint the lounge",
        }),
      );
      expect(
        (await domain.notices.list(q.artisan.actor)).filter(
          (notice) => notice.event === "engagement.hired",
        ),
      ).toEqual([]);
    },
  );

  test("a repeated event of a Payment that Hired nobody asks for the same Refund again, harmlessly", async () => {
    const harness = await createHarness();
    const { domain, given, payments } = harness;
    const q = await quoted(given);
    const collectionId = await given.checkout(q.client, q.quoteId);
    await domain.quotes.withdraw(q.artisan.actor, { jobId: q.jobId });
    const webhook = await payments.succeedCollection(collectionId);
    await domain.system.receivePaymentEvent(webhook);

    await domain.system.receivePaymentEvent(webhook);

    const refunds = payments.calls.filter((call) => call.operation === "refund");
    expect(refunds).toHaveLength(2);
    expect(refunds[1]).toEqual(refunds[0]);
    expect(
      (await domain.notices.list(q.client.actor)).filter(
        (notice) => notice.event === "payment.not-hired",
      ),
    ).toHaveLength(1);
  });
});

describe("Verification after Hire", () => {
  test("a check that lapses or is removed changes nothing on a Hired Engagement", async () => {
    const harness = await createHarness();
    const { domain, given, clock } = harness;
    const client = await given.client();
    const artisan = await given.matchableArtisan({ categories: ["electrical"] });
    const jobId = await given.openJob(client, { category: "electrical" });
    const quoteId = await given.sentQuote(artisan, jobId);
    await given.hired(client, quoteId);
    const before = await domain.jobs.viewAsArtisan(artisan.actor, { jobId });

    // The builder's contractor registration expires on 31 December 2028.
    clock.set(new Date("2029-01-01T00:00:00Z"));
    await domain.system.runDueClocks();
    await removeBadge(harness, "Work photos, Electrical");

    expect(
      await domain.verification.verified(artisan.actor, {
        artisanId: artisan.actor.accountId,
        category: "electrical",
      }),
    ).toBe(false);
    expect(await domain.jobs.viewAsArtisan(artisan.actor, { jobId })).toMatchObject({
      state: "hired",
      address: before?.address,
      engagement: { ...before?.engagement },
    });
  });
});

const QUOTE = {
  scope: "Prepare and paint two walls with two coats of washable white.",
  labour: "1500",
  materials: "500",
  materialsBy: "artisan" as const,
  startOn: "2026-11-02",
  durationDays: 3,
  warranty: "Twelve months on peeling.",
};

type Quoted = Awaited<ReturnType<typeof quoted>>;

/** The checkouts opened at the payment adapter. */
function checkoutsOpened(payments: Harness["payments"]) {
  return payments.calls.filter((call) => call.operation === "createCollection");
}

/** A Client's Open Job with one Sent Quote, the default R2 000, from a verified Artisan. */
async function quoted(given: Harness["given"]) {
  const client = await given.client();
  const artisan = await given.matchableArtisan({ name: "Sipho Dlamini" });
  const jobId = await given.openJob(client);
  const quoteId = await given.sentQuote(artisan, jobId);
  return { client, artisan, jobId, quoteId };
}

/** The Admin removes the one Artisan's badge of this title, as if found false. */
async function removeBadge({ domain, given }: Harness, title: string) {
  const admin: { actor: AdminActor } = await given.admin();
  const itemId = (await domain.admins.auditLog(admin.actor))!.rows.find(
    (row) => row.action === "queue.row-decided",
  )!.subjectId!;
  const row = (await domain.queues.item(admin.actor, { itemId }))?.rows?.find(
    (each) => each.title === title,
  );
  const removed = await domain.queues.decideRow(admin.actor, {
    itemId,
    rowId: row!.id,
    decision: "remove",
    reason: "These photos are from a catalogue.",
  });
  if (!removed.ok) throw new Error(removed.refusal.message);
}

/** What the Account was told of the Job since it was offered or invited to it. */
async function toldOf(domain: Harness["domain"], account: { actor: Actor }, jobId: string) {
  const notices = await domain.notices.list(account.actor);
  return notices.filter(
    (notice) =>
      notice.link === `/jobs/${jobId}` &&
      notice.event !== "job.matched" &&
      notice.event !== "job.invited",
  );
}
