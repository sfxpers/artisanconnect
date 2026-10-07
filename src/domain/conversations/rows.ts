import {
  and,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Actor } from "../actor";
import type { Context, Write } from "../context";
import { liveQuoteOf } from "../quotes/rows";
import {
  conversations,
  engagements,
  invitations,
  jobs,
  messages,
  quotes,
  suburbs,
} from "../schema";
import { tellWhile } from "../tells";
import type { MessageEvent } from "./inputs";

// Reading a Conversation, and the writes more than one section makes on one:
// a Quote Sent or an Invitation opens it, and a message is delivered by its
// sender's command or by the Admin's release of it.

export type MessageRow = typeof messages.$inferSelect;

export type ConversationRow = NonNullable<Awaited<ReturnType<typeof conversationRow>>>;

/**
 * A Conversation with what of its Job the module reads of it, and the
 * Engagement it is the Conversation of, if its Artisan was Hired; null if
 * there is none.
 */
export async function conversationRow(ctx: Context, conversationId: string) {
  const [row] = await ctx.db
    .select({
      conversation: conversations,
      job: {
        state: jobs.state,
        clientId: jobs.clientId,
        title: jobs.title,
        street: jobs.street,
        suburbName: suburbs.name,
      },
      engagementId: engagements.id,
    })
    .from(conversations)
    .innerJoin(jobs, eq(jobs.id, conversations.jobId))
    .leftJoin(suburbs, eq(suburbs.id, jobs.suburbId))
    .leftJoin(
      engagements,
      and(
        eq(engagements.jobId, conversations.jobId),
        eq(engagements.artisanId, conversations.artisanId),
      ),
    )
    .where(eq(conversations.id, conversationId));
  return row ? { ...row.conversation, job: row.job, engagementId: row.engagementId } : null;
}

/** A message by its id; null if there is none. */
export async function messageRow(ctx: Context, messageId: string) {
  const [row] = await ctx.db.select().from(messages).where(eq(messages.id, messageId));
  return row ?? null;
}

/**
 * The writes that open the Conversation of the Artisan on the Job, if it is
 * not open yet, only if the condition holds when they are written.
 */
export function openWrites(
  ctx: Context,
  on: { jobId: string; artisanId: string },
  condition: SQL,
): Write[] {
  return [
    ctx.db
      .insert(conversations)
      .select(
        ctx.db
          .select({
            id: sql<string>`${ctx.newId()}`.as("id"),
            jobId: sql<string>`${on.jobId}`.as("job_id"),
            artisanId: sql<string>`${on.artisanId}`.as("artisan_id"),
            openedAt: sql<number>`${ctx.now().getTime()}`.as("opened_at"),
            clientReadAt: sql<null>`null`.as("client_read_at"),
            artisanReadAt: sql<null>`null`.as("artisan_read_at"),
          })
          .from(sql`(select 1)`)
          .where(condition),
      )
      .onConflictDoNothing(),
  ];
}

/**
 * The writes that open the Conversation of the Quote's Artisan on its Job, if
 * need be, and show in it that the Quote was Sent, as a row that is not
 * speech: only if the Quote was Sent by the batch they are in, which inserts
 * it Sent or Sends it from Held.
 */
export function quoteSentWrites(
  ctx: Context,
  quote: { id: string; jobId: string; artisanId: string },
): Write[] {
  const sentNow = exists(
    ctx.db
      .select({ one: sql`1` })
      .from(quotes)
      .where(and(eq(quotes.id, quote.id), eq(quotes.state, "sent"))),
  );
  return [...openWrites(ctx, quote, sentNow), eventWrite(ctx, quote, "quote.sent", sentNow)];
}

/**
 * The write that shows an event in the Conversation of the Artisan on the
 * Job, as a row that is not speech, only if the condition holds when it is
 * written.
 */
export function eventWrite(
  ctx: Context,
  on: { jobId: string; artisanId: string },
  event: MessageEvent,
  condition: SQL,
): Write {
  const now = ctx.now();
  return ctx.db.insert(messages).select(
    ctx.db
      .select({
        id: sql<string>`${ctx.newId()}`.as("id"),
        conversationId: conversations.id,
        senderId: sql<null>`null`.as("sender_id"),
        event: sql<MessageEvent>`${event}`.as("event"),
        text: sql<string>`''`.as("text"),
        photos: sql<string>`'[]'`.as("photos"),
        files: sql<string>`'[]'`.as("files"),
        state: sql<string>`'delivered'`.as("state"),
        heldFor: sql<null>`null`.as("held_for"),
        sentAt: sql<number>`${now.getTime()}`.as("sent_at"),
        deliveredAt: sql<number>`${now.getTime()}`.as("delivered_at"),
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.jobId, on.jobId),
          eq(conversations.artisanId, on.artisanId),
          condition,
        ),
      ),
  );
}

/** The states of a Quote that ended before Hire, which ends its Conversation. */
const ENDED_QUOTE_STATES = ["declined", "withdrawn", "expired"] as const;

