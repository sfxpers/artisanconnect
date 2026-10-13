import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { createStoredFakePayments } from "@/domain/fakes/payments";
import { d1FakePaymentsStore } from "@/worker/fake-payments";
import { createHarness } from "./support/harness";

// The fake payment adapter is the launch adapter in every environment (#111),
// kept in D1, so what it keeps guards real money flow.

const collection = {
  id: "pay_1",
  amountCents: 630_000,
  methods: ["card", "pay_by_bank"] as const,
  payerReference: "AC pay_1",
  beneficiaryReference: "ArtisanConnect pay_1",
  returnUrl: "https://artisanconnect.test/jobs/1",
};

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
