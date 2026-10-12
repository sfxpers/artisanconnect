import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { createFakeClock } from "@/domain/fakes/clock";
import { createFakePayments, createStoredFakePayments } from "@/domain/fakes/payments";
import { d1FakePaymentsStore } from "@/worker/fake-payments";
import { createHarness } from "./support/harness";

// The fakes are the ports every domain test runs on, and the fake payment
// adapter is the launch adapter in every environment, so they keep the rules.

const collection = {
  id: "pay_1",
  amountCents: 630_000,
  methods: ["card", "pay_by_bank"] as const,
  payerReference: "AC pay_1",
  beneficiaryReference: "ArtisanConnect pay_1",
  returnUrl: "https://artisanconnect.test/jobs/1",
};

function payments() {
  const clock = createFakeClock();
  return { clock, payments: createFakePayments({ clock, webhookSecret: "test-webhook-secret" }) };
}

async function paid(method: "card" | "pay_by_bank" = "card") {
  const fake = payments();
  await fake.payments.createCollection({ ...collection, methods: [...collection.methods] });
  await fake.payments.succeedCollection(collection.id, method);
  return fake;
}

describe("the fake payment adapter", () => {
  test("serves its checkout on the app's own origin, and collects only by its control", async () => {
    const { payments: fake } = payments();

    const { checkoutUrl } = await fake.createCollection({ ...collection, methods: ["card"] });

    expect(checkoutUrl).toBe("https://artisanconnect.test/fake-checkout/pay_1");
    expect(await fake.getCollection("pay_1")).toMatchObject({ state: "pending" });
    await fake.succeedCollection("pay_1");
    expect(await fake.getCollection("pay_1")).toMatchObject({ state: "succeeded", method: "card" });
  });

  test("sends each event as a signed webhook that verifies, and refuses a forged one", async () => {
    const { clock, payments: fake } = payments();
    await fake.createCollection({ ...collection, methods: ["card"] });

    const webhook = await fake.succeedCollection("pay_1");

    expect(await fake.verifyWebhook(webhook)).toEqual({
      type: "collection.succeeded",
      collectionId: "pay_1",
      amountCents: 630_000,
      method: "card",
      eventId: expect.any(String),
      occurredAt: clock.now(),
    });
    const forged = { ...webhook, body: webhook.body.replace("630000", "999999") };
    expect(await fake.verifyWebhook(forged)).toBeNull();
    expect(await fake.verifyWebhook({ body: webhook.body, headers: {} })).toBeNull();
  });

  test("takes our id as the idempotency key", async () => {
    const { payments: fake } = payments();
    await fake.createCollection({ ...collection, methods: ["card"] });

    await fake.createCollection({ ...collection, methods: ["card"] });
    await expect(
      fake.createCollection({ ...collection, methods: ["card"], amountCents: 1 }),
    ).rejects.toThrow(/idempotency/);
  });

  test("refuses amounts that are not whole cents and references that are too long", async () => {
    const { payments: fake } = payments();

    await expect(
      fake.createCollection({ ...collection, methods: ["card"], amountCents: 10.5 }),
    ).rejects.toThrow();
    await expect(
      fake.createCollection({ ...collection, methods: ["card"], payerReference: "thirteen char" }),
    ).rejects.toThrow(/payer reference/);
    await expect(
      fake.createPayout({
        id: "out_1",
        amountCents: 100,
        bankAccount: {
          accountHolder: "S Dlamini",
          accountNumber: "62000000001",
          branchCode: "250655",
        },
        beneficiaryReference: "twenty-one characters",
      }),
    ).rejects.toThrow(/beneficiary reference/);
  });

  test("refunds one at a time, never more than is left", async () => {
    const { payments: fake } = await paid();

    await fake.refund({
      id: "ref_1",
      collectionId: "pay_1",
      amountCents: 300_000,
      reason: "cancelled",
    });
    await expect(
      fake.refund({ id: "ref_2", collectionId: "pay_1", amountCents: 100, reason: "cancelled" }),
    ).rejects.toThrow(/one at a time/);
    await fake.succeedRefund("ref_1");
    await expect(
      fake.refund({
        id: "ref_3",
        collectionId: "pay_1",
        amountCents: 330_001,
        reason: "cancelled",
      }),
    ).rejects.toThrow(/more than is left/);
  });

  test("refuses a Payout at once when told, and sends one back only after it was paid", async () => {
    const { payments: fake } = payments();
    const bankAccount = {
      accountHolder: "S Dlamini",
      accountNumber: "62000000001",
      branchCode: "250655",
    };
    fake.setFloat(100_000);

    fake.refuseNextPayout("invalid_check_digit");
    expect(
      await fake.createPayout({
        id: "out_1",
        amountCents: 54_000,
        bankAccount,
        beneficiaryReference: "AC out_1",
      }),
    ).toEqual({ state: "refused", reason: "invalid_check_digit" });
    expect(
      await fake.createPayout({
        id: "out_2",
        amountCents: 54_000,
        bankAccount,
        beneficiaryReference: "AC out_2",
      }),
    ).toEqual({ state: "pending" });

    await expect(fake.sendBackPayout("out_2")).rejects.toThrow();
    await fake.succeedPayout("out_2");
    expect(await fake.getFloatBalance()).toEqual({ cents: 46_000 });
    const sentBack = await fake.verifyWebhook(await fake.sendBackPayout("out_2", "account_closed"));
    expect(sentBack).toMatchObject({
      type: "payout.reversed",
      payoutId: "out_2",
      amountCents: 54_000,
    });
    expect(await fake.getFloatBalance()).toEqual({ cents: 100_000 });
  });

  test("pays nothing from a float too low to cover it", async () => {
    const { payments: fake } = payments();
    const bankAccount = {
      accountHolder: "S Dlamini",
      accountNumber: "62000000001",
      branchCode: "250655",
    };
    fake.setFloat(1_000);
    await fake.createPayout({
      id: "out_1",
      amountCents: 54_000,
      bankAccount,
      beneficiaryReference: "AC out_1",
    });

    await expect(fake.succeedPayout("out_1")).rejects.toThrow(/Float too low/);
    expect(await fake.verifyWebhook(await fake.pausePayout("out_1"))).toMatchObject({
      type: "payout.paused",
    });
  });

  test("opens and closes a Chargeback on a card Payment, with the reversed amount on closing", async () => {
    const { payments: fake } = await paid("card");

    expect(await fake.verifyWebhook(await fake.openChargeback("pay_1"))).toMatchObject({
      type: "chargeback.opened",
      collectionId: "pay_1",
      amountCents: 630_000,
    });
    expect(
      await fake.verifyWebhook(
        await fake.closeChargeback("pay_1", { outcome: "lost", reversedCents: 630_000 }),
      ),
    ).toMatchObject({ type: "chargeback.closed", outcome: "lost", reversedCents: 630_000 });
  });

  test("has no Chargeback on Instant EFT", async () => {
    const { payments: fake } = await paid("pay_by_bank");

    await expect(fake.openChargeback("pay_1")).rejects.toThrow(/card/);
  });

  test("records every operation called", async () => {
    const { payments: fake } = await paid();
    await fake.getFloatBalance();

    expect(fake.calls.map((call) => call.operation)).toEqual([
      "createCollection",
      "getFloatBalance",
    ]);
  });
});

