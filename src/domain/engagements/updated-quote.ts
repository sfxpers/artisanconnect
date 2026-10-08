import { and, eq, exists, inArray, sql, type SQL } from "drizzle-orm";
import { system, type Actor } from "../actor";
import { publicName } from "../accounts/names";
import { firstProblem } from "../accounts/inputs";
import { frozenRefusal, isFrozen, notFrozen } from "../chargebacks";
import type { Context, Write } from "../context";
import { causedBy } from "../errors";
import { insertWhile } from "../guarded";
import { engagementMoney, LEDGER_KINDS, ledgerWrites, paymentInRows, releaseRows } from "../ledger";
import { formatRands, PROTECTION_FEE_PERCENT, protectionFeeCents } from "../money";
import type { PaymentEvent, PaymentMethod } from "../ports";
import { bankReference } from "../references";
import { ok, refuse } from "../result";
import { formatDay, saDay } from "../sa-days";
import {
  accounts,
  completions,
  engagements,
  payments,
  quotes,
  updatedQuotes,
  type ENGAGEMENT_STATES,
} from "../schema";
import { recordSighting, type Seen } from "../signals";
import { emailTells, tellWhile, tellWithEmailWhile } from "../tells";
import { heldCompletionOf } from "./completion";
import { updatedQuoteFields, type UpdatedQuoteFields } from "./inputs";
import {
  notHiredWrites,
  openCollection,
  paymentRow,
  refundWhole,
  type PaymentRow,
} from "./payments-in";
import { engagementRow, type EngagementRow } from "./rows";
import {
  isBeforeCompletion,
  priceNow,
  proposedOf,
  stillProposed,
  updatedQuoteRow,
  type UpdatedQuoteRow,
} from "./updated-quote-rows";

// Updated Quote (#134, ADR 0019): before Completion the Artisan may propose
// new Labour and Materials when the site differs, neither lower, one at a
// time, and may withdraw it. The Client accepts by paying the difference plus
// its Protection Fee through checkout, or rejects it, and the price stands.
// Only the collection's event accepts it (ADR 0002): a Payment arriving once
// it is no longer proposed is refunded whole, as a Hire's is. Its money is
// paid in as more of the Engagement's Labour and Materials, so it is released
// and refunded with them: extra Materials at once if work has started,
// otherwise at Work started; extra Labour at Approval; each at the Artisan
// Fee fixed at Hire.

type EngagementState = (typeof ENGAGEMENT_STATES)[number];

/**
 * The Artisan proposes new Labour and Materials on their Engagement, neither
 * lower than now and not both the same. The Client is told what to pay.
 */
