import type {
  BankAccountVerification,
  ChargebackOutcome,
  Clock,
  Collection,
  CreateCollection,
  CreatePayout,
  CreateRefund,
  PaymentAdapter,
  PaymentEvent,
  PaymentEventData,
  PaymentMethod,
  Payout,
  PayoutFailure,
  Refund,
  Webhook,
} from "../ports";

/**
 * The payment adapter at launch, in every environment: no money moves. It
 * keeps the rules a Stitch adapter would (#108) and throws when they are
 * broken, so a domain bug shows here rather than at the provider. Its state is
 * in memory.
 *
 * Money moves only by its controls. Each control changes the state and returns
 * the signed webhook the provider would send; deliver it (more than once, or
 * out of order) to see how the platform handles it.
 */
export type FakePayments = PaymentAdapter & {
  /** Every operation called, oldest first. */
  readonly calls: { operation: Operation; input: unknown }[];

  succeedCollection(id: string, method?: PaymentMethod): Promise<Webhook>;
  failCollection(id: string, reason?: "failed" | "cancelled" | "expired"): Promise<Webhook>;

  succeedRefund(id: string): Promise<Webhook>;
  failRefund(id: string, reason?: string): Promise<Webhook>;
  pauseRefund(id: string): Promise<Webhook>;

  succeedPayout(id: string): Promise<Webhook>;
  failPayout(id: string, reason?: PayoutFailure): Promise<Webhook>;
  pausePayout(id: string): Promise<Webhook>;
  /** The bank sends back a Payout it had paid, even days later. */
  sendBackPayout(id: string, reason?: string): Promise<Webhook>;
  /** The next createPayout is refused at once, as for a bad check digit. */
  refuseNextPayout(reason?: string): void;

  openChargeback(collectionId: string, evidenceDueAt?: Date): Promise<Webhook>;
  closeChargeback(
    collectionId: string,
    closing: { outcome: ChargebackOutcome; reversedCents: number },
  ): Promise<Webhook>;

  setFloat(cents: number): void;
  /** What verifyBankAccount answers from now on. Starts as a full match. */
  setBankAccountVerification(verification: BankAccountVerification): void;

  /** What its checkout page shows of a collection, and where it returns to; null if none. */
  checkout(id: string): Promise<(Collection & { returnUrl: string }) | null>;
  /** Its whole state, to keep and start another from. */
  snapshot(): FakePaymentsState;
};

/** Everything the fake keeps, as JSON can hold it. */
export type FakePaymentsState = {
  collections: [string, { input: CreateCollection; state: Collection }][];
  refunds: [string, { input: CreateRefund; state: Refund }][];
  payouts: [string, { input: CreatePayout; state: Payout; refusal: string | null }][];
  chargebacks: [string, "open" | "closed"][];
  float: number;
  nextPayoutRefusal: string | null;
  bankAccountVerification: BankAccountVerification;
  eventCount: number;
};

type Operation = Exclude<keyof PaymentAdapter, "verifyWebhook">;

const SIGNATURE_HEADER = "x-fake-signature";
const PAYER_REFERENCE_MAX = 12;
const BENEFICIARY_REFERENCE_MAX = 20;

