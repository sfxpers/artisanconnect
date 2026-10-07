import { and, eq, inArray, sql } from "drizzle-orm";
import { system, type Actor } from "../actor";
import { publicName } from "../accounts/names";
import { isAlreadyDecided } from "../content/held";
import type { Context, Write } from "../context";
import { eventWrite } from "../conversations/rows";
import { causedBy } from "../errors";
import { insertWhile } from "../guarded";
import { addedBy, editsStanding, withdrawEdit } from "../jobs/edits";
import { jobRow, type JobRow } from "../jobs/rows";
import { discardFiles } from "../uploads";
import { ledgerWrites, LEDGER_KINDS, paymentInRows } from "../ledger";
import { formatRands, PROTECTION_FEE_PERCENT, protectionFeeCents } from "../money";
import type { PaymentEvent, PaymentMethod } from "../ports";
import { closeJobWrites } from "../quotes/ends";
import { startPassed, verifiedForJob } from "../quotes/rules";
import { isLive, quoteRow, type QuoteRow } from "../quotes/rows";
import { notHiredRefundWrite, sendRefunds } from "../refunds";
import { ok, refuse } from "../result";
import { saDay, formatDay } from "../sa-days";
import {
  accounts,
  authUsers,
  engagements,
  jobs,
  payments,
  quotes,
  type NOT_HIRED_REASONS,
} from "../schema";
import { emailAddress, emailTells, tell } from "../tells";

// Hire (#126, ADR 0004): the Client Hires a Sent Quote by paying for it, the
// Quote plus the Protection Fee, through the payment adapter's checkout. It
// is asked when the checkout opens and again when the money arrives (ADR
// 0002); only the collection's event Hires, never the redirect back.

type PaymentRow = typeof payments.$inferSelect;
type NotHiredReason = (typeof NOT_HIRED_REASONS)[number];

/** Card, or Instant EFT. */
const METHODS: PaymentMethod[] = ["card", "pay_by_bank"];

/**
 * Opens a checkout for the Client to Hire a Sent Quote on their Job: the
 * Quote as it stands now, plus the Protection Fee, which the Client has
 * acknowledged is not refunded. Nothing changes until the money arrives.
 */
export async function openCheckout(
  ctx: Context,
  actor: Actor,
  input: { quoteId: string; feeAcknowledged: boolean },
) {
  const quote = await quoteRow(ctx, input.quoteId);
  const job = quote && (await jobRow(ctx, quote.jobId));
  if (actor.kind !== "client" || !quote || !job || job.clientId !== actor.accountId) {
    return refuse("not-found", "That Quote does not exist.");
  }
  if (!isLive(quote) || quote.state !== "sent") {
    return refuse("not-sent", "Only a Sent Quote can be Hired.");
  }
  // Its start date is the Artisan's commitment (ADR 0004), so a passed one is
  // revised first. Asked only now: one passing while the Client pays stands.
  if (startPassed(ctx, quote.startOn)) {
    return refuse(
      "start-passed",
      "This Quote's start date has passed. Ask the Artisan to revise it in your Conversation, then Hire it.",
    );
  }
  if (input.feeAcknowledged !== true) {
    return refuse(
      "fee-not-acknowledged",
      "Tick that the Protection Fee is not refunded, to pay for this Quote.",
    );
  }
  // Not while either is Suspended, too, once there are Suspensions (#136).
  if (!(await verifiedForJob(ctx, quote.artisanId, job))) {
    return refuse(
      "not-verified",
      "This Artisan is not verified for this trade now, so their Quote cannot be Hired.",
    );
  }
  const totalCents = quote.labourCents + quote.materialsCents;
  const feeCents = protectionFeeCents(totalCents);
  const payment = {
    id: ctx.newId(),
    clientId: job.clientId,
    jobId: job.id,
    quoteId: quote.id,
    quoteRevisedAt: quote.revisedAt,
    labourCents: quote.labourCents,
    materialsCents: quote.materialsCents,
    protectionFeeCents: feeCents,
    amountCents: totalCents + feeCents,
    state: "open" as const,
    openedAt: ctx.now(),
  };
  // Written first, so its event always finds it.
  await ctx.db.insert(payments).values(payment);
  const { checkoutUrl } = await ctx.ports.payments.createCollection({
    id: payment.id,
    amountCents: payment.amountCents,
    methods: METHODS,
    payerReference: paymentReference(payment.id),
    beneficiaryReference: `ArtisanConnect ${shortId(payment.id)}`.slice(0, 20),
    returnUrl: new URL(`/jobs/${job.id}`, ctx.config.appUrl).href,
  });
  return ok({ checkoutUrl });
}

