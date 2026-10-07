import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { accountIdOf, type Actor } from "../actor";
import { checkContent } from "../content/check";
import { alreadyChecked, isAlreadyDecided } from "../content/held";
import type { Withheld } from "../content/patterns";
import type { Context } from "../context";
import { insertWhile } from "../guarded";
import { jobRow } from "../jobs/rows";
import type { ContentContext } from "../ports";
import { ok, refuse } from "../result";
import { conversations, messages, type MessageFile } from "../schema";
import { defineSection } from "../section";
import { emailTells } from "../tells";
import {
  checkFileCount,
  discardFiles,
  uploadFile,
  UPLOAD_CONTEXTS,
  type StoredFile,
} from "../uploads";
import { MESSAGE_MAX } from "./inputs";
import { heldMessage, holdWrites, refusalsOf, withdrawHeldMessage } from "./held";
import { messageFilePath, namesOf, viewerOf, withheldOf } from "./parties";
import {
  conversationRow,
  messageRow,
  newMessageTell,
  unreadBy,
  type Party,
  takesMessages,
  takesMessagesNow,
  type ConversationRow,
  type MessageRow,
} from "./rows";

// Conversations (#125, ADR 0010): each Client and Artisan on a Job talk in
// one, opened by the first Quote Sent or the Invitation. The Admin may read it
// and never writes in it. Before Payment it takes text and photos; once Hired,
// the Engagement's also takes voice notes and PDFs, and contact details (#131).
// Every message is read by the Content check before the other party sees it
// (ADR 0011). Nothing delivered is ever changed or removed.

/** The states of a message only its sender sees: being checked, or refused with the reason. */
const SENDER_ONLY = ["held", "refused"] as const;