export function createFakePayments({
  clock = { now: () => new Date() },
  webhookSecret = "fake-webhook-secret",
  floatCents = 100_000_000,
  state: kept,
}: {
  clock?: Clock;
  webhookSecret?: string;
  floatCents?: number;
  /** A snapshot to carry on from, instead of starting empty. */
  state?: FakePaymentsState;
} = {}): FakePayments {
  const calls: FakePayments["calls"] = [];
  const restored = kept && structuredClone(kept);
  const collections = new Map(restored?.collections);
  const refunds = new Map(restored?.refunds);
  const payouts = new Map(restored?.payouts);
  const chargebacks = new Map(restored?.chargebacks);
  let float = restored?.float ?? floatCents;
  let nextPayoutRefusal = restored?.nextPayoutRefusal ?? null;
  let bankAccountVerification: BankAccountVerification = restored?.bankAccountVerification ?? {
    state: "done",
    accountOpen: true,
    acceptsCredits: true,
    identityMatch: true,
    surnameMatch: true,
    initialsMatch: true,
  };
  let eventCount = restored?.eventCount ?? 0;
  const keyPromise = crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  function record(operation: Operation, input: unknown) {
    calls.push({ operation, input });
  }

  async function emit(data: PaymentEventData): Promise<Webhook> {
    eventCount += 1;
    const event: PaymentEvent = { ...data, eventId: `evt_${eventCount}`, occurredAt: clock.now() };
    const body = JSON.stringify(event);
    const signature = await crypto.subtle.sign(
      "HMAC",
      await keyPromise,
      new TextEncoder().encode(body),
    );
    return { body, headers: { [SIGNATURE_HEADER]: toHex(signature) } };
  }

  function find<S>(items: Map<string, { state: S }>, id: string, what: string): S {
    const found = items.get(id);
    if (!found) throw new Error(`No ${what} ${id}`);
    return found.state;
  }
  const collection = (id: string) => find(collections, id, "collection");
  const refund = (id: string) => find(refunds, id, "refund");
  const payout = (id: string) => find(payouts, id, "payout");

  /** Moves the item's state; `effect` runs between the check and the move, and may refuse it. */
  function move<S extends { state: string }>(
    item: S,
    from: S["state"][],
    to: S["state"],
    what: string,
    effect?: () => void,
  ) {
    if (!from.includes(item.state)) throw new Error(`Cannot ${what}: it is ${item.state}`);
    effect?.();
    item.state = to;
  }
  function draw(cents: number, what: string) {
    if (float < cents) throw new Error(`Float too low to ${what}; pause it instead`);
    float -= cents;
  }

  return {
    calls,

    async createCollection(input) {
      record("createCollection", input);
      assertCents(input.amountCents);
      assertReference(input.payerReference, PAYER_REFERENCE_MAX, "payer");
      assertReference(input.beneficiaryReference, BENEFICIARY_REFERENCE_MAX, "beneficiary");
      if (input.methods.length === 0) throw new Error("A collection needs a payment method");
      const existing = collections.get(input.id);
      if (existing) assertSameInput(existing.input, input);
      else
        collections.set(input.id, {
          input,
          state: { id: input.id, amountCents: input.amountCents, state: "pending", method: null },
        });
      // The checkout page is served by the app itself in local and staging.
      return {
        checkoutUrl: new URL(`/fake-checkout/${encodeURIComponent(input.id)}`, input.returnUrl)
          .href,
      };
    },

    async getCollection(id) {
      record("getCollection", { id });
      const found = collections.get(id);
      return found ? { ...found.state } : null;
    },

    async refund(input) {
      record("refund", input);
      assertCents(input.amountCents);
      const existing = refunds.get(input.id);
      if (existing) {
        assertSameInput(existing.input, input);
        return { ...existing.state };
      }
      const paid = collection(input.collectionId);
      if (paid.state !== "succeeded")
        throw new Error(`Cannot refund collection ${paid.id}: it is ${paid.state}`);
      const others = [...refunds.values()].filter(
        (r) => r.input.collectionId === input.collectionId,
      );
      if (others.some((r) => r.state.state === "pending" || r.state.state === "paused")) {
        throw new Error(
          `Collection ${paid.id} already has a refund in progress; send one at a time`,
        );
      }
      const refunded = others
        .filter((r) => r.state.state === "succeeded")
        .reduce((sum, r) => sum + r.state.amountCents, 0);
      if (refunded + input.amountCents > paid.amountCents) {
        throw new Error(
          `Refund of ${input.amountCents} is more than is left of collection ${paid.id}`,
        );
      }
      const state: Refund = {
        id: input.id,
        collectionId: input.collectionId,
        amountCents: input.amountCents,
        state: "pending",
      };
      refunds.set(input.id, { input, state });
      return { ...state };
    },

    async getRefund(id) {
      record("getRefund", { id });
      const found = refunds.get(id);
      return found ? { ...found.state } : null;
    },

    async verifyBankAccount(input) {
      record("verifyBankAccount", input);
      return { ...bankAccountVerification };
    },

    async createPayout(input) {
      record("createPayout", input);
      assertCents(input.amountCents);
      assertReference(input.beneficiaryReference, BENEFICIARY_REFERENCE_MAX, "beneficiary");
      const existing = payouts.get(input.id);
      if (existing) {
        assertSameInput(existing.input, input);
        return existing.refusal
          ? { state: "refused", reason: existing.refusal }
          : { state: "pending" };
      }
      const refusal = nextPayoutRefusal;
      nextPayoutRefusal = null;
      payouts.set(input.id, {
        input,
        state: {
          id: input.id,
          amountCents: input.amountCents,
          state: refusal ? "refused" : "pending",
        },
        refusal,
      });
      return refusal ? { state: "refused", reason: refusal } : { state: "pending" };
    },

    async getPayout(id) {
      record("getPayout", { id });
      const found = payouts.get(id);
      return found ? { ...found.state } : null;
    },

    async getFloatBalance() {
      record("getFloatBalance", {});
      return { cents: float };
    },

    async verifyWebhook({ body, headers }) {
      const signature = headers[SIGNATURE_HEADER];
      if (!signature || !/^[0-9a-f]+$/.test(signature) || signature.length % 2 !== 0) return null;
      const good = await crypto.subtle.verify(
        "HMAC",
        await keyPromise,
        fromHex(signature),
        new TextEncoder().encode(body),
      );
      if (!good) return null;
      return JSON.parse(body, (key, value) =>
        key === "occurredAt" || key === "evidenceDueAt" ? new Date(value) : value,
      ) as PaymentEvent;
    },

    async succeedCollection(id, method = "card") {
      const paid = collection(id);
      move(paid, ["pending"], "succeeded", `succeed collection ${id}`);
      paid.method = method;
      return emit({
        type: "collection.succeeded",
        collectionId: id,
        amountCents: paid.amountCents,
        method,
      });
    },
    async failCollection(id, reason = "failed") {
      move(collection(id), ["pending"], "failed", `fail collection ${id}`);
      return emit({ type: "collection.failed", collectionId: id, reason });
    },

    async succeedRefund(id) {
      const r = refund(id);
      move(r, ["pending", "paused"], "succeeded", `succeed refund ${id}`, () =>
        draw(r.amountCents, `pay refund ${id}`),
      );
      return emit({
        type: "refund.succeeded",
        refundId: id,
        collectionId: r.collectionId,
        amountCents: r.amountCents,
      });
    },
    async failRefund(id, reason = "bank_processing_error") {
      const r = refund(id);
      move(r, ["pending", "paused"], "failed", `fail refund ${id}`);
      return emit({ type: "refund.failed", refundId: id, collectionId: r.collectionId, reason });
    },
    async pauseRefund(id) {
      const r = refund(id);
      move(r, ["pending"], "paused", `pause refund ${id}`);
      return emit({ type: "refund.paused", refundId: id, collectionId: r.collectionId });
    },

    async succeedPayout(id) {
      const p = payout(id);
      move(p, ["pending", "paused"], "succeeded", `succeed payout ${id}`, () =>
        draw(p.amountCents, `pay payout ${id}`),
      );
      return emit({ type: "payout.succeeded", payoutId: id, amountCents: p.amountCents });
    },
    async failPayout(id, reason = "invalid_account") {
      move(payout(id), ["pending", "paused"], "failed", `fail payout ${id}`);
      return emit({ type: "payout.failed", payoutId: id, reason });
    },
    async pausePayout(id) {
      move(payout(id), ["pending"], "paused", `pause payout ${id}`);
      return emit({ type: "payout.paused", payoutId: id });
    },
    async sendBackPayout(id, reason = "account_closed") {
      const p = payout(id);
      move(p, ["succeeded"], "reversed", `send back payout ${id}`, () => {
        float += p.amountCents;
      });
      return emit({ type: "payout.reversed", payoutId: id, amountCents: p.amountCents, reason });
    },
    refuseNextPayout(reason = "invalid_check_digit") {
      nextPayoutRefusal = reason;
    },

    async openChargeback(collectionId, evidenceDueAt) {
      const paid = collection(collectionId);
      if (paid.state !== "succeeded" || paid.method !== "card") {
        throw new Error(`Only a succeeded card collection can be charged back`);
      }
      if (chargebacks.has(collectionId))
        throw new Error(`Collection ${collectionId} already has a chargeback`);
      chargebacks.set(collectionId, "open");
      return emit({
        type: "chargeback.opened",
        collectionId,
        amountCents: paid.amountCents,
        evidenceDueAt: evidenceDueAt ?? new Date(clock.now().getTime() + 7 * 24 * 60 * 60_000),
      });
    },
    async closeChargeback(collectionId, { outcome, reversedCents }) {
      if (chargebacks.get(collectionId) !== "open")
        throw new Error(`No open chargeback on ${collectionId}`);
      if (!Number.isInteger(reversedCents) || reversedCents < 0)
        throw new Error("Reversed cents must be whole");
      chargebacks.set(collectionId, "closed");
      return emit({ type: "chargeback.closed", collectionId, outcome, reversedCents });
    },

    setFloat(cents) {
      float = cents;
    },
    setBankAccountVerification(verification) {
      bankAccountVerification = verification;
    },

    async checkout(id) {
      const found = collections.get(id);
      return found ? { ...found.state, returnUrl: found.input.returnUrl } : null;
    },

    snapshot() {
      return structuredClone({
        collections: [...collections],
        refunds: [...refunds],
        payouts: [...payouts],
        chargebacks: [...chargebacks],
        float,
        nextPayoutRefusal,
        bankAccountVerification,
        eventCount,
      });
    },
  };
}

