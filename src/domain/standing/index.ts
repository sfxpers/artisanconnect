import { and, desc, eq, exists, inArray, isNull, sql, type SQLWrapper } from "drizzle-orm";
import type { AdminActor } from "../actor";
import { audit } from "../audit";
import type { Context, Write } from "../context";
import { addedBy, editsStanding, withdrawEdit } from "../jobs/edits";
import { withdrawHeldJob } from "../jobs/held";
import { closeJobWrites, endWrites } from "../quotes/ends";
import { withdrawHeldQuote } from "../quotes/held";
import { withdrawRevisionWrites } from "../quotes/revisions";
import { refuse } from "../result";
import { jobs, quotes, suspensions, warnings } from "../schema";
import { tell, tellWhile } from "../tells";
import type { StoredFile } from "../uploads";

// An Account's standing (#136): the warnings the Admin has given it, which
// stay, and its Suspension, while one stands. A Suspended Account cannot
// post, Quote, Hire, invite, or be offered a Job; its paid Engagements go on,
// and it may still send a Support request. Each is a Tell to the Account.

/** The SQL that is true while the Account, given as a value or a column, is Suspended. */
export function suspendedNow(ctx: Context, accountId: SQLWrapper | string) {
  return exists(
    ctx.db
      .select({ one: sql`1` })
      .from(suspensions)
      .where(and(eq(suspensions.accountId, accountId), isNull(suspensions.liftedAt))),
  );
}

/** The Suspension standing on the Account, with its reason; null if none does. */
export async function suspensionOf(ctx: Context, accountId: string) {
  const [row] = await ctx.db
    .select({ id: suspensions.id, reason: suspensions.reason, since: suspensions.suspendedAt })
    .from(suspensions)
    .where(and(eq(suspensions.accountId, accountId), isNull(suspensions.liftedAt)));
  return row ?? null;
}

/** Whether the Account is Suspended now. */
export async function isSuspended(ctx: Context, accountId: string): Promise<boolean> {
  return (await suspensionOf(ctx, accountId)) !== null;
}

/** The Account's standing as it sees it: its Suspension, if one stands, and its warnings, newest first. */
export async function standingOf(ctx: Context, accountId: string) {
  const [suspension, warned] = await Promise.all([
    suspensionOf(ctx, accountId),
    warningsOf(ctx, accountId),
  ]);
  return {
    suspended: suspension && { reason: suspension.reason, since: suspension.since },
    warnings: warned.map(({ reason, at }) => ({ reason, at })),
  };
}

/** The Account's warnings, newest first. */
export async function warningsOf(ctx: Context, accountId: string) {
  return ctx.db
    .select({ reason: warnings.reason, leaving: warnings.leaving, at: warnings.warnedAt })
    .from(warnings)
    .where(eq(warnings.accountId, accountId))
    .orderBy(desc(warnings.warnedAt), desc(sql.raw(`"warnings"."rowid"`)));
}

/** Every Suspension the Account has had, newest first, lifted or standing. */
export async function suspensionsOf(ctx: Context, accountId: string) {
  return ctx.db
    .select({
      reason: suspensions.reason,
      leaving: suspensions.leaving,
      since: suspensions.suspendedAt,
      liftedAt: suspensions.liftedAt,
    })
    .from(suspensions)
    .where(eq(suspensions.accountId, accountId))
    .orderBy(desc(suspensions.suspendedAt), desc(sql.raw(`"suspensions"."rowid"`)));
}

/**
 * Whether the Account has been found Leaving before, warned or suspended for
 * it: Leaving again is then a Suspension.
 */
export async function foundLeavingBefore(ctx: Context, accountId: string): Promise<boolean> {
  const [warned] = await ctx.db
    .select({ id: warnings.id })
    .from(warnings)
    .where(and(eq(warnings.accountId, accountId), eq(warnings.leaving, true)))
    .limit(1);
  if (warned) return true;
  const [suspended] = await ctx.db
    .select({ id: suspensions.id })
    .from(suspensions)
    .where(and(eq(suspensions.accountId, accountId), eq(suspensions.leaving, true)))
    .limit(1);
  return !!suspended;
}

/** What a warning or Suspension is given for: the reason the Account is told, and whether it is Leaving. */
export type Finding = { reason: string; leaving: boolean };

/** The account a finding is about, as the audit log names it. */
export type Found = { id: string; name: string };

/** The writes that warn the Account, telling it, with the audit log's line. */
export function warnWrites(
  ctx: Context,
  admin: AdminActor,
  account: Found,
  finding: Finding,
): Write[] {
  return [
    ctx.db.insert(warnings).values({
      id: ctx.newId(),
      accountId: account.id,
      reason: finding.reason,
      leaving: finding.leaving,
      warnedBy: admin.adminId,
      warnedAt: ctx.now(),
    }),
    ...tell(ctx, admin, [account.id], {
      event: "account.warned",
      title: "You have a warning",
      link: "/account",
    }),
    audit(ctx, admin, {
      action: "account.warned",
      summary: `Warned ${account.name}${finding.leaving ? " for Leaving" : ""}: ${finding.reason}`,
      subjectId: account.id,
    }),
  ];
}