/** The Quote of the outer Conversation's Artisan on its Job, in one of these states. */
function quoteOfConversation(
  ctx: Context,
  states: readonly (typeof quotes.$inferSelect)["state"][],
) {
  return ctx.db
    .select({ one: sql`1` })
    .from(quotes)
    .where(
      and(
        eq(quotes.jobId, conversations.jobId),
        eq(quotes.artisanId, conversations.artisanId),
        inArray(quotes.state, states),
      ),
    );
}

/** The states of an Engagement that end its Conversation. */
const ENDED_ENGAGEMENT_STATES = ["completed", "cancelled"] as const;

/**
 * The SQL that is true while the Conversation takes messages: its Job is not
 * Closed, the Artisan's Quote did not end, and the Job is Open or the Quote is
 * still Sent (an Expired Job may still be Hired). Once Hired, only the Hired
 * Quote's goes on (#126), until its Engagement is Completed or Cancelled (#131).
 */
export function takesMessages(ctx: Context, conversationId: string) {
  return exists(
    ctx.db
      .select({ one: sql`1` })
      .from(conversations)
      .innerJoin(jobs, eq(jobs.id, conversations.jobId))
      .where(
        and(
          eq(conversations.id, conversationId),
          ne(jobs.state, "closed"),
          notExists(quoteOfConversation(ctx, ENDED_QUOTE_STATES)),
          or(eq(jobs.state, "open"), exists(quoteOfConversation(ctx, ["sent", "hired"]))),
          notExists(
            ctx.db
              .select({ one: sql`1` })
              .from(engagements)
              .where(
                and(
                  eq(engagements.jobId, conversations.jobId),
                  eq(engagements.artisanId, conversations.artisanId),
                  inArray(engagements.state, ENDED_ENGAGEMENT_STATES),
                ),
              ),
          ),
        ),
      ),
  );
}

/** Whether the Conversation takes messages now. */
export function takesMessagesNow(ctx: Context, conversationId: string): Promise<boolean> {
  return holdsNow(ctx, takesMessages(ctx, conversationId));
}

/** Which side of a Conversation an Account is on. */
export type Party = "client" | "artisan";

/**
 * The SQL that is true while the Conversation's Artisan sees it: while they
 * hold the Invitation, or once they have Quoted, whatever becomes of the Job.
 * One who passed the Invitation does not.
 */
export function seenByArtisan(ctx: Context, conversationId: string) {
  return exists(
    ctx.db
      .select({ one: sql`1` })
      .from(conversations)
      .innerJoin(jobs, eq(jobs.id, conversations.jobId))
      .where(
        and(
          eq(conversations.id, conversationId),
          or(
            exists(liveQuoteOf(ctx, conversations.jobId, conversations.artisanId)),
            exists(
              ctx.db
                .select({ one: sql`1` })
                .from(invitations)
                .where(
                  and(
                    eq(invitations.jobId, conversations.jobId),
                    eq(invitations.artisanId, conversations.artisanId),
                    isNull(invitations.passedAt),
                  ),
                ),
            ),
          ),
        ),
      ),
  );
}

/** Whether the SQL is true now. */
export async function holdsNow(ctx: Context, condition: SQL): Promise<boolean> {
  const [row] = await ctx.db.select({ holds: sql<number>`${condition}` }).from(sql`(select 1)`);
  return !!row?.holds;
}

/**
 * The SQL that is true of a message, joined to its Conversation, that the
 * party has not read: from the other party, delivered since they last opened it.
 */
export function unreadBy(conversationId: string, party: Party) {
  const readAt = party === "client" ? conversations.clientReadAt : conversations.artisanReadAt;
  const account =
    party === "client"
      ? sql`(select ${jobs.clientId} from ${jobs} where ${jobs.id} = ${conversations.jobId})`
      : conversations.artisanId;
  return and(
    eq(messages.conversationId, conversationId),
    eq(messages.state, "delivered"),
    isNotNull(messages.senderId),
    ne(messages.senderId, account),
    gt(messages.deliveredAt, sql`coalesce(${readAt}, 0)`),
  )!;
}

/**
 * The Tell of a message the batch delivers, to the other party while they
 * see the Conversation. It goes for the first message they have not read
 * only; the rest wait unread until they open it.
 */
export function newMessageTell(
  ctx: Context,
  actor: Actor,
  conversation: {
    id: string;
    jobId: string;
    artisanId: string;
    job: { clientId: string; title: string };
  },
  message: { id: string; senderId: string },
): Write[] {
  const to: Party = message.senderId === conversation.artisanId ? "client" : "artisan";
  return tellWhile(
    ctx,
    actor,
    [to === "client" ? conversation.job.clientId : conversation.artisanId],
    {
      event: "message.new",
      title: `New message on ${conversation.job.title}`,
      link: `/jobs/${conversation.jobId}?conversation=${conversation.id}`,
    },
    and(
      exists(
        ctx.db
          .select({ one: sql`1` })
          .from(messages)
          .where(and(eq(messages.id, message.id), eq(messages.state, "delivered"))),
      ),
      notExists(
        ctx.db
          .select({ one: sql`1` })
          .from(messages)
          .innerJoin(conversations, eq(conversations.id, messages.conversationId))
          .where(and(unreadBy(conversation.id, to), ne(messages.id, message.id))),
      ),
      to === "artisan" ? seenByArtisan(ctx, conversation.id) : undefined,
    )!,
  );
}