export async function proposeUpdatedQuote(
  ctx: Context,
  actor: Actor,
  input: { engagementId: string } & UpdatedQuoteFields,
) {
  const engagement = await engagementRow(ctx, input.engagementId);
  if (actor.kind !== "artisan" || !engagement || engagement.artisanId !== actor.accountId) {
    return refuse("not-found", "That Engagement does not exist.");
  }
  const parsed = updatedQuoteFields.safeParse({
    labour: input.labour,
    materials: input.materials,
  });
  if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
  if (!isBeforeCompletion(engagement.state) || (await heldCompletionOf(ctx, engagement.id))) {
    return notBeforeCompletion(engagement.state);
  }
  // Not while a Chargeback freezes it (#137), which ended any that was proposed.
  if (await isFrozen(ctx, engagement.id)) return frozenRefusal();
  if (await proposedOf(ctx, engagement.id)) return alreadyProposed();
  const now = priceNow(await engagementMoney(ctx, engagement.id));
  const from = { labour: now.labourCents, materials: now.materialsCents };
  const to = parsed.data;
  if (to.labour < from.labour) {
    return refuse(
      "lower",
      `The Labour cannot go down: it is ${formatRands(from.labour)} now. To lower the price, refund it.`,
    );
  }
  if (to.materials < from.materials) {
    return refuse(
      "lower",
      `The Materials cannot go down: they are ${formatRands(from.materials)} now. To lower the price, refund them.`,
    );
  }
  if (to.materials > from.materials && (await materialsBy(ctx, engagement)) === "client") {
    return refuse(
      "client-supplies",
      "The Client supplies the materials on this Job, so the Materials stay at zero.",
    );
  }
  const addsCents = to.labour + to.materials - from.labour - from.materials;
  if (addsCents === 0) {
    return refuse("no-change", "Raise the Labour, the Materials, or both.");
  }
  const updatedQuoteId = ctx.newId();
  try {
    await ctx.commit([
      // Only while the Engagement is as read, with no Completion being checked.
      insertWhile(
        ctx,
        updatedQuotes,
        {
          id: updatedQuoteId,
          engagementId: engagement.id,
          fromLabourCents: from.labour,
          fromMaterialsCents: from.materials,
          labourCents: to.labour,
          materialsCents: to.materials,
          state: "proposed",
          proposedAt: ctx.now(),
          answeredAt: null,
        },
        and(
          engagementIs(ctx, engagement.id, engagement.state),
          sql`not exists (select 1 from ${completions} where ${completions.engagementId} = ${engagement.id} and ${completions.state} = 'held')`,
          notFrozen(ctx, engagement.id),
        )!,
      ),
      ...tellWhile(
        ctx,
        actor,
        [engagement.clientId],
        {
          event: "updated-quote.proposed",
          title: `The Artisan proposed an Updated Quote. Pay the difference, ${formatRands(addsCents + protectionFeeCents(addsCents))} with its Protection Fee, to accept it: ${engagement.jobTitle}`,
          link: `/jobs/${engagement.jobId}`,
        },
        stillProposed(ctx, updatedQuoteId),
      ),
    ]);
  } catch (error) {
    // Another was proposed between the read and the batch, as a second tap's would be.
    if (causedBy(error, "UNIQUE constraint failed: updated_quotes")) return alreadyProposed();
    throw error;
  }
  if (!(await updatedQuoteRow(ctx, updatedQuoteId))) {
    return notBeforeCompletion((await engagementRow(ctx, engagement.id))!.state);
  }
  await emailTells(ctx).catch((error: unknown) => {
    console.error("Tell emails did not go", error);
  });
  return ok({ updatedQuoteId });
}

/** The Artisan withdraws their proposed Updated Quote; the Client is told. */
export async function withdrawUpdatedQuote(
  ctx: Context,
  actor: Actor,
  input: { updatedQuoteId: string },
) {
  const found = await withEngagement(ctx, input.updatedQuoteId);
  if (actor.kind !== "artisan" || !found || found.engagement.artisanId !== actor.accountId) {
    return notFound();
  }
  return answer(ctx, actor, found, "withdrawn", {
    to: found.engagement.clientId,
    title: "The Artisan withdrew their Updated Quote",
  });
}

/** The Client rejects the proposed Updated Quote, and the price stands; the Artisan is told. */
export async function rejectUpdatedQuote(
  ctx: Context,
  actor: Actor,
  input: { updatedQuoteId: string },
) {
  const found = await withEngagement(ctx, input.updatedQuoteId);
  if (actor.kind !== "client" || !found || found.engagement.clientId !== actor.accountId) {
    return notFound();
  }
  return answer(ctx, actor, found, "rejected", {
    to: found.engagement.artisanId,
    title: "The Client rejected your Updated Quote, so the price stays as it was",
  });
}

/**
 * Opens a checkout for the Client to accept the proposed Updated Quote: its
 * difference plus the Protection Fee, which the Client has acknowledged is
 * not refunded. Nothing changes until the money arrives.
 */
export async function acceptUpdatedQuote(
  ctx: Context,
  actor: Actor,
  input: { updatedQuoteId: string; feeAcknowledged: boolean } & Seen,
) {
  const found = await withEngagement(ctx, input.updatedQuoteId);
  if (actor.kind !== "client" || !found || found.engagement.clientId !== actor.accountId) {
    return notFound();
  }
  const { updatedQuote, engagement } = found;
  if (updatedQuote.state !== "proposed" || !isBeforeCompletion(engagement.state)) {
    return notProposed();
  }
  if (await isFrozen(ctx, engagement.id)) return frozenRefusal();
  if (input.feeAcknowledged !== true) {
    return refuse(
      "fee-not-acknowledged",
      "Tick that the Protection Fee is not refunded, to pay for this Updated Quote.",
    );
  }
  const adds = addsOf(updatedQuote);
  const feeCents = protectionFeeCents(adds.totalCents);
  const payment = {
    id: ctx.newId(),
    clientId: engagement.clientId,
    jobId: engagement.jobId,
    quoteId: engagement.quoteId,
    updatedQuoteId: updatedQuote.id,
    quoteRevisedAt: null,
    labourCents: adds.labourCents,
    materialsCents: adds.materialsCents,
    protectionFeeCents: feeCents,
    amountCents: adds.totalCents + feeCents,
    state: "open" as const,
    openedAt: ctx.now(),
  };
  // Written first, so its event always finds it.
  await ctx.db.insert(payments).values(payment);
  await recordSighting(ctx, engagement.clientId, input, "payment");
  return ok({ checkoutUrl: await openCollection(ctx, payment) });
}