/** The refusal of what a Suspended Account may not start. */
export function suspendedRefusal(what: string) {
  return refuse(
    "suspended",
    `Your Account is suspended, so you cannot ${what}. See why on your Account page.`,
  );
}

/**
 * The writes that suspend the Account, telling it, with the audit log's
 * line, and the new work it had started ended: a Client's Open Jobs closed,
 * their Sent Quotes Declined, and a Job being checked made a Draft again; an
 * Artisan's Sent Quotes Withdrawn, each Client told, and those being checked
 * withdrawn. Its paid Engagements go on.
 * One already standing aborts the batch with an error `isAlreadySuspended`
 * recognises, as does a decision the Admin recorded meanwhile on something
 * it withdraws. The files of edits it withdraws are nobody's once it is
 * committed: discard them then.
 */
export async function suspendWrites(
  ctx: Context,
  admin: AdminActor,
  account: Found & { kind: "client" | "artisan" },
  finding: Finding,
): Promise<{ writes: Write[]; discard: StoredFile[] }> {
  const ended = await newWorkEnded(ctx, admin, account);
  const writes: Write[] = [
    ctx.db.insert(suspensions).values({
      id: ctx.newId(),
      accountId: account.id,
      reason: finding.reason,
      leaving: finding.leaving,
      suspendedBy: admin.adminId,
      suspendedAt: ctx.now(),
      liftedBy: null,
      liftedAt: null,
    }),
    ...tell(ctx, admin, [account.id], {
      event: "account.suspended",
      title: "Your Account is suspended",
      link: "/account",
    }),
    audit(ctx, admin, {
      action: "account.suspended",
      summary: `Suspended ${account.name}${finding.leaving ? " for Leaving" : ""}: ${finding.reason}`,
      subjectId: account.id,
    }),
    ...ended.writes,
  ];
  return { writes, discard: ended.discard };
}

/**
 * The writes that lift the Suspension standing on the Account, telling it,
 * with the audit log's line, only while it stands. Its warnings stay.
 */
export function liftWrites(
  ctx: Context,
  admin: AdminActor,
  account: Found,
  suspension: { id: string },
  note: string | null,
): Write[] {
  const now = ctx.now();
  const lifted = exists(
    ctx.db
      .select({ one: sql`1` })
      .from(suspensions)
      .where(and(eq(suspensions.id, suspension.id), eq(suspensions.liftedAt, now))),
  );
  return [
    ctx.db
      .update(suspensions)
      .set({ liftedBy: admin.adminId, liftedAt: now })
      .where(and(eq(suspensions.id, suspension.id), isNull(suspensions.liftedAt))),
    ...tellWhile(
      ctx,
      admin,
      [account.id],
      { event: "account.suspension-lifted", title: "Your Suspension is lifted", link: "/account" },
      lifted,
    ),
    audit(
      ctx,
      admin,
      {
        action: "account.suspension-lifted",
        summary: `Lifted the Suspension of ${account.name}${note ? `: ${note}` : ""}`,
        subjectId: account.id,
      },
      lifted,
    ),
  ];
}

/** The writes that end the new work the Account had started, and the files they leave nobody's. */
async function newWorkEnded(
  ctx: Context,
  admin: AdminActor,
  account: { id: string; kind: "client" | "artisan" },
) {
  const writes: Write[] = [];
  const discard: StoredFile[] = [];
  if (account.kind === "client") {
    const started = await ctx.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.clientId, account.id), inArray(jobs.state, ["open", "held"])));
    for (const job of started) {
      if (job.state === "held") {
        writes.push(...(await withdrawHeldJob(ctx, job.id)));
        continue;
      }
      const { beingChecked } = await editsStanding(ctx, job.id);
      writes.push(
        ctx.db
          .update(jobs)
          .set({ state: "closed", updatedAt: ctx.now() })
          .where(and(eq(jobs.id, job.id), eq(jobs.state, "open"))),
        // An edit waiting on a closed Job has nothing to show on.
        ...(beingChecked ? await withdrawEdit(ctx, beingChecked.id) : []),
        ...(await closeJobWrites(ctx, admin, job)),
      );
      if (beingChecked) discard.push(...addedBy(beingChecked, job));
    }
  } else {
    const started = await ctx.db
      .select({
        id: quotes.id,
        state: quotes.state,
        jobId: jobs.id,
        title: jobs.title,
        clientId: jobs.clientId,
      })
      .from(quotes)
      .innerJoin(jobs, eq(jobs.id, quotes.jobId))
      .where(and(eq(quotes.artisanId, account.id), inArray(quotes.state, ["sent", "held"])));
    for (const quote of started) {
      if (quote.state === "held") {
        writes.push(...(await withdrawHeldQuote(ctx, quote.id)));
        continue;
      }
      writes.push(
        ...endWrites(ctx, admin, quote, "withdrawn", {
          to: quote.clientId,
          title: `A Quote was withdrawn: ${quote.title}`,
          link: `/jobs/${quote.jobId}`,
        }),
        ...(await withdrawRevisionWrites(ctx, quote.id)),
      );
    }
  }
  return { writes, discard };
}