/** Where a fake kept outside one isolate's memory saves its state. */
export type FakePaymentsStore = {
  /** The state saved last, and its version; null before the first save. */
  load(): Promise<{ state: FakePaymentsState; version: number } | null>;
  /** Saves the state over that version (0 for the first); false if another save came first. */
  save(state: FakePaymentsState, version: number): Promise<boolean>;
};

/** The fake as the Worker keeps it: the adapter, and its checkout page's controls. */
export type StoredFakePayments = PaymentAdapter &
  Pick<FakePayments, "succeedCollection" | "failCollection" | "checkout">;

/**
 * The fake with its state in a store, as the Worker runs it: each operation
 * carries on from the state saved last and saves what it changed, starting
 * again if another request saved first, so every isolate sees one fake.
 */
export function createStoredFakePayments({
  store,
  ...options
}: {
  store: FakePaymentsStore;
  clock?: Clock;
  webhookSecret?: string;
}): StoredFakePayments {
  async function run<T>(operation: (fake: FakePayments) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const saved = await store.load();
      const fake = createFakePayments({ ...options, state: saved?.state });
      const before = JSON.stringify(fake.snapshot());
      const result = await operation(fake);
      const after = fake.snapshot();
      if (JSON.stringify(after) === before) return result;
      if (await store.save(after, saved?.version ?? 0)) return result;
    }
    throw new Error("The fake payment adapter's state kept changing; try again");
  }
  return {
    createCollection: (input) => run((fake) => fake.createCollection(input)),
    getCollection: (id) => run((fake) => fake.getCollection(id)),
    refund: (input) => run((fake) => fake.refund(input)),
    getRefund: (id) => run((fake) => fake.getRefund(id)),
    verifyBankAccount: (input) => run((fake) => fake.verifyBankAccount(input)),
    createPayout: (input) => run((fake) => fake.createPayout(input)),
    getPayout: (id) => run((fake) => fake.getPayout(id)),
    getFloatBalance: () => run((fake) => fake.getFloatBalance()),
    verifyWebhook: (webhook) => run((fake) => fake.verifyWebhook(webhook)),
    succeedCollection: (id, method) => run((fake) => fake.succeedCollection(id, method)),
    failCollection: (id, reason) => run((fake) => fake.failCollection(id, reason)),
    checkout: (id) => run((fake) => fake.checkout(id)),
  };
}

function assertCents(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`Amounts are whole cents above zero; got ${amount}`);
  }
}

function assertReference(reference: string, max: number, whose: string) {
  if (reference.length === 0 || reference.length > max) {
    throw new Error(`A ${whose} reference is 1 to ${max} characters; got "${reference}"`);
  }
}

function assertSameInput(before: unknown, now: unknown) {
  if (JSON.stringify(before) !== JSON.stringify(now)) {
    throw new Error("An id was reused with different input; our id is the idempotency key");
  }
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