/**
 * A collection that succeeded: the Hire happens now if it still can, and
 * otherwise the whole Payment, Protection Fee included, is refunded, as no
 * Hire happened. A repeated event changes nothing.
 */
export async function collectionSucceeded(
  ctx: Context,
  event: Extract<PaymentEvent, { type: "collection.succeeded" }>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const payment = await paymentRow(ctx, event.collectionId);
    // Not a Hire's: an Updated Quote's comes with its ticket (#134).
    if (!payment || payment.state === "paid") return;
    if (payment.state === "not-hired") return refundWhole(ctx, payment);
    const quote = await quoteRow(ctx, payment.quoteId);
    const job = await jobRow(ctx, payment.jobId);
    if (!quote || !job) throw new Error(`Payment ${payment.id} has no Quote or Job`);
    const reason = await notHiredReason(ctx, payment, quote, job);
    const { beingChecked } = await editsStanding(ctx, job.id);
    try {
      await ctx.commit(
        reason
          ? await notHiredWrites(ctx, payment, job, reason)
          : await hireWrites(ctx, payment, quote, job, event.method, beingChecked),
      );
    } catch (error) {
      // What the batch read changed meanwhile, which aborted it: read it again.
      if (isRaced(error)) continue;
      throw error;
    }
    if (reason) return refundWhole(ctx, (await paymentRow(ctx, payment.id))!);
    // An edit waiting on the Job was withdrawn: what it added is nobody's now.
    if (beingChecked) await discardFiles(ctx, addedBy(beingChecked, job));
    await emailTells(ctx).catch((error: unknown) => {
      console.error("Tell emails did not go", error);
    });
    return;
  }
  throw new Error(`Payment ${event.collectionId} kept changing while it arrived`);
}

/** A collection that failed or was abandoned changes nothing but the Payment. */
export async function collectionFailed(
  ctx: Context,
  event: Extract<PaymentEvent, { type: "collection.failed" }>,
) {
  await ctx.db
    .update(payments)
    .set({ state: "failed", settledAt: ctx.now() })
    .where(and(eq(payments.id, event.collectionId), eq(payments.state, "open")));
}

/** Why the Payment cannot Hire its Quote now; null if it can. */
async function notHiredReason(
  ctx: Context,
  payment: PaymentRow,
  quote: QuoteRow,
  job: JobRow,
): Promise<NotHiredReason | null> {
  if (quote.state !== "sent" || (job.state !== "open" && job.state !== "expired")) {
    return "quote-ended";
  }
  if (quote.revisedAt?.getTime() !== payment.quoteRevisedAt?.getTime()) return "quote-changed";
  // Not while either is Suspended, too, once there are Suspensions (#136).
  if (!(await verifiedForJob(ctx, quote.artisanId, job))) return "not-verified";
  return null;
}

/**
 * The writes of the Hire, in one batch: the Engagement, with the Artisan Fee
 * fixed now; the Payment and the Protection Fee in the ledger; the Quote and
 * the Job Hired, shown in their Conversation; every other Quote ended, their
 * Artisans told; the Artisan told; and the Client's Receipt. The Engagement is written only while the
 * Payment, Quote, and Job are as read, and the ledger rows name it, so a
 * change meanwhile aborts the whole batch.
 */
