import type { Context } from "../context";
import { refusalOf } from "./held";
import { revisionsStanding, type QuoteVersion } from "./revisions";
import type { QuoteRow } from "./rows";

// A Quote as the parties see it. The Artisan never sees the Protection Fee.

/**
 * The Artisan's own Quote on a Job: being checked, refused with the Admin's
 * reason, or Sent and after. Null if they have none, or one never Sent.
 */
export async function ownQuoteView(ctx: Context, quote: QuoteRow | null) {
  if (!quote || quote.state === "unsent") return null;
  const [reason, revisions] = await Promise.all([
    refusalOf(ctx, quote),
    revisionsStanding(ctx, quote.id),
  ]);
  return {
    quoteId: quote.id,
    state: quote.state,
    ...fieldsView(quote),
    sentAt: quote.sentAt,
    expiresAt: quote.expiresAt,
    revisedAt: quote.revisedAt,
    endedAt: quote.endedAt,
    /** Why the Admin refused it, once it was Held. */
    refused: reason === null ? null : { reason },
    /** A revision being checked, which only its Artisan and the Admin see, or one refused. */
    revision: {
      beingChecked: revisions.beingChecked && fieldsView(revisions.beingChecked),
      refused: revisions.refused && {
        ...fieldsView(revisions.refused),
        reason: revisions.refused.reason,
      },
    },
  };
}

/** What the Artisan gave, with its total. */
export function fieldsView(quote: QuoteVersion) {
  return {
    scope: quote.scope,
    labourCents: quote.labourCents,
    materialsCents: quote.materialsCents,
    totalCents: quote.labourCents + quote.materialsCents,
    materialsBy: quote.materialsBy,
    startOn: quote.startOn,
    durationDays: quote.durationDays,
    warranty: quote.warranty,
    /** Set if the Artisan is VAT-registered: the amounts include VAT. */
    vatNumber: quote.vatNumber,
  };
}
