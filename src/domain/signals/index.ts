import {
  and,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  ne,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { AdminActor } from "../actor";
import type { Context, Write } from "../context";
import { isAlreadyDecided } from "../content/held";
import { insertWhile } from "../guarded";
import { formatRands } from "../money";
import { holdPayoutsWrites } from "../payouts";
import { payoutReference } from "../payouts/rows";
import { defineQueueItemKind, type Block, type DecisionField } from "../queues";
import { accountSidebar } from "../quotes/held";
import { ok, refuse } from "../result";
import { formatTime } from "../sa-days";
import {
  accounts,
  chargebacks,
  completions,
  disputes,
  engagements,
  jobs,
  payments,
  payouts,
  queueItems,
  refusedSends,
  sightings,
  signals,
  verificationChecks,
  type SIGHTED_AT,
  type SIGNAL_KINDS,
} from "../schema";
import { defineSection } from "../section";
import { suspendedNow, suspendWrites, warnWrites } from "../standing";
import { alreadySuspended, isAlreadySuspended } from "../standing/people";
import { discardFiles } from "../uploads";

// Signals (#140, ADR 0020): detection finds patterns of behaviour and puts
// them in the Admin's Signals queue, never sanctioning anyone, as shared
// phones and Wi-Fi are common. Nobody is told of a Signal. The Admin closes
// it, or acts on an Account it names with a warning, a Suspension, or a
// Payout hold. Device and IP are recorded at sign-in and at each Payment.

/** What counts as "repeated" (#111 leaves the numbers to the build). */
export const REPEATED = {
  /** The days repeated trouble is counted over. */
  withinDays: 90,
  /** An Artisan's Cancellations and no-shows (a Client's Cancellation before Work started). */
  cancellations: 3,
  /** Disputes a Client opened. */
  disputes: 3,
  /** Fix requests a Client made, on any of their Engagements. */
  fixRequests: 3,
  /** Chargebacks of a Client's Payments. */
  chargebacks: 2,
  /** Sends of one Account the Content check refused on one Job, at any time. */
  refusalsOnOneJob: 3,
} as const;

/** How long an Account is new, for sharing a device or IP with a Suspended one. */
export const NEW_ACCOUNT_DAYS = 30;

/** A second sent-back Payout within these days of another raises a Signal. */
export const SENT_BACK_WITHIN_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

type SignalKind = (typeof SIGNAL_KINDS)[number];

/** What detection found, to raise as a Signal. */
type Finding = {
  kind: SignalKind;
  accountId: string;
  otherAccountId?: string;
  jobId?: string;
  title: string;
  /** Each thing found, by an id or value: a Signal is raised only for what is new. */
  found: string[];
  evidence: string[];
};

/**
 * Each kind of Signal as the Admin reads it: what it is, and how the sidebar
 * titles the Account it is about and the other it names.
 */
const KINDS: Record<SignalKind, { name: string; roles: [string, string?] }> = {
  shared: {
    name: "A Client and an Artisan who transact share a device, an IP, or a Payout-account name.",
    roles: ["Client", "Artisan"],
  },
  cancellations: {
    name: `An Artisan with ${REPEATED.cancellations} or more Cancellations or no-shows in ${REPEATED.withinDays} days.`,
    roles: ["Artisan"],
  },
  disputes: {
    name: `A Client who opened ${REPEATED.disputes} or more Disputes in ${REPEATED.withinDays} days.`,
    roles: ["Client"],
  },
  "fix-requests": {
    name: `A Client who made ${REPEATED.fixRequests} or more Fix requests in ${REPEATED.withinDays} days.`,
    roles: ["Client"],
  },
  chargebacks: {
    name: `A Client with ${REPEATED.chargebacks} or more Chargebacks in ${REPEATED.withinDays} days.`,
    roles: ["Client"],
  },
  refusals: {
    name: `One Account whose sends the Content check refused ${REPEATED.refusalsOnOneJob} or more times on one Job.`,
    roles: ["Account"],
  },
  linked: {
    name: `An Account new in the last ${NEW_ACCOUNT_DAYS} days sharing a device or IP with a Suspended one.`,
    roles: ["New Account", "Suspended Account"],
  },
  "sent-back": {
    name: `A second Payout the bank sent back within ${SENT_BACK_WITHIN_DAYS} days.`,
    roles: ["Artisan"],
  },
};

/** One Signal is open at a time for its kind and whom it is about. */
function keyOf(finding: Pick<Finding, "kind" | "accountId" | "otherAccountId" | "jobId">) {
  return [finding.kind, finding.accountId, finding.otherAccountId ?? "", finding.jobId ?? ""].join(
    ":",
  );
}

/**
 * The writes that raise a Signal of what was found, only if something in it
 * no earlier Signal of its key found, and only while the condition holds when
 * the batch runs. One of its key open then takes what was found instead, as
 * a Report folds into an open item. Nobody is told.
 */
export async function signalWrites(
  ctx: Context,
  finding: Finding,
  condition?: SQL,
): Promise<Write[]> {
  const key = keyOf(finding);
  const earlier = await ctx.db
    .select({ found: signals.found })
    .from(signals)
    .where(eq(signals.key, key));
  const seen = new Set(earlier.flatMap((signal) => signal.found));
  if (finding.found.every((each) => seen.has(each))) return [];
  const id = ctx.newId();
  // The item of the key's open Signal, if there is one. Not `raiseUnlessOpen`,
  // as each Signal is its own subject. A fresh query each time, as a builder
  // is changed by using it.
  const openItem = () =>
    ctx.db
      .select({ id: signals.queueItemId })
      .from(signals)
      .innerJoin(queueItems, eq(queueItems.id, signals.queueItemId))
      .where(and(eq(signals.key, key), isNull(queueItems.decidedAt)));
  const folded = [
    ctx.db
      .update(signals)
      .set({ found: finding.found, evidence: finding.evidence })
      .where(and(eq(signals.key, key), inArray(signals.queueItemId, openItem()), condition)),
    ctx.db
      .update(queueItems)
      .set({ title: finding.title })
      .where(and(inArray(queueItems.id, openItem()), condition)),
  ];
  const { write, itemId } = signalItem.raise(
    ctx,
    { subjectId: id, title: finding.title },
    and(notExists(openItem()), condition),
  );
  return [
    ...folded,
    write,
    insertWhile(
      ctx,
      signals,
      {
        id,
        kind: finding.kind,
        accountId: finding.accountId,
        otherAccountId: finding.otherAccountId ?? null,
        jobId: finding.jobId ?? null,
        key,
        found: finding.found,
        evidence: finding.evidence,
        queueItemId: itemId,
        raisedAt: ctx.now(),
      },
      exists(
        ctx.db
          .select({ one: sql`1` })
          .from(queueItems)
          .where(eq(queueItems.id, itemId)),
      ),
    ),
  ];
}

/**
 * Raises a Signal of what was found, if anything was. Detection follows what
 * a party did, which has happened: a Signal that cannot be raised is logged,
 * never the party's failure.
 */
async function raise(ctx: Context, finding: Promise<Finding | null>) {
  try {
    const found = await finding;
    if (found) await ctx.commit(await signalWrites(ctx, found));
  } catch (error) {
    console.error("A Signal was not raised", error);
  }
}

// What detection reads.

async function nameOf(ctx: Context, accountId: string) {
  const [row] = await ctx.db
    .select({ name: accounts.name })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return row?.name ?? "";
}

function since(ctx: Context, days: number) {
  return new Date(ctx.now().getTime() - days * DAY_MS);
}

/** The device and IP a request came from, recorded at sign-in and at each Payment. */
export type Seen = { ip?: string | null; device?: string | null };

/** An IP that names nobody's network. */
const NO_IP = ["", "unknown"];

/**
 * Records the device and IP the Account is on, at sign-in or a Payment, and
 * looks for what they share: with each Account it transacts with, and, for a
 * new Account, with a Suspended one.
 */
export async function recordSighting(
  ctx: Context,
  accountId: string,
  from: Seen,
  at: (typeof SIGHTED_AT)[number],
) {
  const device = from.device?.trim() || null;
  const ip = from.ip && !NO_IP.includes(from.ip) ? from.ip : null;
  if (!device && !ip) return;
  try {
    await ctx.commit([
      ctx.db
        .insert(sightings)
        .values({ id: ctx.newId(), accountId, device, ip, at, seenAt: ctx.now() }),
    ]);
  } catch (error) {
    console.error("A sighting was not recorded", error);
    return;
  }
  const [account] = await ctx.db
    .select({ kind: accounts.kind, signedUpAt: accounts.signedUpAt })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  if (!account) return;
  // Those it transacts with who were seen on this device or IP: only they share something new.
  const [mine, theirs] =
    account.kind === "client"
      ? [engagements.clientId, engagements.artisanId]
      : [engagements.artisanId, engagements.clientId];
  const pairs = await ctx.db
    .selectDistinct({ clientId: engagements.clientId, artisanId: engagements.artisanId })
    .from(engagements)
    .innerJoin(sightings, eq(sightings.accountId, theirs))
    .where(
      and(
        eq(mine, accountId),
        or(
          device ? eq(sightings.device, device) : undefined,
          ip ? eq(sightings.ip, ip) : undefined,
        ),
      ),
    );
  for (const pair of pairs) await raise(ctx, sharedFinding(ctx, pair.clientId, pair.artisanId));
  if (account.signedUpAt >= since(ctx, NEW_ACCOUNT_DAYS)) {
    for (const suspendedId of await seenWith(ctx, accountId, "suspended")) {
      await raise(ctx, linkedFinding(ctx, accountId, suspendedId));
    }
  }
}

/** Looks for what a Client and Artisan share, once they transact: at Hire. */
export async function signalIfShared(ctx: Context, clientId: string, artisanId: string) {
  await raise(ctx, sharedFinding(ctx, clientId, artisanId));
}

/** The devices and IPs both Accounts were seen on. */
async function sharedSightings(ctx: Context, accountId: string, otherId: string) {
  const other = alias(sightings, "other");
  const [devices, ips] = await Promise.all([
    ctx.db
      .selectDistinct({ value: sightings.device })
      .from(sightings)
      .innerJoin(other, eq(other.device, sightings.device))
      .where(and(eq(sightings.accountId, accountId), eq(other.accountId, otherId))),
    ctx.db
      .selectDistinct({ value: sightings.ip })
      .from(sightings)
      .innerJoin(other, eq(other.ip, sightings.ip))
      .where(and(eq(sightings.accountId, accountId), eq(other.accountId, otherId))),
  ]);
  return {
    devices: devices.flatMap((row) => (row.value ? [row.value] : [])).sort(),
    ips: ips.flatMap((row) => (row.value ? [row.value] : [])).sort(),
  };
}

/** A name as a bank and a person might each write it. */
function sameName(a: string, b: string) {
  const plain = (name: string) =>
    name
      .toLocaleLowerCase("en-ZA")
      .replace(/[^\p{L}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  return plain(a) !== "" && plain(a) === plain(b);
}

/** A device's id, shortened for the Admin: it names a browser, nobody's personal data. */
function deviceShown(device: string) {
  return `…${device.slice(-6)}`;
}

/** What two Accounts were both seen on, in words: "a device", "an IP". */
function sharedWhat(shared: { devices: string[]; ips: string[] }) {
  return [
    ...(shared.devices.length > 0 ? ["a device"] : []),
    ...(shared.ips.length > 0 ? ["an IP"] : []),
  ];
}

function sharedLines(shared: { devices: string[]; ips: string[] }) {
  return [
    ...shared.devices.map((device) => `Both were seen on the device ${deviceShown(device)}.`),
    ...shared.ips.map((ip) => `Both were seen on the IP ${ip}.`),
  ];
}

function sharedFound(shared: { devices: string[]; ips: string[] }) {
  return [
    ...shared.devices.map((device) => `device:${device}`),
    ...shared.ips.map((ip) => `ip:${ip}`),
  ];
}

/** A list said in words: "a, b and c". */
function listed(items: string[]) {
  return items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * What a Client and an Artisan who transact share: a device, an IP, or a
 * Payout account of the Artisan's in the Client's name.
 */
async function sharedFinding(
  ctx: Context,
  clientId: string,
  artisanId: string,
): Promise<Finding | null> {
  const [shared, client, artisan, holders] = await Promise.all([
    sharedSightings(ctx, clientId, artisanId),
    nameOf(ctx, clientId),
    nameOf(ctx, artisanId),
    ctx.db
      .select({ details: verificationChecks.details })
      .from(verificationChecks)
      .where(
        and(
          eq(verificationChecks.artisanId, artisanId),
          eq(verificationChecks.kind, "payout-account"),
          inArray(verificationChecks.state, ["accepted", "superseded"]),
        ),
      ),
  ]);
  const holder = holders
    .map((row) => row.details.accountHolder ?? "")
    .find((name) => sameName(name, client));
  const what = [...sharedWhat(shared), ...(holder ? ["a Payout-account name"] : [])];
  if (what.length === 0) return null;
  return {
    kind: "shared",
    accountId: clientId,
    otherAccountId: artisanId,
    title: `${client} and ${artisan} share ${listed(what)}`,
    found: [...sharedFound(shared), ...(holder ? ["payout-account-name"] : [])],
    evidence: [
      ...sharedLines(shared),
      ...(holder
        ? [`The Artisan's Payout account is held in the name ${holder}, the Client's name.`]
        : []),
    ],
  };
}

/**
 * The Accounts seen on a device or IP the Account was seen on, but for it:
 * of them, those Suspended now, or those new.
 */
async function seenWith(ctx: Context, accountId: string, which: "suspended" | "new") {
  const other = alias(sightings, "other");
  const rows = await ctx.db
    .selectDistinct({ accountId: other.accountId })
    .from(sightings)
    .innerJoin(other, or(eq(other.device, sightings.device), eq(other.ip, sightings.ip)))
    .innerJoin(accounts, eq(accounts.id, other.accountId))
    .where(
      and(
        eq(sightings.accountId, accountId),
        ne(other.accountId, accountId),
        which === "suspended"
          ? suspendedNow(ctx, other.accountId)
          : gte(accounts.signedUpAt, since(ctx, NEW_ACCOUNT_DAYS)),
      ),
    );
  return rows.map((row) => row.accountId);
}

/** What a new Account shares with a Suspended one. */
async function linkedFinding(ctx: Context, newId: string, suspendedId: string): Promise<Finding> {
  const [shared, name, suspendedName] = await Promise.all([
    sharedSightings(ctx, newId, suspendedId),
    nameOf(ctx, newId),
    nameOf(ctx, suspendedId),
  ]);
  return {
    kind: "linked",
    accountId: newId,
    otherAccountId: suspendedId,
    title: `New Account ${name} shares ${listed(sharedWhat(shared))} with Suspended ${suspendedName}`,
    found: sharedFound(shared),
    evidence: sharedLines(shared),
  };
}

/**
 * The writes, in the batch that suspends an Account, that raise a Signal of
 * each new Account seen on a device or IP it was seen on; only if the batch
 * does suspend it, as the condition says.
 */
export async function linkedSignalWrites(
  ctx: Context,
  suspendedId: string,
  condition: SQL,
): Promise<Write[]> {
  const writes: Write[] = [];
  for (const newId of await seenWith(ctx, suspendedId, "new")) {
    writes.push(
      ...(await signalWrites(ctx, await linkedFinding(ctx, newId, suspendedId), condition)),
    );
  }
  return writes;
}

/** Counted trouble: each event, by id, with what the Admin reads of it. */
type Trouble = { id: string; line: string }[];

/** A Finding of repeated trouble, once there is as much as counts as repeated. */
async function repeated(
  ctx: Context,
  kind: SignalKind,
  accountId: string,
  trouble: Trouble,
  threshold: number,
  title: (name: string) => string,
  jobId?: string,
): Promise<Finding | null> {
  if (trouble.length < threshold) return null;
  return {
    kind,
    accountId,
    jobId,
    title: title(await nameOf(ctx, accountId)),
    found: trouble.map((each) => each.id),
    evidence: trouble.map((each) => each.line),
  };
}

/**
 * Looks at an Artisan's Cancellations and no-shows, after a Cancellation:
 * those the Artisan made, and a Client's before Work started.
 */
export async function signalIfCancelling(ctx: Context, artisanId: string) {
  const rows = await ctx.db
    .select({
      id: engagements.id,
      title: jobs.title,
      at: engagements.cancelledAt,
      by: engagements.cancelledBy,
      reason: engagements.cancellationReason,
    })
    .from(engagements)
    .innerJoin(jobs, eq(jobs.id, engagements.jobId))
    .where(
      and(
        eq(engagements.artisanId, artisanId),
        gte(engagements.cancelledAt, since(ctx, REPEATED.withinDays)),
        or(
          eq(engagements.cancelledBy, "artisan"),
          and(eq(engagements.cancelledBy, "client"), isNull(engagements.workStartedAt)),
        ),
      ),
    )
    .orderBy(desc(engagements.cancelledAt));
  const trouble = rows.map((row) => ({
    id: row.id,
    line: `${formatTime(row.at!)} · ${row.title}: ${row.by === "artisan" ? "cancelled by the Artisan" : "cancelled by the Client before Work started"}${row.reason ? ` (“${row.reason}”)` : ""}.`,
  }));
  await raise(
    ctx,
    repeated(
      ctx,
      "cancellations",
      artisanId,
      trouble,
      REPEATED.cancellations,
      (name) => `Repeated Cancellations or no-shows: ${name}`,
    ),
  );
}

/** Looks at the Disputes a Client opened, after they open one. */
export async function signalIfDisputing(ctx: Context, clientId: string) {
  const rows = await ctx.db
    .select({ id: disputes.id, title: jobs.title, at: disputes.openedAt })
    .from(disputes)
    .innerJoin(engagements, eq(engagements.id, disputes.engagementId))
    .innerJoin(jobs, eq(jobs.id, engagements.jobId))
    .where(
      and(
        eq(engagements.clientId, clientId),
        eq(disputes.openedBy, "client"),
        gte(disputes.openedAt, since(ctx, REPEATED.withinDays)),
      ),
    )
    .orderBy(desc(disputes.openedAt));
  await raise(
    ctx,
    repeated(
      ctx,
      "disputes",
      clientId,
      rows.map((row) => ({ id: row.id, line: `${formatTime(row.at)} · ${row.title}: a Dispute.` })),
      REPEATED.disputes,
      (name) => `Repeated Disputes: ${name}`,
    ),
  );
}

/** Looks at the Fix requests a Client made, after they make one. */
export async function signalIfAskingFixes(ctx: Context, clientId: string) {
  const rows = await ctx.db
    .select({ id: completions.id, title: jobs.title, at: completions.answeredAt })
    .from(completions)
    .innerJoin(engagements, eq(engagements.id, completions.engagementId))
    .innerJoin(jobs, eq(jobs.id, engagements.jobId))
    .where(
      and(
        eq(engagements.clientId, clientId),
        eq(completions.answer, "fix-requested"),
        gte(completions.answeredAt, since(ctx, REPEATED.withinDays)),
      ),
    )
    .orderBy(desc(completions.answeredAt));
  await raise(
    ctx,
    repeated(
      ctx,
      "fix-requests",
      clientId,
      rows.map((row) => ({
        id: row.id,
        line: `${formatTime(row.at!)} · ${row.title}: a Fix request.`,
      })),
      REPEATED.fixRequests,
      (name) => `Repeated Fix requests: ${name}`,
    ),
  );
}

/**
 * Looks at a Client's Chargebacks, after one opens. The system has already
 * suspended the Client at each (#137); a Signal adds nothing automatic.
 */
export async function signalIfChargingBack(ctx: Context, clientId: string) {
  const rows = await ctx.db
    .select({
      id: chargebacks.id,
      title: jobs.title,
      at: chargebacks.openedAt,
      cents: chargebacks.amountCents,
    })
    .from(chargebacks)
    .innerJoin(payments, eq(payments.id, chargebacks.paymentId))
    .innerJoin(jobs, eq(jobs.id, payments.jobId))
    .where(
      and(
        eq(chargebacks.clientId, clientId),
        gte(chargebacks.openedAt, since(ctx, REPEATED.withinDays)),
      ),
    )
    .orderBy(desc(chargebacks.openedAt));
  await raise(
    ctx,
    repeated(
      ctx,
      "chargebacks",
      clientId,
      rows.map((row) => ({
        id: row.id,
        line: `${formatTime(row.at)} · ${row.title}: a Chargeback of ${formatRands(row.cents)}.`,
      })),
      REPEATED.chargebacks,
      (name) => `Repeated Chargebacks: ${name}`,
    ),
  );
}

/** A send on a Job, by an Account, that the Content check may refuse. */
export type SentOn = { accountId: string; jobId: string; what: string };

/**
 * Records a send on a Job the Content check refused, and looks at how often
 * the Account was refused on that Job.
 */
export async function recordRefusal(ctx: Context, sent: SentOn, reason: string) {
  try {
    await ctx.commit([
      ctx.db.insert(refusedSends).values({
        id: ctx.newId(),
        accountId: sent.accountId,
        jobId: sent.jobId,
        what: sent.what,
        reason,
        refusedAt: ctx.now(),
      }),
    ]);
  } catch (error) {
    console.error("A refused send was not recorded", error);
    return;
  }
  const [rows, job] = await Promise.all([
    ctx.db
      .select({
        id: refusedSends.id,
        what: refusedSends.what,
        reason: refusedSends.reason,
        at: refusedSends.refusedAt,
      })
      .from(refusedSends)
      .where(and(eq(refusedSends.accountId, sent.accountId), eq(refusedSends.jobId, sent.jobId)))
      .orderBy(desc(refusedSends.refusedAt), desc(sql.raw(`"refused_sends"."rowid"`))),
    ctx.db.select({ title: jobs.title }).from(jobs).where(eq(jobs.id, sent.jobId)),
  ]);
  await raise(
    ctx,
    repeated(
      ctx,
      "refusals",
      sent.accountId,
      rows.map((row) => ({
        id: row.id,
        line: `${formatTime(row.at)} · ${row.what}: ${row.reason}`,
      })),
      REPEATED.refusalsOnOneJob,
      (name) => `Refused again and again on ${job[0]?.title ?? "a Job"}: ${name}`,
      sent.jobId,
    ),
  );
}

/**
 * The writes, in the batch that marks a Payout sent back, that raise a Signal
 * if the bank sent back another of the Artisan's within 90 days; only if the
 * batch does mark it, as the condition says.
 */
export async function sentBackSignalWrites(
  ctx: Context,
  payout: {
    id: string;
    artisanId: string;
    artisanName: string;
    amountCents: number;
    jobTitle: string;
  },
  reason: string,
  condition: SQL,
): Promise<Write[]> {
  const now = ctx.now();
  const earlier = await ctx.db
    .select({
      id: payouts.id,
      at: payouts.stoppedAt,
      cents: payouts.amountCents,
      reason: payouts.refusedFor,
      title: jobs.title,
    })
    .from(payouts)
    .innerJoin(engagements, eq(engagements.id, payouts.engagementId))
    .innerJoin(jobs, eq(jobs.id, engagements.jobId))
    .where(
      and(
        eq(payouts.artisanId, payout.artisanId),
        eq(payouts.state, "sent-back"),
        ne(payouts.id, payout.id),
        gte(payouts.stoppedAt, since(ctx, SENT_BACK_WITHIN_DAYS)),
      ),
    )
    .orderBy(desc(payouts.stoppedAt));
  if (earlier.length === 0) return [];
  const line = (each: {
    id: string;
    at: Date;
    cents: number;
    title: string;
    reason: string | null;
  }) =>
    `${formatTime(each.at)} · ${payoutReference(each.id)} of ${formatRands(each.cents)} for ${each.title}: sent back${each.reason ? ` (${each.reason})` : ""}.`;
  return signalWrites(
    ctx,
    {
      kind: "sent-back",
      accountId: payout.artisanId,
      title: `A second Payout sent back within ${SENT_BACK_WITHIN_DAYS} days: ${payout.artisanName}`,
      found: [payout.id, ...earlier.map((each) => each.id)],
      evidence: [
        line({ id: payout.id, at: now, cents: payout.amountCents, title: payout.jobTitle, reason }),
        ...earlier.map((each) => line({ ...each, at: each.at! })),
      ],
    },
    condition,
  );
}

// The Admin's side: the Signal's item.

const TOLD = "The Account chosen, with the reason";

async function signalOf(ctx: Context, signalId: string) {
  const [row] = await ctx.db.select().from(signals).where(eq(signals.id, signalId));
  return row ?? null;
}

/** The Accounts a Signal names, each as the Admin may act on it now. */
async function accountsOf(ctx: Context, signalId: string) {
  const signal = await signalOf(ctx, signalId);
  if (!signal) return [];
  const ids = [signal.accountId, signal.otherAccountId].filter((id): id is string => !!id);
  const rows = await ctx.db
    .select({
      id: accounts.id,
      name: accounts.name,
      kind: accounts.kind,
      payoutsHeldAt: accounts.payoutsHeldAt,
      suspended: sql<number>`${suspendedNow(ctx, accounts.id)}`,
    })
    .from(accounts)
    .where(inArray(accounts.id, ids));
  return ids.flatMap((id) => {
    const row = rows.find((each) => each.id === id);
    return row ? [{ ...row, suspended: !!row.suspended }] : [];
  });
}

type Named = Awaited<ReturnType<typeof accountsOf>>[number];

/** The Accounts each action may be taken on now. */
function actionable(named: Named[]) {
  return {
    warn: named,
    suspend: named.filter((account) => !account.suspended),
    hold: named.filter((account) => account.kind === "artisan" && !account.payoutsHeldAt),
  };
}

function accountField(named: Named[]): DecisionField {
  return {
    key: "account",
    label: "Account",
    type: "choice",
    value: named[0]?.id ?? "",
    required: true,
    options: named.map((account) => ({
      value: account.id,
      label: `${account.name} (${account.kind === "client" ? "Client" : "Artisan"})`,
    })),
  };
}

export const signalItem = defineQueueItemKind("signal", {
  queue: "signals",
  decisions: {
    close: { label: "Close", told: "Nobody", reason: "optional", reasonLabel: "Note" },
    warn: { label: "Warn", told: TOLD, reason: "required" },
    suspend: { label: "Suspend", told: TOLD, reason: "required" },
    hold: {
      label: "Hold Payouts",
      told: "The Artisan chosen",
      reason: "optional",
      reasonLabel: "Note",
    },
  },
  async allowed(ctx, item) {
    const may = actionable(await accountsOf(ctx, item.subjectId));
    return [
      "close",
      ...(["warn", "suspend", "hold"] as const).filter((key) => may[key].length > 0),
    ];
  },
  async fields(ctx, item) {
    const may = actionable(await accountsOf(ctx, item.subjectId));
    return {
      warn: [accountField(may.warn)],
      suspend: [accountField(may.suspend)],
      hold: [accountField(may.hold)],
    };
  },
  async decide(ctx, admin: AdminActor, item, choice) {
    if (choice.decision === "close") return ok([]);
    const action = choice.decision as "warn" | "suspend" | "hold";
    const account = actionable(await accountsOf(ctx, item.subjectId))[action].find(
      (each) => each.id === choice.fields.account,
    );
    if (!account) return refuse("not-allowed", "That decision is not allowed on this Account now.");
    const finding = { reason: choice.reason ?? "", leaving: false };
    if (action === "warn") return ok(warnWrites(ctx, admin, account, finding));
    if (action === "hold") return ok(holdPayoutsWrites(ctx, admin, account));
    const suspended = await suspendWrites(ctx, admin, account, finding);
    return ok({
      writes: suspended.writes,
      afterCommit: () => discardFiles(ctx, suspended.discard),
    });
  },
  refusalOf(error) {
    if (isAlreadySuspended(error)) return alreadySuspended();
    // Something the Suspension ends was decided meanwhile.
    if (isAlreadyDecided(error)) {
      return refuse("changed", "Something of this Account changed meanwhile. Look again.");
    }
    return null;
  },
  async view(ctx, item) {
    const signal = await signalOf(ctx, item.subjectId);
    if (!signal) return { tabs: [], sidebar: [] };
    const [role, otherRole] = KINDS[signal.kind].roles;
    const blocks: Block[] = [
      { kind: "text", text: KINDS[signal.kind].name },
      { kind: "text", text: signal.evidence.join("\n") },
      ...(signal.kind === "sent-back"
        ? [
            {
              kind: "link" as const,
              label: "Open the Artisan's money history",
              href: `/admin/payouts/${signal.accountId}`,
            },
          ]
        : []),
    ];
    return {
      tabs: [{ key: "signal", label: "What was found", blocks }],
      sidebar: [
        ...(await accountSidebar(ctx, signal.accountId, role)),
        ...(signal.otherAccountId && otherRole
          ? await accountSidebar(ctx, signal.otherAccountId, otherRole)
          : []),
      ],
    };
  },
});

export const signalsSection = defineSection({
  name: "signals",
  queueItems: [signalItem],
  api: () => ({}),
});