async function hireWrites(
  ctx: Context,
  payment: PaymentRow,
  quote: QuoteRow,
  job: JobRow,
  method: PaymentMethod,
  beingChecked: { id: string } | null,
): Promise<Write[]> {
  const now = ctx.now();
  const engagementId = ctx.newId();
  return [
    insertWhile(
      ctx,
      engagements,
      {
        id: engagementId,
        jobId: job.id,
        quoteId: quote.id,
        paymentId: payment.id,
        clientId: job.clientId,
        artisanId: quote.artisanId,
        state: "paid",
        artisanFeePercent: await artisanFeePercentOf(ctx, job.clientId, quote.artisanId),
        hiredAt: now,
        startClaimedAt: null,
        workStartedAt: null,
        workStartedBy: null,
        completedAt: null,
      },
      and(
        sql`exists (select 1 from ${payments} where ${payments.id} = ${payment.id} and ${inArray(payments.state, ["open", "failed"])})`,
        sql`exists (select 1 from ${quotes} where ${quotes.id} = ${quote.id} and ${quotes.state} = 'sent' and ${quotes.revisedAt} is ${payment.quoteRevisedAt?.getTime() ?? null})`,
        sql`exists (select 1 from ${jobs} where ${jobs.id} = ${job.id} and ${inArray(jobs.state, ["open", "expired"])})`,
      )!,
    ),
    // These name the Engagement, so they abort the batch if it was not written.
    ...ledgerWrites(ctx, paymentInRows(payment, engagementId)),
    ctx.db
      .update(payments)
      .set({ state: "paid", method, settledAt: now })
      .where(eq(payments.id, payment.id)),
    ctx.db.update(quotes).set({ state: "hired" }).where(eq(quotes.id, quote.id)),
    ctx.db.update(jobs).set({ state: "hired", updatedAt: now }).where(eq(jobs.id, job.id)),
    eventWrite(
      ctx,
      { jobId: job.id, artisanId: quote.artisanId },
      "hire",
      sql`exists (select 1 from ${engagements} where ${engagements.id} = ${engagementId})`,
    ),
    ...(await closeJobWrites(ctx, system, job, { quoteId: quote.id })),
    // An edit waiting on a Hired Job has nothing to show on.
    ...(beingChecked ? await withdrawEdit(ctx, beingChecked.id) : []),
    ...tell(ctx, system, [quote.artisanId], {
      event: "engagement.hired",
      title: `You were Hired: ${job.title}`,
      link: `/jobs/${job.id}`,
    }),
    emailAddress(ctx, await emailOf(ctx, job.clientId), {
      event: "payment.receipt",
      title: `Receipt for your Payment: ${job.title}`,
      link: `/jobs/${job.id}`,
      body: await receiptText(ctx, payment, quote, job, now),
    }),
  ];
}

/**
 * The writes of a Payment that arrived but Hires nobody: it and its
 * Protection Fee in the ledger, owed back whole, and the Client told why.
 * The Refund itself is asked of the adapter once they are written.
 */
async function notHiredWrites(
  ctx: Context,
  payment: PaymentRow,
  job: JobRow,
  reason: NotHiredReason,
): Promise<Write[]> {
  const refundId = ctx.newId();
  return [
    // Unguarded on purpose: on a Payment no longer open or failed a trigger aborts the batch.
    ctx.db
      .update(payments)
      .set({ state: "not-hired", notHiredFor: reason, refundId, settledAt: ctx.now() })
      .where(eq(payments.id, payment.id)),
    notHiredRefundWrite(ctx, refundId, payment),
    ...ledgerWrites(ctx, [
      ...paymentInRows(payment, null),
      {
        kind: LEDGER_KINDS.refundOwed,
        amountCents: payment.amountCents,
        paymentId: payment.id,
        engagementId: null,
      },
    ]),
    ...tell(ctx, system, [payment.clientId], {
      event: "payment.not-hired",
      title: `Your Payment will be refunded, as no Hire happened: ${job.title}`,
      link: `/jobs/${job.id}`,
    }),
  ];
}

