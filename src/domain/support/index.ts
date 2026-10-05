import * as z from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { accountIdOf, type Actor } from "../actor";
import { firstProblem } from "../accounts/inputs";
import type { Context, Write } from "../context";
import { defineQueueItemKind, type ItemView } from "../queues";
import { ok, refuse } from "../result";
import { accounts, authUsers, queueItems, supportRequests } from "../schema";
import { defineSection } from "../section";
import { emailAddress } from "../tells";
import {
  SUPPORT_MESSAGE_MAX,
  SUPPORT_TOPIC_NAMES,
  SUPPORT_TOPICS,
  SUPPORT_WAITING_MAX,
} from "./topics";

// A Support request: a signed-in Account's message to the Admin under a fixed
// topic, which the Admin answers in the product and the answer goes back by
// email (#117). Any Account may send one, a Suspended one included, so
// nothing but being signed in as an Account gates it.

const requestInput = z.object({
  topic: z.enum(SUPPORT_TOPICS, { error: "Choose what it is about." }),
  message: z
    .string()
    .trim()
    .min(1, { error: "Write what you need." })
    .max(SUPPORT_MESSAGE_MAX, {
      error: `Keep it to ${SUPPORT_MESSAGE_MAX} characters.`,
    }),
});

/** An Account's request, which the Admin answers by email. */
const accountRequest = defineQueueItemKind("support.request", {
  queue: "support",
  decisions: {
    answer: {
      label: "Answer",
      told: "The Account, by email",
      reason: "required",
      reasonLabel: "Answer",
    },
  },
  async decide(ctx, _admin, item, choice) {
    const sent = await requestRow(ctx, item.subjectId);
    // Nobody to answer if the Account is gone.
    if (!sent?.email || !sent.topic) return ok([]);
    return ok([
      emailAddress(ctx, sent.email, {
        event: "support.answered",
        title: "Your Support request is answered",
        link: "/support",
        body: [
          `Your Support request about ${SUPPORT_TOPIC_NAMES[sent.topic]} is answered:`,
          choice.reason ?? "",
          "You wrote:",
          sent.message,
          "To write to us again, use Contact support.",
        ].join("\n\n"),
      }),
    ]);
  },
  async view(ctx, item) {
    const sent = await requestRow(ctx, item.subjectId);
    return sent?.topic ? requestView(sent, "Topic", SUPPORT_TOPIC_NAMES[sent.topic]) : EMPTY_VIEW;
  },
});

/** The tags a system request is raised with, and their names for the Admin. */
const SUPPORT_TAGS = {
  "failed-refund": "Failed Refund",
  "paused-money": "Paused money",
} as const;

export type SupportTag = keyof typeof SUPPORT_TAGS;

/**
 * A system request: `about` titles it for the Admin, `details` says what
 * happened, and `accountId` names the Account it concerns, if one does.
 */
export type SystemSupportRequest = {
  tag: SupportTag;
  about: string;
  details: string;
  accountId?: string;
};

/** A request the platform raises itself, for what only the Admin can settle. */
const systemRequest = defineQueueItemKind("support.system", {
  queue: "support",
  decisions: {
    resolve: { label: "Resolve", told: "Nobody", reason: "optional", reasonLabel: "Note" },
  },
  async decide() {
    return ok([]);
  },
  async view(ctx, item) {
    const raised = await requestRow(ctx, item.subjectId);
    return raised?.tag ? requestView(raised, "Tag", tagName(raised.tag)) : EMPTY_VIEW;
  },
});

/**
 * The writes that raise a system Support request, such as for a failed
 * Refund; commit them with the event that raises it.
 */
export function raiseSupportRequest(ctx: Context, input: SystemSupportRequest): Write[] {
  const requestId = ctx.newId();
  return [
    ctx.db.insert(supportRequests).values({
      id: requestId,
      accountId: input.accountId ?? null,
      tag: input.tag,
      message: input.details,
      sentAt: ctx.now(),
    }),
    systemRequest.raise(ctx, {
      subjectId: requestId,
      title: `${SUPPORT_TAGS[input.tag]}: ${input.about}`,
    }).write,
  ];
}

function tagName(tag: string) {
  return tag in SUPPORT_TAGS ? SUPPORT_TAGS[tag as SupportTag] : tag;
}