/**
 * An Updated Quote's collection that succeeded: it is accepted now if it is
 * still proposed before Completion, and otherwise the whole Payment,
 * Protection Fee included, is refunded. A repeated event changes nothing.
 */
export async function updatedQuotePaid(
  ctx: Context,
  event: Extract<PaymentEvent, { type: "collection.succeeded" }>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const payment = await paymentRow(ctx, event.collectionId);
    if (!payment?.updatedQuoteId || payment.state === "paid") return;
    if (payment.state === "not-hired") return refundWhole(ctx, payment);
    const found = await withEngagement(ctx, payment.updatedQuoteId);
    if (!found) throw new Error(`Payment ${payment.id} has no Updated Quote`);
    const { updatedQuote, engagement } = found;
    if (updatedQuote.state !== "proposed" || !isBeforeCompletion(engagement.state)) {
      try {
        await ctx.commit(
          notHiredWrites(
            ctx,
            payment,
            { id: engagement.jobId, title: engagement.jobTitle },
            "updated-quote-ended",
          ),
        );
      } catch (error) {
        // Another event of it settled the Payment meanwhile: read it again.
        if (causedBy(error, "a Payment cannot change that way")) continue;
        throw error;
      }
      return refundWhole(ctx, (await paymentRow(ctx, payment.id))!);
    }
    await ctx.commit(await acceptWrites(ctx, payment, updatedQuote, engagement, event.method));
    // What the batch read changed meanwhile, so it wrote nothing: read it again.
    if ((await paymentRow(ctx, payment.id))?.state !== "paid") continue;
    await emailTells(ctx).catch((error: unknown) => {
      console.error("Tell emails did not go", error);
    });
    return;
  }
  throw new Error(`Payment ${event.collectionId} kept changing while it arrived`);
}

/**
 * The writes of an Updated Quote's acceptance, in one batch, each only while
 * it is still proposed, the Engagement as read, and the Payment unsettled:
 * the difference paid in, with its Protection Fee, in the ledger; after Work
 * started, the Release of the extra Materials; the Artisan told; the Client's
 * Receipt; and the Payment and the Updated Quote settled, last, as the
 * others read them.
 */
async function acceptWrites(
  ctx: Context,
  payment: PaymentRow,
  updatedQuote: UpdatedQuoteRow,
  engagement: EngagementRow,
  method: PaymentMethod,
): Promise<Write[]> {
  const now = ctx.now();
  const accepting = and(
    stillProposed(ctx, updatedQuote.id),
    engagementIs(ctx, engagement.id, engagement.state),
  )!;
  const unsettled = and(
    accepting,
    exists(
      ctx.db
        .select({ one: sql`1` })
        .from(payments)
        .where(and(eq(payments.id, payment.id), inArray(payments.state, ["open", "failed"]))),
    ),
  )!;
  // Work started already released the Materials: the extra ones go now.
  const releasedNow = engagement.workStartedAt !== null ? payment.materialsCents : 0;
  const adds = formatRands(payment.labourCents + payment.materialsCents);
  return [
    ...ledgerWrites(
      ctx,
      [
        ...paymentInRows(payment, engagement.id),
        ...releaseRows(engagement, LEDGER_KINDS.materialsReleased, releasedNow),
      ],
      unsettled,
    ),
    ...tellWhile(
      ctx,
      system,
      [engagement.artisanId],
      {
        event: "updated-quote.accepted",
        title:
          releasedNow > 0
            ? `The Client accepted your Updated Quote and paid the difference, ${adds}. The extra Materials were released: ${engagement.jobTitle}`
            : `The Client accepted your Updated Quote and paid the difference, ${adds}: ${engagement.jobTitle}`,
        link: `/jobs/${engagement.jobId}`,
      },
      unsettled,
    ),
    tellWithEmailWhile(
      ctx,
      engagement.clientId,
      {
        event: "payment.receipt",
        title: `Receipt for your Updated Quote's Payment: ${engagement.jobTitle}`,
        link: `/jobs/${engagement.jobId}`,
        body: await receiptText(ctx, payment, updatedQuote, engagement, now),
      },
      unsettled,
    ),
    ctx.db
      .update(payments)
      .set({ state: "paid", method, settledAt: now })
      .where(
        and(eq(payments.id, payment.id), inArray(payments.state, ["open", "failed"]), accepting),
      ),
    ctx.db
      .update(updatedQuotes)
      .set({ state: "accepted", answeredAt: now })
      .where(
        and(
          eq(updatedQuotes.id, updatedQuote.id),
          eq(updatedQuotes.state, "proposed"),
          exists(
            ctx.db
              .select({ one: sql`1` })
              .from(payments)
              .where(
                and(
                  eq(payments.id, payment.id),
                  eq(payments.state, "paid"),
                  eq(payments.settledAt, now),
                ),
              ),
          ),
        ),
      ),
  ];
}