/**
 * Sends the Refund of a Payment that Hired nobody, whole, if the adapter
 * does not have it yet: a repeated event sends it if the first send never
 * reached the adapter. Its events are a Refund's as any other (#132).
 */
async function refundWhole(ctx: Context, payment: PaymentRow) {
  await sendRefunds(ctx, payment.id);
  await emailTells(ctx).catch((error: unknown) => {
    console.error("Tell emails did not go", error);
  });
}

/**
 * The Artisan Fee a Hire fixes: 10%, or 5% if the Client Relationship
 * already has a Completed Engagement (ADR 0009).
 */
async function artisanFeePercentOf(ctx: Context, clientId: string, artisanId: string) {
  const [completed] = await ctx.db
    .select({ id: engagements.id })
    .from(engagements)
    .where(
      and(
        eq(engagements.clientId, clientId),
        eq(engagements.artisanId, artisanId),
        eq(engagements.state, "completed"),
      ),
    )
    .limit(1);
  return completed ? 5 : 10;
}

/** The Client's Receipt for a Payment: not a tax invoice. */
async function receiptText(
  ctx: Context,
  payment: PaymentRow,
  quote: QuoteRow,
  job: JobRow,
  paidAt: Date,
) {
  const [artisan] = await ctx.db
    .select({
      name: accounts.name,
      tradingName: accounts.tradingName,
      namesShown: accounts.namesShown,
    })
    .from(accounts)
    .where(eq(accounts.id, quote.artisanId));
  const totalCents = payment.labourCents + payment.materialsCents;
  return [
    "Receipt for your Payment on ArtisanConnect.",
    "",
    `Job: ${job.title}`,
    `Artisan: ${artisan?.namesShown ? publicName(artisan) : "your Artisan"}`,
    `Paid on: ${formatDay(saDay(paidAt))}`,
    `Reference: ${paymentReference(payment.id)}`,
    "",
    `Quote: ${formatRands(totalCents)} (Labour ${formatRands(payment.labourCents)}, Materials ${formatRands(payment.materialsCents)})`,
    `Protection Fee (${PROTECTION_FEE_PERCENT}%, not refunded): ${formatRands(payment.protectionFeeCents)}`,
    `Total paid: ${formatRands(payment.amountCents)}`,
    "",
    ...(quote.vatNumber
      ? [`The Quote's amounts include VAT (VAT number ${quote.vatNumber}).`]
      : []),
    "This Receipt is not a tax invoice.",
  ].join("\n");
}

/** The Payment by our id; null if there is none. */
async function paymentRow(ctx: Context, paymentId: string) {
  const [row] = await ctx.db.select().from(payments).where(eq(payments.id, paymentId));
  return row ?? null;
}

async function emailOf(ctx: Context, accountId: string) {
  const [row] = await ctx.db
    .select({ email: authUsers.email })
    .from(authUsers)
    .where(eq(authUsers.id, accountId));
  if (!row) throw new Error(`Account ${accountId} has no Email`);
  return row.email;
}

/** On the Client's bank statement: at most 12 characters. */
function paymentReference(paymentId: string) {
  return `AC ${shortId(paymentId)}`;
}

function shortId(id: string) {
  return id.replaceAll("-", "").slice(0, 8).toUpperCase();
}

/** Whether a batch aborted because what it read changed before it ran. */
function isRaced(error: unknown) {
  return (
    causedBy(error, "FOREIGN KEY constraint failed") ||
    causedBy(error, "UNIQUE constraint failed: engagements") ||
    causedBy(error, "cannot change that way") ||
    isAlreadyDecided(error)
  );
}