export const conversationsSection = defineSection({
  name: "conversations",
  queueItems: [heldMessage],
  api: (ctx) => ({
    /**
     * The Conversations on the Job the viewer sees: each of the Client's,
     * one per Artisan in the order they opened, or the Artisan's own. Null
     * for anyone with no part in the Job.
     */
    async forJob(viewer: Actor, input: { jobId: string }) {
      const job = await jobRow(ctx, input.jobId);
      const accountId = accountIdOf(viewer);
      if (!job || !accountId) return null;
      const isClient = job.clientId === accountId;
      if (!isClient && viewer.kind !== "artisan") return null;
      const rows = await ctx.db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.jobId, job.id),
            isClient ? undefined : eq(conversations.artisanId, accountId),
          ),
        )
        .orderBy(asc(conversations.openedAt), asc(sql.raw(`"conversations"."rowid"`)));
      const summaries = [];
      for (const { id } of rows) {
        const conversation = (await conversationRow(ctx, id))!;
        const party = await viewerOf(ctx, conversation, accountId);
        if (!party) continue;
        const names = await namesOf(ctx, conversation);
        summaries.push({
          conversationId: conversation.id,
          with:
            party === "client"
              ? { artisanId: conversation.artisanId, name: names.artisan }
              : { name: names.client },
          unread: await unreadCount(ctx, conversation.id, party),
          takesMessages: await takesMessagesNow(ctx, conversation.id),
        });
      }
      return summaries;
    },

    /**
     * The Conversation as the viewer sees it, oldest first: what was
     * delivered, and the viewer's own messages being checked or refused,
     * which nobody else sees. Null for anyone else.
     */
    async view(viewer: Actor, input: { conversationId: string }) {
      const conversation = await conversationRow(ctx, input.conversationId);
      const accountId = accountIdOf(viewer);
      const party = conversation && (await viewerOf(ctx, conversation, accountId));
      if (!conversation || !party || !accountId) return null;
      const rows = await ctx.db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversation.id),
            or(
              eq(messages.state, "delivered"),
              and(eq(messages.senderId, accountId), inArray(messages.state, SENDER_ONLY)),
            ),
          ),
        )
        .orderBy(
          asc(sql`coalesce(${messages.deliveredAt}, ${messages.sentAt})`),
          asc(sql.raw(`"messages"."rowid"`)),
        );
      const reasons = await refusalsOf(
        ctx,
        rows.filter((row) => row.state === "refused"),
      );
      const names = await namesOf(ctx, conversation);
      return {
        conversationId: conversation.id,
        jobId: conversation.jobId,
        with: party === "client" ? { name: names.artisan } : { name: names.client },
        takesMessages: await takesMessagesNow(ctx, conversation.id),
        /** Whether it is the Engagement's, which takes voice notes, PDFs, and contact details. */
        afterPayment: conversation.engagementId !== null,
        /** Whether the viewer has sent nothing here yet, so is told first that the Admin may read it. */
        firstMessage: !(await hasSent(ctx, conversation.id, accountId)),
        items: rows.map((row) => itemView(row, accountId, reasons)),
      };
    },

    /**
     * Sends a message in the Conversation: text, files, or both. Before
     * Payment the files are photos; in the Engagement's, also voice notes and
     * PDFs. The Content check reads it first, as before Payment or as the
     * Engagement's: a sure hit is refused with the reason and nothing is
     * kept; an unsure one is Held for the Admin, and is "being checked" to
     * its sender only. The other party is told of the first message they
     * have not read.
     */
    async send(actor: Actor, input: { conversationId: string; text: string; files?: Blob[] }) {
      const conversation = await conversationRow(ctx, input.conversationId);
      const accountId = accountIdOf(actor);
      if (!conversation || !accountId || !(await viewerOf(ctx, conversation, accountId))) {
        return refuse("not-found", "That Conversation does not exist.");
      }
      const text = input.text.trim();
      const add = input.files ?? [];
      if (!text && add.length === 0) return refuse("invalid", "Write a message or add a photo.");
      if (text.length > MESSAGE_MAX) {
        return refuse("invalid", `A message is at most ${MESSAGE_MAX} characters.`);
      }
      const counted = checkFileCount("messageAttachments", add.length);
      if (!counted.ok) return counted;
      if (!(await takesMessagesNow(ctx, conversation.id))) return readOnly();

      const afterPayment = conversation.engagementId !== null;
      const uploaded = await takeFiles(ctx, add, afterPayment);
      if (!uploaded.ok) return uploaded;
      const stored = uploaded.value;
      const now = ctx.now();
      const message: MessageRow = {
        id: ctx.newId(),
        conversationId: conversation.id,
        senderId: accountId,
        event: null,
        text,
        photos: stored.filter((file) => file.kind === "photo"),
        files: stored.filter((file): file is MessageFile => file.kind !== "photo"),
        state: "held",
        heldFor: null,
        heldFilesText: null,
        sentAt: now,
        deliveredAt: null,
      };
      try {
        const checked = await checkContent(ctx, {
          text,
          files: stored,
          ...(await checkedAs(ctx, conversation)),
        });
        if (!checked.ok) {
          await discardFiles(ctx, stored);
          return checked;
        }
        if (checked.value.verdict === "held") {
          await ctx.commit(
            holdWrites(
              ctx,
              {
                ...message,
                heldFor: checked.value.reason,
                heldFilesText: checked.value.filesText || null,
              },
              conversation.job.title,
            ),
          );
          return ok({ messageId: message.id, state: "held" as const });
        }
        // A batch, not a commit, to read whether the guarded insert landed.
        const [delivered] = await ctx.db.batch([
          insertWhile(
            ctx,
            messages,
            { ...message, state: "delivered", deliveredAt: now },
            takesMessages(ctx, conversation.id),
          ).returning({ id: messages.id }),
          ...newMessageTell(ctx, actor, conversation, { id: message.id, senderId: accountId }),
        ]);
        if (delivered.length === 0) {
          await discardFiles(ctx, stored);
          return readOnly();
        }
      } catch (error) {
        await discardFiles(ctx, stored);
        throw error;
      }
      // The message stands whatever happens to an email; the clocks retry one that did not go.
      await emailTells(ctx).catch((error: unknown) => {
        console.error("Tell emails did not go", error);
      });
      return ok({ messageId: message.id, state: "delivered" as const });
    },

    /** Marks the Conversation opened by the viewer: what was delivered to them is read. */
    async opened(actor: Actor, input: { conversationId: string }) {
      const conversation = await conversationRow(ctx, input.conversationId);
      const accountId = accountIdOf(actor);
      const party = conversation && (await viewerOf(ctx, conversation, accountId));
      if (!conversation || !party) return refuse("not-found", "That Conversation does not exist.");
      await ctx.db
        .update(conversations)
        .set(party === "client" ? { clientReadAt: ctx.now() } : { artisanReadAt: ctx.now() })
        .where(eq(conversations.id, conversation.id));
      return ok({});
    },

    /** Withdraws the sender's message being checked. Nobody is told. */
    async withdrawHeld(actor: Actor, input: { messageId: string }) {
      const message = await messageRow(ctx, input.messageId);
      if (!message || message.state !== "held" || message.senderId !== accountIdOf(actor)) {
        return refuse("nothing-held", "That message is not being checked.");
      }
      try {
        await ctx.commit(await withdrawHeldMessage(ctx, message.id));
      } catch (error) {
        if (isAlreadyDecided(error)) return alreadyChecked();
        throw error;
      }
      await discardFiles(ctx, [...message.photos, ...message.files]);
      return ok({});
    },

    /**
     * A file in a message, or a photo's thumbnail: to a party who sees the
     * message, and to the Admin for a message that was Held, which they read
     * to decide it. Null for anyone else.
     */
    async file(viewer: Actor, input: { messageId: string; fileId: string; thumbnail?: boolean }) {
      const message = await messageRow(ctx, input.messageId);
      const file =
        message && [...message.photos, ...message.files].find((each) => each.id === input.fileId);
      if (!message || !file) return null;
      if (viewer.kind === "admin") {
        if (message.heldFor === null) return null;
      } else {
        const accountId = accountIdOf(viewer);
        const conversation = await conversationRow(ctx, message.conversationId);
        if (!conversation || !(await viewerOf(ctx, conversation, accountId))) return null;
        const mine = message.senderId === accountId;
        const sees =
          message.state === "delivered" ||
          (mine && (SENDER_ONLY as readonly string[]).includes(message.state));
        if (!sees) return null;
      }
      const key = input.thumbnail && file.kind === "photo" ? file.thumbnailKey : file.key;
      const object = await ctx.ports.files.get(key);
      if (!object) return null;
      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
        size: object.size,
      };
    },
  }),
});