/**
 * The write that ends the Engagement's proposed Updated Quote, if any, with
 * its Cancellation, while the condition holds: a Payment of it that arrives
 * later is refunded whole.
 */
export function endProposedWrite(ctx: Context, engagementId: string, condition: SQL): Write {
  return ctx.db
    .update(updatedQuotes)
    .set({ state: "ended", answeredAt: ctx.now() })
    .where(
      and(
        eq(updatedQuotes.engagementId, engagementId),
        eq(updatedQuotes.state, "proposed"),
        condition,
      ),
    );
}

/** The Engagement's Updated Quotes, oldest first. */
export async function updatedQuotesOf(ctx: Context, engagementId: string) {
  return ctx.db
    .select()
    .from(updatedQuotes)
    .where(eq(updatedQuotes.engagementId, engagementId))
    .orderBy(updatedQuotes.proposedAt, sql`${updatedQuotes}.rowid`);
}

/** What an Updated Quote adds to each line, and in all. */
export function addsOf(updatedQuote: UpdatedQuoteRow) {
  const labourCents = updatedQuote.labourCents - updatedQuote.fromLabourCents;
  const materialsCents = updatedQuote.materialsCents - updatedQuote.fromMaterialsCents;
  return { labourCents, materialsCents, totalCents: labourCents + materialsCents };
}

/**
 * The Client's Receipt for an Updated Quote's Payment: the new price, up from
 * the price before it, each line, the difference paid, and its Protection
 * Fee. Not a tax invoice.
 */
async function receiptText(
  ctx: Context,
  payment: PaymentRow,
  updatedQuote: UpdatedQuoteRow,
  engagement: EngagementRow,
  paidAt: Date,
) {
  const [hired] = await ctx.db
    .select({
      name: accounts.name,
      tradingName: accounts.tradingName,
      namesShown: accounts.namesShown,
      vatNumber: quotes.vatNumber,
    })
    .from(quotes)
    .innerJoin(accounts, eq(accounts.id, quotes.artisanId))
    .where(eq(quotes.id, engagement.quoteId));
  const line = (label: string, to: number, from: number) =>
    to > from
      ? `${label}: ${formatRands(to)}, up ${formatRands(to - from)}`
      : `${label}: ${formatRands(to)}, as before`;
  // A Refund made while it waited lowered the price it raises from.
  const before = priceNow(await engagementMoney(ctx, engagement.id));
  const adds = addsOf(updatedQuote);
  const fromLabourCents = before.labourCents;
  const fromMaterialsCents = before.materialsCents;
  const labourCents = fromLabourCents + adds.labourCents;
  const materialsCents = fromMaterialsCents + adds.materialsCents;
  return [
    "Receipt for your Updated Quote's Payment on ArtisanConnect.",
    "",
    `Job: ${engagement.jobTitle}`,
    `Artisan: ${hired?.namesShown ? publicName(hired) : "your Artisan"}`,
    `Paid on: ${formatDay(saDay(paidAt))}`,
    `Reference: ${bankReference(payment.id)}`,
    "",
    `Updated Quote: ${formatRands(labourCents + materialsCents)}, up from ${formatRands(fromLabourCents + fromMaterialsCents)}`,
    line("Labour", labourCents, fromLabourCents),
    line("Materials", materialsCents, fromMaterialsCents),
    `Difference: ${formatRands(payment.labourCents + payment.materialsCents)}`,
    `Protection Fee (${PROTECTION_FEE_PERCENT}%, not refunded): ${formatRands(payment.protectionFeeCents)}`,
    `Total paid: ${formatRands(payment.amountCents)}`,
    "",
    ...(hired?.vatNumber
      ? [`The Quote's amounts include VAT (VAT number ${hired.vatNumber}).`]
      : []),
    "This Receipt is not a tax invoice.",
  ].join("\n");
}

