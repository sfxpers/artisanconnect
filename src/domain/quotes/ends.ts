import { and, eq, exists, sql } from "drizzle-orm";
import type { Actor } from "../actor";
import type { ClockHandler } from "../clocks";
import type { Context, Write } from "../context";
import { jobRow } from "../jobs/rows";
import { quotes } from "../schema";
import { tellWhile } from "../tells";
import { withdrawHeldQuote } from "./held";
import { withdrawRevisionWrites } from "./revisions";
import { EXPIRY_CLOCK, quoteRow } from "./rows";

// How a Sent Quote ends before Hire: Declined by the Client, or when the
// Client closes the Job; Withdrawn by its Artisan; or Expired 14 days after
// it was Sent. Each ending tells the other party, and only if it landed.

type Ending = "declined" | "withdrawn" | "expired";

/**
 * The writes that end a Sent Quote this way, guarded on its still being
 * Sent, and the Tell to whoever the ending is news to, only if it ended now.
 * The first returns the Quote's id if it ended.
 */
export function endWrites(
  ctx: Context,
  actor: Actor,
  quote: { id: string },
  ending: Ending,
  told: { to: string; title: string; link: string },
) {
  const now = ctx.now();
  return [
    ctx.db
      .update(quotes)
      .set({ state: ending, endedAt: now })
      .where(and(eq(quotes.id, quote.id), eq(quotes.state, "sent")))
      .returning({ id: quotes.id }),
    ...tellWhile(
      ctx,
      actor,
      [told.to],
      { event: `quote.${ending}`, title: told.title, link: told.link },
      exists(
        ctx.db
          .select({ one: sql`1` })
          .from(quotes)
          .where(and(eq(quotes.id, quote.id), eq(quotes.state, ending), eq(quotes.endedAt, now))),
      ),
    ),
  ] as const;
}

/**
 * The writes that end every Quote on a Job the Client closes: each Sent one
 * is Declined and its Artisan told, and each Held one, or Held revision,
 * leaves the Admin's queue. A decision recorded on one meanwhile aborts the batch.
 */
export async function closeJobWrites(
  ctx: Context,
  actor: Actor,
  job: { id: string; title: string },
): Promise<Write[]> {
  const onJob = await ctx.db
    .select({ id: quotes.id, artisanId: quotes.artisanId, state: quotes.state })
    .from(quotes)
    .where(eq(quotes.jobId, job.id));
  const writes: Write[] = [];
  for (const quote of onJob) {
    if (quote.state === "sent") {
      writes.push(
        ...endWrites(ctx, actor, quote, "declined", {
          to: quote.artisanId,
          title: `Your Quote was declined: ${job.title}`,
          link: `/jobs/${job.id}`,
        }),
        ...(await withdrawRevisionWrites(ctx, quote.id)),
      );
    }
    if (quote.state === "held") writes.push(...(await withdrawHeldQuote(ctx, quote.id)));
  }
  return writes;
}

/** Expires a Quote still Sent 14 days after it was Sent, telling its Artisan. */
const expiry: ClockHandler = async (ctx, clock) => {
  const quote = await quoteRow(ctx, clock.subjectId);
  if (quote?.state !== "sent" || quote.expiresAt?.getTime() !== clock.dueAt.getTime()) return [];
  const job = await jobRow(ctx, quote.jobId);
  return [
    ...endWrites(ctx, { kind: "system" }, quote, "expired", {
      to: quote.artisanId,
      title: `Your Quote expired: ${job?.title ?? ""}`,
      link: `/jobs/${quote.jobId}`,
    }),
    // A decision recorded meanwhile aborts this firing, and the next run tries again.
    ...(await withdrawRevisionWrites(ctx, quote.id)),
  ];
};

export const expiryClocks = { [EXPIRY_CLOCK]: expiry } satisfies Record<string, ClockHandler>;
