import { and, asc, eq, sql } from "drizzle-orm";
import type { Context } from "../context";
import { fileLink } from "../file-links";
import type { Block } from "../queues";
import { formatTime } from "../sa-days";
import { accounts, conversations, messages } from "../schema";
import type { StoredFile } from "../uploads";

// The Admin reads a Conversation only from a Dispute, a Report, or a
// Chargeback on its Job, on a click the audit log holds first (ADR 0010).

/** What a row that is not speech says, for the Admin. */
const EVENT_NAMES: Record<string, string> = {
  "quote.sent": "Quote sent",
  hire: "Hired",
  "work.started": "Work started",
  "completion.made": "Marked complete",
  "fix.requested": "Fix requested",
  approved: "Approved",
  refund: "Refund",
  cancelled: "Cancelled",
  "dispute.opened": "Dispute opened",
  "dispute.released": "Released in Dispute",
  "dispute.settled": "Dispute settled",
  "dispute.decided": "Dispute decided",
};

/**
 * A Conversation, by its Job and Artisan, as the Admin reads it on a logged
 * click from a Dispute or a Report (ADR 0010): every
 * delivered message and event row, oldest first, with each file on a link
 * that works for a while. Messages Held or refused are not in it.
 */
export async function conversationBlocks(
  ctx: Context,
  between: { jobId: string; artisanId: string },
): Promise<Block[]> {
  const rows = await ctx.db
    .select({ message: messages, sender: accounts.name, senderKind: accounts.kind })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .leftJoin(accounts, eq(accounts.id, messages.senderId))
    .where(
      and(
        eq(conversations.jobId, between.jobId),
        eq(conversations.artisanId, between.artisanId),
        eq(messages.state, "delivered"),
      ),
    )
    .orderBy(asc(messages.deliveredAt), asc(sql.raw(`"messages"."rowid"`)));
  if (rows.length === 0) return [{ kind: "text", text: "Nothing was said." }];
  const blocks: Block[] = [];
  for (const { message, sender, senderKind } of rows) {
    const at = formatTime(message.deliveredAt ?? message.sentAt);
    if (message.event) {
      const name = EVENT_NAMES[message.event] ?? message.event;
      blocks.push({
        kind: "text",
        text: `${at} · ${name}${message.text ? `: ${message.text}` : ""}`,
      });
      continue;
    }
    const who = `${sender ?? ""} (${senderKind === "client" ? "Client" : "Artisan"})`;
    blocks.push({ kind: "text", text: `${at} · ${who}: ${message.text}` });
    const files = [...message.photos, ...message.files];
    if (files.length > 0) {
      blocks.push({
        kind: "files",
        files: await Promise.all(
          files.map(async (file, index) => ({
            kind: file.kind,
            label: `${FILE_NAMES[file.kind]} ${index + 1}`,
            href: await fileLink(ctx, file.key),
          })),
        ),
      });
    }
  }
  return blocks;
}

const FILE_NAMES: Record<StoredFile["kind"], string> = {
  photo: "Photo",
  pdf: "PDF",
  "voice-note": "Voice note",
};