/**
 * Withdraws or rejects the proposed Updated Quote, telling the other party,
 * only if it is still proposed when the batch runs.
 */
async function answer(
  ctx: Context,
  actor: Actor,
  { updatedQuote, engagement }: NonNullable<Awaited<ReturnType<typeof withEngagement>>>,
  state: "withdrawn" | "rejected",
  told: { to: string; title: string },
) {
  if (updatedQuote.state !== "proposed") return notProposed();
  const now = ctx.now();
  await ctx.commit([
    ctx.db
      .update(updatedQuotes)
      .set({ state, answeredAt: now })
      .where(and(eq(updatedQuotes.id, updatedQuote.id), eq(updatedQuotes.state, "proposed"))),
    ...tellWhile(
      ctx,
      actor,
      [told.to],
      {
        event: `updated-quote.${state}`,
        title: `${told.title}: ${engagement.jobTitle}`,
        link: `/jobs/${engagement.jobId}`,
      },
      exists(
        ctx.db
          .select({ one: sql`1` })
          .from(updatedQuotes)
          .where(
            and(
              eq(updatedQuotes.id, updatedQuote.id),
              eq(updatedQuotes.state, state),
              eq(updatedQuotes.answeredAt, now),
            ),
          ),
      ),
    ),
  ]);
  // Answered, or paid for, between the read and the batch, which then changed nothing.
  const after = await updatedQuoteRow(ctx, updatedQuote.id);
  if (after?.state !== state || after.answeredAt?.getTime() !== now.getTime()) {
    return notProposed();
  }
  await emailTells(ctx).catch((error: unknown) => {
    console.error("Tell emails did not go", error);
  });
  return ok(null);
}

/** The Updated Quote with its Engagement; null if there is none. */
async function withEngagement(ctx: Context, updatedQuoteId: string) {
  const updatedQuote = await updatedQuoteRow(ctx, updatedQuoteId);
  const engagement = updatedQuote && (await engagementRow(ctx, updatedQuote.engagementId));
  return updatedQuote && engagement ? { updatedQuote, engagement } : null;
}

/** Who supplies the materials on the Hired Quote. */
async function materialsBy(ctx: Context, engagement: EngagementRow) {
  const [row] = await ctx.db
    .select({ materialsBy: quotes.materialsBy })
    .from(quotes)
    .where(eq(quotes.id, engagement.quoteId));
  return row?.materialsBy;
}

/** The SQL that is true while the Engagement is in this state. */
function engagementIs(ctx: Context, engagementId: string, state: EngagementState) {
  return exists(
    ctx.db
      .select({ one: sql`1` })
      .from(engagements)
      .where(and(eq(engagements.id, engagementId), eq(engagements.state, state))),
  );
}

function notFound() {
  return refuse("not-found", "That Updated Quote does not exist.");
}

function notProposed() {
  return refuse("not-proposed", "This Updated Quote is no longer proposed.");
}

function alreadyProposed() {
  return refuse(
    "already-proposed",
    "Your Updated Quote is waiting for the Client. Withdraw it to propose another.",
  );
}

function notBeforeCompletion(state: EngagementState) {
  switch (state) {
    case "cancelled":
      return refuse("not-before-completion", "This Engagement is Cancelled.");
    case "disputed":
      return refuse("not-before-completion", "This Engagement is Disputed: the Admin decides it.");
    default:
      return refuse(
        "not-before-completion",
        "An Updated Quote can only be proposed before the work is marked complete.",
      );
  }
}
