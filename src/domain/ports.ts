// The domain module's only ways out. ADR 0018 holds because there are no
// others: no import, export, or shared-identity port exists.

export type Ports = {
  /** D1, reached through Drizzle. */
  db: D1Database;
  /** R2, for every uploaded file. */
  files: R2Bucket;
  clock: Clock;
  contentReader: ContentReader;
  payments: PaymentAdapter;
  mailer: Mailer;
};

export const PORT_NAMES = [
  "db",
  "files",
  "clock",
  "contentReader",
  "payments",
  "mailer",
] as const satisfies readonly (keyof Ports)[];

// PORT_NAMES lists every port, not just some: this fails to compile otherwise.
const listsEveryPort: [Exclude<keyof Ports, (typeof PORT_NAMES)[number]>] extends [never]
  ? true
  : never = true;
void listsEveryPort;

/** Settings the module is built with. Not ports: nothing goes out through them. */
export type DomainConfig = {
  /** The web app's origin, which links in emails point to. */
  appUrl: string;
  /** Signs session cookies. */
  authSecret: string;
};

export type Clock = {
  now(): Date;
};

// Content reader

/** Where the item was sent, which decides what may be said (#104). */
export type ContentContext =
  | { kind: "before-payment" }
  | { kind: "engagement-conversation"; engagementId: string };

export type ContentToRead = {
  /** The item's text, with any text read from its photos, voice notes, and PDFs. */
  text: string;
  context: ContentContext;
};

export type ContentVerdict =
  | { kind: "clear" }
  | { kind: "sure-hit"; reason: string }
  | { kind: "unsure"; reason: string }
  | { kind: "cannot-run"; reason: string };

export type ContentReader = {
  read(content: ContentToRead): Promise<ContentVerdict>;
};

// Mailer

export type Email = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type Mailer = {
  send(email: Email): Promise<void>;
};

// Payment adapter: shaped like Stitch (#108). Amounts are integer cents in
// ZAR. Our id is both the idempotency key and the reference, so every lookup
// is by our id. Every movement is async: a write returns pending, and the
// result arrives as a PaymentEvent, which may repeat or arrive out of order.

/** Card, or Instant EFT ("Pay by Bank" at Stitch). */
export type PaymentMethod = "card" | "pay_by_bank";

export type CreateCollection = {
  id: string;
  amountCents: number;
  methods: PaymentMethod[];
  /** At most 12 characters, on the Client's bank statement. */
  payerReference: string;
  /** At most 20 characters. */
  beneficiaryReference: string;
  returnUrl: string;
};

export type Collection = {
  id: string;
  amountCents: number;
  state: "pending" | "succeeded" | "failed";
  method: PaymentMethod | null;
};

export type CreateRefund = {
  id: string;
  collectionId: string;
  amountCents: number;
  reason: string;
};

export type Refund = {
  id: string;
  collectionId: string;
  amountCents: number;
  state: "pending" | "succeeded" | "failed" | "paused";
};

export type BankAccount = {
  accountHolder: string;
  accountNumber: string;
  branchCode: string;
};

export type VerifyBankAccount = BankAccount & {
  /** South African ID number, or passport number and issuing country. */
  identityNumber: string;
  surname: string;
  initials: string;
};

export type BankAccountVerification =
  | { state: "pending" }
  | {
      state: "done";
      accountOpen: boolean;
      acceptsCredits: boolean;
      identityMatch: boolean;
      surnameMatch: boolean;
      initialsMatch: boolean;
    };

export type CreatePayout = {
  id: string;
  amountCents: number;
  bankAccount: BankAccount;
  /** At most 20 characters, on the Artisan's bank statement. */
  beneficiaryReference: string;
};

export type PayoutCreated = { state: "pending" } | { state: "refused"; reason: string };

export type Payout = {
  id: string;
  amountCents: number;
  state: "pending" | "succeeded" | "failed" | "reversed" | "paused" | "refused";
};

export type PayoutFailure =
  | "invalid_account"
  | "inactive_account"
  | "restricted_account"
  | "exceeded_limit"
  | "bank_processing_error";

export type ChargebackOutcome = "won" | "lost" | "accepted" | "partially_accepted";

export type PaymentEventData =
  | {
      type: "collection.succeeded";
      collectionId: string;
      amountCents: number;
      method: PaymentMethod;
    }
  | { type: "collection.failed"; collectionId: string; reason: "failed" | "cancelled" | "expired" }
  | { type: "refund.succeeded"; refundId: string; collectionId: string; amountCents: number }
  | { type: "refund.failed"; refundId: string; collectionId: string; reason: string }
  | { type: "refund.paused"; refundId: string; collectionId: string }
  | { type: "payout.succeeded"; payoutId: string; amountCents: number }
  | { type: "payout.failed"; payoutId: string; reason: PayoutFailure }
  | { type: "payout.reversed"; payoutId: string; amountCents: number; reason: string }
  | { type: "payout.paused"; payoutId: string }
  | { type: "chargeback.opened"; collectionId: string; amountCents: number; evidenceDueAt: Date }
  | {
      type: "chargeback.closed";
      collectionId: string;
      outcome: ChargebackOutcome;
      reversedCents: number;
    };

/** Every event has an id to dedupe on and the time it happened. */
export type PaymentEvent = PaymentEventData & { eventId: string; occurredAt: Date };

export type Webhook = {
  body: string;
  headers: Record<string, string>;
};

export type PaymentAdapter = {
  /** The redirect back from the checkout is not proof of payment; the event is. */
  createCollection(collection: CreateCollection): Promise<{ checkoutUrl: string }>;
  getCollection(id: string): Promise<Collection | null>;
  /** One Refund at a time per collection, never above what is left of it. */
  refund(refund: CreateRefund): Promise<Refund>;
  getRefund(id: string): Promise<Refund | null>;
  /** May stay pending for up to 120 seconds. */
  verifyBankAccount(account: VerifyBankAccount): Promise<BankAccountVerification>;
  /** May be refused at once, for a bad check digit. */
  createPayout(payout: CreatePayout): Promise<PayoutCreated>;
  getPayout(id: string): Promise<Payout | null>;
  getFloatBalance(): Promise<{ cents: number }>;
  /** The event, if the webhook is signed by the provider; otherwise null. */
  verifyWebhook(webhook: Webhook): Promise<PaymentEvent | null>;
};