describe("the fake payment adapter in the Worker", () => {
  // Kept in D1, so a collection one isolate opened is found by the next.
  async function stored() {
    await createHarness();
    return () =>
      createStoredFakePayments({
        store: d1FakePaymentsStore(env.DB),
        webhookSecret: "test-webhook-secret",
      });
  }

  test("keeps its state between adapters on the same D1", async () => {
    const adapter = await stored();
    const { checkoutUrl } = await adapter().createCollection({
      ...collection,
      methods: ["card"],
    });

    expect(await adapter().checkout("pay_1")).toMatchObject({
      state: "pending",
      amountCents: 630_000,
      returnUrl: collection.returnUrl,
    });
    const webhook = await adapter().succeedCollection("pay_1");
    expect(await adapter().verifyWebhook(webhook)).toMatchObject({
      type: "collection.succeeded",
      collectionId: "pay_1",
    });
    expect(await adapter().getCollection("pay_1")).toMatchObject({ state: "succeeded" });
    expect(checkoutUrl).toBe("https://artisanconnect.test/fake-checkout/pay_1");
  });

  test("of two changes at once, loses neither", async () => {
    const adapter = await stored();

    await Promise.all(
      ["pay_1", "pay_2", "pay_3"].map((id) =>
        adapter().createCollection({ ...collection, id, methods: ["card"] }),
      ),
    );

    for (const id of ["pay_1", "pay_2", "pay_3"]) {
      expect(await adapter().getCollection(id)).toMatchObject({ state: "pending" });
    }
  });
});
