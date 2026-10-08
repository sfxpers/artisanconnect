import { and, asc, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import type { AdminActor } from "../actor";
import { publicName } from "../accounts/names";
import type { Context, Write } from "../context";
import { conversationBlocks } from "../conversations/admin-read";
import { conversationRow, messageRow } from "../conversations/rows";
import { isAlreadyDecided } from "../content/held";
import { jobBlocks } from "../jobs/held";
import { jobRow } from "../jobs/rows";
import { versionBlocks } from "../profiles/edits";
import { shownVersion } from "../profiles/edits";
import {
  defineQueueItemKind,
  type Block,
  type DecisionOption,
  type ItemView,
  type QueueItem,
} from "../queues";
import { accountSidebar, quoteBlocks } from "../quotes/held";
import { quoteRow } from "../quotes/rows";
import { ok, refuse } from "../result";
import { formatTime } from "../sa-days";
import { accounts, jobs, reports } from "../schema";
import {
  foundLeavingBefore,
  isSuspended,
  suspendWrites,
  warnWrites,
  type Finding,
} from "../standing";
import { alreadySuspended, isAlreadySuspended } from "../standing/people";
import { tellWhile } from "../tells";
import { discardFiles } from "../uploads";
import { endWrites, groundDecisions, groundOf, reviewBlocks } from "../reviews/precheck";
import { reviewRow } from "../reviews/rows";
import { REPORT_REASON_NAMES } from "./reasons";
import type { ReportSubject } from "./subjects";

// A Report's queue item (#136): one per reported thing while it is open, with
// every Report folded into it counted. The Admin dismisses it, or acts on the
// Account reported: a warning, a Suspension, or Leaving's ladder (a warning
// the first time, a Suspension the second, or at once for openly dodging the
// fees). For a Job or a Profile it may take the thing out of view until it is
// fixed, and for a Review remove it. The reporters are never told which.

/** How the queue names each kind of thing reported. */
const SUBJECT_NAMES: Record<ReportSubject, string> = {
  job: "a Job",
  quote: "a Quote",
  message: "a message",
  profile: "a Profile",
  review: "a Review",
};

/** The title of the item about a thing reported. */
export function itemTitle(kind: ReportSubject, name: string) {
  return `Report of ${SUBJECT_NAMES[kind]}: ${name}`;
}

const TOLD = "The Account reported, with the reason";

/** The decisions every Report's item may have, in the order offered. */
const DECISIONS = {
  dismiss: { label: "Dismiss", told: "Nobody", reason: "optional", reasonLabel: "Note" },
  warn: { label: "Warn", told: TOLD, reason: "required" },
  suspend: { label: "Suspend", told: TOLD, reason: "required" },
  "leaving-warn": { label: "Leaving: warn", told: TOLD, reason: "required" },
  "leaving-suspend": { label: "Leaving again: suspend", told: TOLD, reason: "required" },
  "dodging-fees": {
    label: "Leaving, openly dodging the fees: suspend",
    told: TOLD,
    reason: "required",
  },
} satisfies Record<string, DecisionOption>;

type Decision = keyof typeof DECISIONS;

/** What each decision finds of the Account reported, and whether it suspends. */
const FINDINGS: Record<Exclude<Decision, "dismiss">, { leaving: boolean; suspends: boolean }> = {
  warn: { leaving: false, suspends: false },
  suspend: { leaving: false, suspends: true },
  "leaving-warn": { leaving: true, suspends: false },
  "leaving-suspend": { leaving: true, suspends: true },
  "dodging-fees": { leaving: true, suspends: true },
};

/**
 * A decision on the thing reported itself, beside those on the Account
 * reported: taking a Job or Profile out of view until it is fixed, or
 * removing a Review. Whether it may be made now, and the writes that make
 * it, telling the thing's owner.
 */
type Outcome = {
  option: DecisionOption;
  possible(ctx: Context, subjectId: string): Promise<boolean>;
  writes(
    ctx: Context,
    admin: AdminActor,
    subjectId: string,
    reason: string | null,
  ): Promise<Write[]>;
};

/** What one kind of thing reported shows the Admin, and the Conversations a Report of it opens. */
type SubjectDefinition = {
  /** The tab that shows the thing, as it stands now. */
  tab(ctx: Context, subjectId: string): Promise<{ label: string; blocks: Block[] }>;
  /** The decisions on the thing itself, by key, offered after Dismiss. */
  outcomes?: Record<string, Outcome>;
  /** The Conversations, by Job and Artisan, the Admin may read from it; none for a Profile. */
  conversations?(
    ctx: Context,
    item: QueueItem,
  ): Promise<{ jobId: string; artisanId: string; with: string }[]>;
};

function defineReportKind(subject: ReportSubject, definition: SubjectDefinition) {
  const outcomes = definition.outcomes ?? {};
  return defineQueueItemKind(`report.${subject}`, {
    queue: "reports",
    decisions: {
      ...DECISIONS,
      ...Object.fromEntries(Object.entries(outcomes).map(([key, { option }]) => [key, option])),
    },
    async allowed(ctx, item) {
      const reportedId = await reportedOf(ctx, item);
      if (!reportedId) return ["dismiss"];
      const [suspended, leftBefore, possible] = await Promise.all([
        isSuspended(ctx, reportedId),
        foundLeavingBefore(ctx, reportedId),
        Promise.all(
          Object.entries(outcomes).map(async ([key, outcome]) =>
            (await outcome.possible(ctx, item.subjectId)) ? [key] : [],
          ),
        ),
      ]);
      const keys: string[] = ["dismiss", ...possible.flat()];
      keys.push("warn");
      if (!suspended) keys.push("suspend");
      // A Suspended Account found Leaving again is warned: it cannot be suspended twice.
      if (!leftBefore) keys.push("leaving-warn");
      else if (!suspended) keys.push("leaving-suspend");
      if (!suspended) keys.push("dodging-fees");
      return keys;
    },
    async decide(ctx, admin, item, choice) {
      if (choice.decision === "dismiss") return ok([]);
      const outcome = outcomes[choice.decision];
      if (outcome) return ok(await outcome.writes(ctx, admin, item.subjectId, choice.reason));
      const finding = FINDINGS[choice.decision as Exclude<Decision, "dismiss">];
      const reportedId = await reportedOf(ctx, item);
      const account = reportedId && (await accountRow(ctx, reportedId));
      if (!finding || !account) {
        return refuse("not-allowed", "That decision is not allowed on this item.");
      }
      return findingWrites(ctx, admin, account, {
        reason: choice.reason ?? "",
        leaving: finding.leaving,
        suspends: finding.suspends,
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
      const [view, shown] = await Promise.all([
        reportsView(ctx, item),
        definition.tab(ctx, item.subjectId),
      ]);
      const conversations = definition.conversations ? [CONVERSATION_TAB] : [];
      return { ...view, tabs: [...view.tabs, { key: subject, ...shown }, ...conversations] };
    },
    reads: definition.conversations && {
      conversation: {
        label: "the Conversation",
        async open(ctx, item) {
          const between = await definition.conversations!(ctx, item);
          if (between.length === 1) return conversationBlocks(ctx, between[0]!);
          const blocks: Block[] = [];
          for (const each of between) {
            blocks.push(
              { kind: "text", text: `With ${each.with}:` },
              ...(await conversationBlocks(ctx, each)),
            );
          }
          return blocks.length > 0 ? blocks : [{ kind: "text", text: "Nothing was said." }];
        },
      },
    },
  });
}

/** Taking a Job or Profile out of view until it is fixed, telling its owner what to fix. */
function outOfView(
  told: string,
  outcome: Pick<Outcome, "possible"> & {
    writes(ctx: Context, admin: AdminActor, subjectId: string, reason: string): Promise<Write[]>;
  },
): Record<string, Outcome> {
  return {
    "out-of-view": {
      option: {
        label: "Take it out of view until it is fixed",
        told,
        reason: "required",
        reasonLabel: "What to fix",
      },
      possible: outcome.possible,
      writes: (ctx, admin, subjectId, reason) =>
        outcome.writes(ctx, admin, subjectId, reason ?? ""),
    },
  };
}

const CONVERSATION_TAB = { key: "conversation", label: "The Conversation", read: "conversation" };

/**
 * The writes of a warning or a Suspension of the Account reported, and for a
 * Suspension the files of what it withdrew, discarded once committed.
 */
async function findingWrites(
  ctx: Context,
  admin: AdminActor,
  account: { id: string; name: string; kind: "client" | "artisan" },
  finding: Finding & { suspends: boolean },
) {
  if (!finding.suspends) return ok(warnWrites(ctx, admin, account, finding));
  const suspended = await suspendWrites(ctx, admin, account, finding);
  return ok({
    writes: suspended.writes,
    afterCommit: () => discardFiles(ctx, suspended.discard),
  });
}

const REMOVE = "remove";

export const REPORT_KINDS = {
  job: defineReportKind("job", {
    outcomes: outOfView("The Client, with what to fix", {
      // A Job Artisans may see now: never a Hired one, which only its parties see.
      async possible(ctx, jobId) {
        const job = await jobRow(ctx, jobId);
        return !!job && (job.state === "open" || job.state === "expired") && !job.outOfViewSince;
      },
      async writes(ctx, admin, jobId, reason) {
        const job = await jobRow(ctx, jobId);
        if (!job) return [];
        const now = ctx.now();
        const hidden = and(eq(jobs.id, jobId), eq(jobs.outOfViewSince, now))!;
        return [
          ctx.db
            .update(jobs)
            .set({ outOfViewSince: now, outOfViewFor: reason })
            .where(
              and(
                eq(jobs.id, jobId),
                inArray(jobs.state, ["open", "expired"]),
                isNull(jobs.outOfViewSince),
              ),
            ),
          ...tellWhile(
            ctx,
            admin,
            [job.clientId],
            {
              event: "job.out-of-view",
              title: `Your Job is out of view until you fix it: ${job.title}`,
              link: `/jobs/${job.id}`,
            },
            exists(
              ctx.db
                .select({ one: sql`1` })
                .from(jobs)
                .where(hidden),
            ),
          ),
        ];
      },
    }),
    async tab(ctx, jobId) {
      const job = await jobRow(ctx, jobId);
      return { label: "The Job", blocks: job ? jobBlocks(job) : [] };
    },
    // Each reporter is an Artisan who saw the Job, and may have talked with its Client.
    async conversations(ctx, item) {
      const made = await reportsOf(ctx, item.id);
      return made.map((each) => ({
        jobId: item.subjectId,
        artisanId: each.reporterId,
        with: each.reporter,
      }));
    },
  }),
  quote: defineReportKind("quote", {
    async tab(ctx, quoteId) {
      const quote = await quoteRow(ctx, quoteId);
      return { label: "The Quote", blocks: quote ? quoteBlocks(quote) : [] };
    },
    async conversations(ctx, item) {
      const quote = await quoteRow(ctx, item.subjectId);
      return quote ? [{ jobId: quote.jobId, artisanId: quote.artisanId, with: "" }] : [];
    },
  }),
  message: defineReportKind("message", {
    // Its files open with the Conversation, on the logged click.
    async tab(ctx, messageId) {
      const message = await messageRow(ctx, messageId);
      const files = message ? message.photos.length + message.files.length : 0;
      return {
        label: "The message",
        blocks: message
          ? [
              { kind: "text", text: `${formatTime(message.sentAt)} · ${message.text}` },
              ...(files > 0
                ? [{ kind: "text" as const, text: `With ${files} file(s): open the Conversation.` }]
                : []),
            ]
          : [],
      };
    },
    async conversations(ctx, item) {
      const message = await messageRow(ctx, item.subjectId);
      const conversation = message && (await conversationRow(ctx, message.conversationId));
      return conversation
        ? [{ jobId: conversation.jobId, artisanId: conversation.artisanId, with: "" }]
        : [];
    },
  }),
  profile: defineReportKind("profile", {
    outcomes: outOfView("The Artisan, with what to fix", {
      async possible(ctx, artisanId) {
        const [row] = await ctx.db
          .select({ since: accounts.profileOutOfViewSince })
          .from(accounts)
          .where(eq(accounts.id, artisanId));
        return !!row && !row.since;
      },
      async writes(ctx, admin, artisanId, reason) {
        const now = ctx.now();
        const hidden = and(eq(accounts.id, artisanId), eq(accounts.profileOutOfViewSince, now))!;
        return [
          ctx.db
            .update(accounts)
            .set({ profileOutOfViewSince: now, profileOutOfViewFor: reason })
            .where(and(eq(accounts.id, artisanId), isNull(accounts.profileOutOfViewSince))),
          ...tellWhile(
            ctx,
            admin,
            [artisanId],
            {
              event: "profile.out-of-view",
              title: "Your Profile is out of view until you fix it",
              link: "/profile",
            },
            exists(
              ctx.db
                .select({ one: sql`1` })
                .from(accounts)
                .where(hidden),
            ),
          ),
        ];
      },
    }),
    async tab(ctx, artisanId) {
      const [shown, account] = await Promise.all([
        shownVersion(ctx, artisanId),
        accountRow(ctx, artisanId),
      ]);
      return {
        label: "The Profile",
        blocks: [
          { kind: "text", text: account ? publicName(account) : "" },
          ...versionBlocks(artisanId, shown),
        ],
      };
    },
  }),
  review: defineReportKind("review", {
    // Removed only for fraud, abuse, or personal data (#138), never for a low rating.
    outcomes: Object.fromEntries(
      Object.entries(groundDecisions(REMOVE, "Remove")).map(([key, option]) => [
        key,
        {
          option,
          async possible(ctx, reviewId) {
            return (await reviewRow(ctx, reviewId))?.state === "published";
          },
          async writes(ctx, admin, reviewId, reason) {
            const ground = groundOf(REMOVE, key)!;
            return endWrites(
              ctx,
              admin,
              reviewId,
              { from: "published", to: "removed" },
              ground,
              reason,
            );
          },
        } satisfies Outcome,
      ]),
    ),
    async tab(ctx, reviewId) {
      const review = await reviewRow(ctx, reviewId);
      const reviewed = review && (await accountRow(ctx, review.reviewedId));
      return {
        label: "The Review",
        blocks: review
          ? [
              { kind: "text", text: `Of ${reviewed ? reviewed.name : "an Account"}` },
              ...reviewBlocks(review),
            ]
          : [],
      };
    },
    // The Conversation of the Job it is on, between its two parties.
    async conversations(ctx, item) {
      const review = await reviewRow(ctx, item.subjectId);
      return review ? [{ jobId: review.jobId, artisanId: review.artisanId, with: "" }] : [];
    },
  }),
} satisfies Record<ReportSubject, unknown>;

/** The Account the item's Reports are of; null if it is gone. */
async function reportedOf(ctx: Context, item: QueueItem) {
  const [row] = await ctx.db
    .select({ reportedId: reports.reportedId })
    .from(reports)
    .where(eq(reports.queueItemId, item.id))
    .limit(1);
  return row?.reportedId ?? null;
}

async function accountRow(ctx: Context, accountId: string) {
  const [row] = await ctx.db
    .select({
      id: accounts.id,
      name: accounts.name,
      tradingName: accounts.tradingName,
      kind: accounts.kind,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return row ?? null;
}

/** The Reports folded into the item, oldest first, each with its reporter. */
export async function reportsOf(ctx: Context, itemId: string) {
  return ctx.db
    .select({
      reason: reports.reason,
      note: reports.note,
      noteHeldFor: reports.noteHeldFor,
      reportedId: reports.reportedId,
      reportedAt: reports.reportedAt,
      reporter: accounts.name,
      reporterId: reports.reporterId,
      reporterKind: accounts.kind,
    })
    .from(reports)
    .innerJoin(accounts, eq(accounts.id, reports.reporterId))
    .where(eq(reports.queueItemId, itemId))
    .orderBy(asc(reports.reportedAt), asc(sql.raw(`"reports"."rowid"`)));
}

/** The Reports tab, who is reported in the sidebar, and when each Report came. */
async function reportsView(ctx: Context, item: QueueItem): Promise<ItemView> {
  const made = await reportsOf(ctx, item.id);
  const reportedId = made[0]?.reportedId;
  return {
    tabs: [
      {
        key: "reports",
        label: "Reports",
        blocks: [
          { kind: "facts", facts: [{ label: "Reports", value: String(made.length) }] },
          ...made.map((each): Block => ({
            kind: "text",
            text: [
              `${formatTime(each.reportedAt)} · ${each.reporter} (${each.reporterKind === "client" ? "Client" : "Artisan"}): ${REPORT_REASON_NAMES[each.reason]}`,
              each.note && `“${each.note}”`,
              each.noteHeldFor && `The Content check was unsure of the note: ${each.noteHeldFor}`,
            ]
              .filter(Boolean)
              .join("\n"),
          })),
        ],
      },
    ],
    sidebar: reportedId ? await accountSidebar(ctx, reportedId, "Reported") : [],
    timeline: made.map((each) => ({ at: each.reportedAt, text: "Reported" })),
  };
}
