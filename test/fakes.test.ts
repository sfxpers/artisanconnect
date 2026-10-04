import { describe, expect, test } from "vitest";
import { createFakeClock } from "@/domain/fakes/clock";
import { createFakeContentReader } from "@/domain/fakes/content-reader";
import { createFakeMailer } from "@/domain/fakes/mailer";
import { createFakePayments } from "@/domain/fakes/payments";

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
  return { clock, payments: createFakePayments({ clock }) };
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

describe("the fake clock", () => {
  test("moves only when told", () => {
    const clock = createFakeClock(new Date("2026-10-05T06:00:00Z"));

    clock.advance({ days: 7, hours: 1, minutes: 30 });

    expect(clock.now()).toEqual(new Date("2026-10-12T07:30:00Z"));
  });
});

describe("the fake content reader", () => {
  test("gives the verdict it is forced to", async () => {
    const reader = createFakeContentReader();
    const content = {
      text: "Call me",
      photos: [],
      context: { kind: "before-payment" },
    } as const;

    expect(await reader.read(content)).toEqual({ kind: "clear" });
    reader.force({ kind: "unsure", reason: "May be contact details" });
    expect(await reader.read(content)).toEqual({
      kind: "unsure",
      reason: "May be contact details",
    });
    expect(reader.reads).toHaveLength(2);
  });

  test("reads photos and voice notes as it is told to, and fails every call once broken", async () => {
    const reader = createFakeContentReader();
    const audio = { bytes: new Uint8Array(1), contentType: "audio/webm" };

    expect(await reader.readPhoto(new Uint8Array(1))).toBe("");
    expect(await reader.transcribe(audio)).toBe("");
    reader.photosSay("Thandi 082 555 0123");
    reader.voiceNotesSay("zero eight two");
    expect(await reader.readPhoto(new Uint8Array(1))).toBe("Thandi 082 555 0123");
    expect(await reader.transcribe(audio)).toBe("zero eight two");
    reader.breaks();
    await expect(reader.readPhoto(new Uint8Array(1))).rejects.toThrow();
    await expect(reader.transcribe(audio)).rejects.toThrow();
    await expect(
      reader.read({ text: "", photos: [], context: { kind: "before-payment" } }),
    ).rejects.toThrow();
  });
});

describe("the fake mailer", () => {
  test("captures what it sends", async () => {
    const mailer = createFakeMailer();

    await mailer.send({
      to: "thandi@example.com",
      subject: "You were Hired",
      text: "Open ArtisanConnect",
    });

    expect(mailer.sentTo("thandi@example.com")).toEqual([
      { to: "thandi@example.com", subject: "You were Hired", text: "Open ArtisanConnect" },
    ]);
  });
});