export const supportSection = defineSection({
  name: "support",
  queueItems: [accountRequest, systemRequest],
  api: (ctx) => ({
    /** Sends the Admin a message under one of the fixed topics. */
    async send(actor: Actor, input: { topic: string; message: string }) {
      const accountId = accountIdOf(actor);
      if (!accountId) return refuse("sign-in-required", "Sign in to contact support.");
      const parsed = requestInput.safeParse(input);
      if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
      const { topic, message } = parsed.data;
      // Keeps one Account from filling the queue. Two sends at once may pass it together.
      if ((await waitingCount(ctx, accountId)) >= SUPPORT_WAITING_MAX) {
        return refuse(
          "too-many-waiting",
          `You have ${SUPPORT_WAITING_MAX} requests waiting for an answer. Write again once one is answered.`,
        );
      }

      const sender = await accountName(ctx, accountId);
      const requestId = ctx.newId();
      await ctx.commit([
        ctx.db
          .insert(supportRequests)
          .values({ id: requestId, accountId, topic, message, sentAt: ctx.now() }),
        accountRequest.raise(ctx, {
          subjectId: requestId,
          title: `${SUPPORT_TOPIC_NAMES[topic]}, from ${sender}`,
        }).write,
      ]);
      return ok({ requestId });
    },

    /** The viewer's own Support requests, newest first, and when each was answered. */
    async mine(viewer: Actor) {
      const accountId = accountIdOf(viewer);
      if (!accountId) return [];
      const rows = await ctx.db
        .select({
          requestId: supportRequests.id,
          topic: supportRequests.topic,
          message: supportRequests.message,
          sentAt: supportRequests.sentAt,
          answeredAt: queueItems.decidedAt,
        })
        .from(supportRequests)
        .innerJoin(
          queueItems,
          and(
            eq(queueItems.subjectId, supportRequests.id),
            eq(queueItems.kind, accountRequest.kind),
          ),
        )
        .where(eq(supportRequests.accountId, accountId))
        .orderBy(desc(supportRequests.sentAt), desc(supportRequests.id));
      // Every Account request has a topic; only a system request has none.
      return rows.flatMap((row) => (row.topic ? [{ ...row, topic: row.topic }] : []));
    },
  }),
});

/** How many of the Account's own requests wait for an answer. */
async function waitingCount(ctx: Context, accountId: string) {
  const [row] = await ctx.db
    .select({ count: sql<number>`count(*)` })
    .from(supportRequests)
    .innerJoin(
      queueItems,
      and(eq(queueItems.subjectId, supportRequests.id), eq(queueItems.kind, accountRequest.kind)),
    )
    .where(and(eq(supportRequests.accountId, accountId), isNull(queueItems.decidedAt)));
  return row?.count ?? 0;
}

async function requestRow(ctx: Context, requestId: string) {
  const [row] = await ctx.db
    .select({
      topic: supportRequests.topic,
      tag: supportRequests.tag,
      message: supportRequests.message,
      kind: accounts.kind,
      name: accounts.name,
      email: authUsers.email,
    })
    .from(supportRequests)
    .leftJoin(accounts, eq(accounts.id, supportRequests.accountId))
    .leftJoin(authUsers, eq(authUsers.id, supportRequests.accountId))
    .where(eq(supportRequests.id, requestId));
  return row ?? null;
}

const EMPTY_VIEW: ItemView = { tabs: [], sidebar: [] };

type RequestRow = NonNullable<Awaited<ReturnType<typeof requestRow>>>;

/** A request's page: what it is under (its topic or tag), its message, and its Account. */
function requestView(row: RequestRow, label: string, value: string): ItemView {
  return {
    tabs: [
      {
        key: "request",
        label: "Request",
        blocks: [
          { kind: "facts", facts: [{ label, value }] },
          { kind: "text", text: row.message },
        ],
      },
    ],
    sidebar: accountSidebar(row),
  };
}

/** The Account a request is from or about, if it has one. */
function accountSidebar(row: RequestRow): ItemView["sidebar"] {
  if (!row.kind) return [];
  return [
    {
      title: "Account",
      blocks: [
        {
          kind: "facts",
          facts: [
            { label: "Kind", value: row.kind === "client" ? "Client" : "Artisan" },
            { label: "Name", value: row.name ?? "" },
            { label: "Email", value: row.email ?? "" },
          ],
        },
      ],
    },
  ];
}

async function accountName(ctx: Context, accountId: string) {
  const [account] = await ctx.db
    .select({ name: accounts.name })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return account?.name ?? "an Account";
}