/** A message, or an event's row, as the viewer sees it. */
function itemView(row: MessageRow, viewerId: string, reasons: Map<string, string>) {
  const at = row.deliveredAt ?? row.sentAt;
  if (row.event !== null) return { kind: "event" as const, event: row.event, at };
  return {
    kind: "message" as const,
    messageId: row.id,
    mine: row.senderId === viewerId,
    text: row.text,
    photos: row.photos.map((photo) => ({
      id: photo.id,
      width: photo.width,
      height: photo.height,
      href: messageFilePath(row.id, photo),
      thumbnailHref: messageFilePath(row.id, photo, true),
    })),
    files: row.files.map((file) =>
      file.kind === "voice-note"
        ? {
            id: file.id,
            kind: file.kind,
            seconds: file.seconds,
            href: messageFilePath(row.id, file),
          }
        : { id: file.id, kind: file.kind, href: messageFilePath(row.id, file) },
    ),
    // Only these are selected: one withdrawn or unsent is nobody's to see.
    state: row.state as "delivered" | (typeof SENDER_ONLY)[number],
    at,
    /** Why the Admin refused it, for its sender. */
    refused: row.state === "refused" ? { reason: reasons.get(row.id) ?? "" } : null,
  };
}

/** How many messages wait unread by the party. */
async function unreadCount(ctx: Context, conversationId: string, party: Party) {
  const [row] = await ctx.db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(unreadBy(conversationId, party));
  return row?.count ?? 0;
}

/** Whether the Account has sent anything in the Conversation that was not withdrawn. */
async function hasSent(ctx: Context, conversationId: string, accountId: string) {
  const [row] = await ctx.db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.senderId, accountId),
        inArray(messages.state, ["delivered", "held", "refused", "unsent"]),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * How the Content check reads a message in the Conversation: as the
 * Engagement's, where contact may be swapped, or as before Payment, when
 * neither the Job's address nor an unshown surname may be said either.
 */
async function checkedAs(
  ctx: Context,
  conversation: ConversationRow,
): Promise<{ context: ContentContext; withheld?: Withheld }> {
  if (conversation.engagementId !== null) {
    return {
      context: { kind: "engagement-conversation", engagementId: conversation.engagementId },
    };
  }
  return { context: { kind: "before-payment" }, withheld: await withheldOf(ctx, conversation) };
}

/**
 * Uploads a message's files: photos, and in the Engagement's Conversation
 * voice notes and PDFs too. Nothing is stored if any is refused.
 */
async function takeFiles(ctx: Context, add: Blob[], afterPayment: boolean) {
  const where = afterPayment ? UPLOAD_CONTEXTS.afterPayment : UPLOAD_CONTEXTS.beforePayment;
  const added: StoredFile[] = [];
  try {
    for (const file of add) {
      const uploaded = await uploadFile(ctx, file, where);
      if (!uploaded.ok) {
        await discardFiles(ctx, added);
        return uploaded;
      }
      added.push(uploaded.value);
    }
  } catch (error) {
    await discardFiles(ctx, added);
    throw error;
  }
  return ok(added);
}

function readOnly() {
  return refuse("read-only", "This Conversation has ended.");
}
