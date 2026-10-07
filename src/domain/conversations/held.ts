import { and, eq } from "drizzle-orm";
import { system } from "../actor";
import type { Context, Write } from "../context";
import { defineHeldKind, refusedFor } from "../content/held";
import { jobBlocks } from "../jobs/held";
import { jobRow } from "../jobs/rows";
import { accountSidebar } from "../quotes/held";
import type { Block } from "../queues";
import { messages } from "../schema";
import { messageFilePath } from "./parties";
import {
  conversationRow,
  messageRow,
  newMessageTell,
  takesMessages,
  takesMessagesNow,
  type MessageRow,
} from "./rows";

// A message the Content check is unsure about, or cannot read, is Held (ADR
// 0020): it is "being checked" to its sender and does not exist for the other
// party until the Admin releases it. Released while the Conversation still
// takes messages, it is delivered then; otherwise it is unsent.

export const heldMessage = defineHeldKind("held.message", {
  async sender(ctx, subjectId) {
    return (await messageRow(ctx, subjectId))?.senderId ?? null;
  },
  async release(ctx, _admin, subjectId) {
    const message = await messageRow(ctx, subjectId);
    const conversation = message && (await conversationRow(ctx, message.conversationId));
    if (!message?.senderId || !conversation) return [];
    const now = ctx.now();
    const held = and(eq(messages.id, message.id), eq(messages.state, "held"));
    return [
      ctx.db
        .update(messages)
        .set({ state: "delivered", deliveredAt: now })
        .where(and(held, takesMessages(ctx, conversation.id))),
      ctx.db.update(messages).set({ state: "unsent" }).where(held),
      ...newMessageTell(ctx, system, conversation, { id: message.id, senderId: message.senderId }),
    ];
  },
  async refuse(ctx, _admin, subjectId) {
    return [
      ctx.db
        .update(messages)
        .set({ state: "refused" })
        .where(and(eq(messages.id, subjectId), eq(messages.state, "held"))),
    ];
  },
  told: {
    async released(ctx, subjectId) {
      const message = await messageRow(ctx, subjectId);
      return message && (await takesMessagesNow(ctx, message.conversationId))
        ? "Your message is checked and delivered"
        : "Your message is checked, but the Conversation has ended";
    },
    refused: "Your message was refused",
    async link(ctx, subjectId) {
      const message = await messageRow(ctx, subjectId);
      const conversation = message && (await conversationRow(ctx, message.conversationId));
      return conversation ? `/jobs/${conversation.jobId}?conversation=${conversation.id}` : "/";
    },
  },
  async view(ctx, item) {
    const message = await messageRow(ctx, item.subjectId);
    const conversation = message && (await conversationRow(ctx, message.conversationId));
    const job = conversation && (await jobRow(ctx, conversation.jobId));
    if (!message?.senderId || !job) return { tabs: [], sidebar: [] };
    // The Admin reads the message being checked, never the Conversation round it (ADR 0010).
    return {
      tabs: [
        { key: "message", label: "The message", blocks: messageBlocks(message) },
        { key: "job", label: "The Job", blocks: jobBlocks(job) },
        {
          key: "check",
          label: "Content check",
          blocks: [{ kind: "text", text: message.heldFor ?? "The Content check could not run." }],
        },
      ],
      sidebar: await accountSidebar(
        ctx,
        message.senderId,
        message.senderId === job.clientId ? "Client" : "Artisan",
      ),
    };
  },
});

/** What the Admin reads of a message: its text, its photos, and its voice notes and PDFs. */
function messageBlocks(message: MessageRow): Block[] {
  const blocks: Block[] = [];
  if (message.text) blocks.push({ kind: "text", text: message.text });
  const files = [...message.photos, ...message.files];
  if (files.length > 0) {
    const counted: Partial<Record<(typeof files)[number]["kind"], number>> = {};
    blocks.push({
      kind: "files",
      files: files.map((file) => {
        counted[file.kind] = (counted[file.kind] ?? 0) + 1;
        return {
          kind: file.kind,
          label: `${FILE_LABELS[file.kind]} ${counted[file.kind]}`,
          href: messageFilePath(file),
        };
      }),
    });
  }
  return blocks;
}

const FILE_LABELS = { photo: "Photo", "voice-note": "Voice note", pdf: "PDF" } as const;

/** The writes that Hold a message for the Admin's Pre-check. */
export function holdWrites(
  ctx: Context,
  message: typeof messages.$inferInsert,
  jobTitle: string,
): Write[] {
  return [
    ctx.db.insert(messages).values(message),
    heldMessage.raise(ctx, { subjectId: message.id!, title: `Message: ${jobTitle}` }).write,
  ];
}

/** The writes that withdraw a Held message, guarded on its still being Held. */
export async function withdrawHeldMessage(ctx: Context, messageId: string): Promise<Write[]> {
  return [
    ctx.db
      .update(messages)
      .set({ state: "withdrawn" })
      .where(and(eq(messages.id, messageId), eq(messages.state, "held"))),
    ...(await heldMessage.withdraw(ctx, messageId)),
  ];
}

/** Why the Admin refused each of these messages, by id, for those refused. */
export async function refusalsOf(ctx: Context, refused: readonly { id: string }[]) {
  const reasons = new Map<string, string>();
  for (const message of refused) {
    reasons.set(message.id, (await refusedFor(ctx, heldMessage.kind, message.id)) ?? "");
  }
  return reasons;
}
