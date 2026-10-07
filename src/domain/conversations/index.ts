import { and, asc, eq, getTableColumns, inArray, or, sql } from "drizzle-orm";
import { accountIdOf, type Actor } from "../actor";
import { checkContent } from "../content/check";
import { alreadyChecked, isAlreadyDecided } from "../content/held";
import type { Context } from "../context";
import { insertWhile } from "../guarded";
import { jobRow, type JobPhoto } from "../jobs/rows";
import { ok, refuse } from "../result";
import { conversations, messages } from "../schema";
import { defineSection } from "../section";
import { emailTells } from "../tells";
import { checkFileCount, discardFiles, uploadFile, UPLOAD_CONTEXTS } from "../uploads";
import { MESSAGE_MAX } from "./inputs";
import { heldMessage, holdWrites, refusalsOf, withdrawHeldMessage } from "./held";
import { messagePhotoPath, namesOf, viewerOf, withheldOf } from "./parties";
import {
  conversationRow,
  messageRow,
  newMessageTell,
  unreadBy,
  type Party,
  takesMessages,
  takesMessagesNow,
  type MessageRow,
} from "./rows";

// Conversations (#125, ADR 0010): each Client and Artisan on a Job talk in
// one, opened by the first Quote Sent or the Invitation. The Admin may read it
// and never writes in it. Before Payment it takes text and photos, and every
// message is read by the Content check before the other party sees it (ADR
// 0011). Nothing delivered is ever changed or removed.

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
        /** Whether the viewer has sent nothing here yet, so is told first that the Admin may read it. */
        firstMessage: !(await hasSent(ctx, conversation.id, accountId)),
        items: rows.map((row) => itemView(row, accountId, reasons)),
      };
    },

    /**
     * Sends a message in the Conversation: text, photos, or both. The Content
     * check reads it first, before Payment: a sure hit is refused with the
     * reason and nothing is kept; an unsure one is Held for the Admin, and
     * is "being checked" to its sender only. The other party is told of the
     * first message they have not read.
     */
    async send(actor: Actor, input: { conversationId: string; text: string; photos?: Blob[] }) {
      const conversation = await conversationRow(ctx, input.conversationId);
      const accountId = accountIdOf(actor);
      if (!conversation || !accountId || !(await viewerOf(ctx, conversation, accountId))) {
        return refuse("not-found", "That Conversation does not exist.");
      }
      const text = input.text.trim();
      const add = input.photos ?? [];
      if (!text && add.length === 0) return refuse("invalid", "Write a message or add a photo.");
      if (text.length > MESSAGE_MAX) {
        return refuse("invalid", `A message is at most ${MESSAGE_MAX} characters.`);
      }
      const counted = checkFileCount("messageAttachments", add.length);
      if (!counted.ok) return counted;
      if (!(await takesMessagesNow(ctx, conversation.id))) return readOnly();

      const uploaded = await takePhotos(ctx, add);
      if (!uploaded.ok) return uploaded;
      const photos = uploaded.value;
      const now = ctx.now();
      const message: MessageRow = {
        id: ctx.newId(),
        conversationId: conversation.id,
        senderId: accountId,
        event: null,
        text,
        photos,
        state: "held",
        heldFor: null,
        sentAt: now,
        deliveredAt: null,
      };
      try {
        const checked = await checkContent(ctx, {
          text,
          files: photos,
          context: { kind: "before-payment" },
          withheld: await withheldOf(ctx, conversation),
        });
        if (!checked.ok) {
          await discardFiles(ctx, photos);
          return checked;
        }
        if (checked.value.verdict === "held") {
          await ctx.commit(
            holdWrites(ctx, { ...message, heldFor: checked.value.reason }, conversation.job.title),
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
          await discardFiles(ctx, photos);
          return readOnly();
        }
      } catch (error) {
        await discardFiles(ctx, photos);
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
      await discardFiles(ctx, message.photos);
      return ok({});
    },

    /**
     * A photo in a message, or its thumbnail: to a party who sees the
     * message, and to the Admin for a message that was Held, which they read
     * to decide it. Null for anyone else.
     */
    async photo(viewer: Actor, input: { photoId: string; thumbnail?: boolean }) {
      const found = await photoById(ctx, input.photoId);
      if (!found) return null;
      const { message, photo } = found;
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
      const object = await ctx.ports.files.get(input.thumbnail ? photo.thumbnailKey : photo.key);
      if (!object) return null;
      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType ?? "image/webp",
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
      href: messagePhotoPath(photo),
      thumbnailHref: messagePhotoPath(photo, true),
    })),
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

/** Uploads a message's photos. Nothing is stored if any is refused. */
async function takePhotos(ctx: Context, add: Blob[]) {
  const added: JobPhoto[] = [];
  try {
    for (const file of add) {
      const uploaded = await uploadFile(ctx, file, UPLOAD_CONTEXTS.beforePayment);
      if (!uploaded.ok) {
        await discardFiles(ctx, added);
        return uploaded;
      }
      if (uploaded.value.kind === "photo") added.push(uploaded.value);
    }
  } catch (error) {
    await discardFiles(ctx, added);
    throw error;
  }
  return ok(added);
}

/** The message holding the photo, and the photo; null if none does. */
async function photoById(ctx: Context, photoId: string) {
  const [row] = await ctx.db
    .select(getTableColumns(messages))
    .from(messages)
    .where(
      sql`exists (select 1 from json_each(${messages.photos}) where json_extract(value, '$.id') = ${photoId})`,
    );
  const photo = row?.photos.find((each) => each.id === photoId);
  return row && photo ? { message: row, photo } : null;
}

function readOnly() {
  return refuse("read-only", "This Conversation has ended.");
}
