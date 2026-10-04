import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Actor, AdminActor } from "./actor";
import { audit, logRead } from "./audit";
import type { Context, Write } from "./context";
import { causedBy } from "./errors";
import { adminOnly, ok, refuse, type Result } from "./result";
import { QUEUE_NAMES, type QueueName } from "./queue-names";
import { admins, queueItems } from "./schema";
import { emailTells } from "./tells";

// The Admin works from one home stream of eight queues and decides each item
// on its page (#107): a Decision card offering only the allowed decisions and
// saying who is told, tabs, and a sidebar. Each later ticket plugs its kinds
// of item (a Dispute, a Held Quote, a Verification) into this, as it plugs its
// clocks into run due clocks.

/** What an item page shows in a tab or the sidebar. */
export type Block =
  | { kind: "text"; text: string }
  | { kind: "facts"; facts: { label: string; value: string }[] };

/** One decision a kind of item can have. */
export type DecisionOption = {
  label: string;
  /** Who the decision tells, said for the Admin: "The Artisan", "Both", "Nobody". */
  told: string;
  reason: "required" | "optional" | "none";
};

/** A decision allowed on an item now, by its key. */
export type AllowedDecision = DecisionOption & { key: string };

/** An item as its kind sees it. */
export type QueueItem = {
  id: string;
  kind: string;
  subjectId: string;
  title: string;
  raisedAt: Date;
};

export type ItemView = {
  /**
   * A tab shows its blocks, or, for a read that is logged (a Conversation, an
   * identity document), names the read that opens it on a click.
   */
  tabs: (
    | { key: string; label: string; blocks: Block[] }
    | { key: string; label: string; read: string }
  )[];
  sidebar: { title: string; blocks: Block[] }[];
  /** The kind's own events; the page adds when it was raised and decided. */
  timeline?: { at: Date; text: string }[];
};

type QueueItemKindDefinition = {
  queue: QueueName;
  /** Every decision this kind can have, by key. */
  decisions: Record<string, DecisionOption>;
  /** The keys of the decisions allowed now. All of them, if left out. */
  allowed?(ctx: Context, item: QueueItem): Promise<string[]>;
  /**
   * The writes a decision makes (its state change, its Tells), or a refusal.
   * They are committed with the decision, so a refusal records nothing. A
   * command may land between the read and the batch, so each write must carry
   * the condition it read, as a clock's must.
   */
  decide(
    ctx: Context,
    admin: AdminActor,
    item: QueueItem,
    choice: { decision: string; reason: string | null },
  ): Promise<Result<Write[]>>;
  view(ctx: Context, item: QueueItem): Promise<ItemView>;
  /** What opens on a logged click, by key. Each opening is written to the audit log. */
  reads?: Record<string, { label: string; open(ctx: Context, item: QueueItem): Promise<Block[]> }>;
};

export type QueueItemKind = QueueItemKindDefinition & {
  kind: string;
  /** The write that puts an item in its queue; commit it with the event that raises it. */
  raise(ctx: Context, item: { subjectId: string; title: string }): { write: Write; itemId: string };
};

/** A kind of queue item, by a name unique across the module. */
export function defineQueueItemKind(
  kind: string,
  definition: QueueItemKindDefinition,
): QueueItemKind {
  return {
    ...definition,
    kind,
    raise(ctx, item) {
      const itemId = ctx.newId();
      const write = ctx.db.insert(queueItems).values({
        id: itemId,
        queue: definition.queue,
        kind,
        subjectId: item.subjectId,
        title: item.title,
        raisedAt: ctx.now(),
      });
      return { write, itemId };
    },
  };
}

function notFound() {
  return refuse("not-found", "That queue item does not exist.");
}

export function createQueues(ctx: Context, kinds: Record<string, QueueItemKind>) {
  function kindOf(item: { kind: string }): QueueItemKind {
    const kind = kinds[item.kind];
    if (!kind) throw new Error(`No queue item kind "${item.kind}"`);
    return kind;
  }

  async function counts() {
    const rows = await ctx.db
      .select({ queue: queueItems.queue, count: sql<number>`count(*)` })
      .from(queueItems)
      .where(isNull(queueItems.decidedAt))
      .groupBy(queueItems.queue);
    const byQueue = Object.fromEntries(QUEUE_NAMES.map((queue) => [queue, 0])) as Record<
      QueueName,
      number
    >;
    for (const row of rows) byQueue[row.queue] = row.count;
    return byQueue;
  }

  async function find(itemId: string) {
    const [row] = await ctx.db
      .select({
        id: queueItems.id,
        queue: queueItems.queue,
        kind: queueItems.kind,
        subjectId: queueItems.subjectId,
        title: queueItems.title,
        raisedAt: queueItems.raisedAt,
        decision: queueItems.decision,
        reason: queueItems.reason,
        decidedAt: queueItems.decidedAt,
        decidedBy: admins.email,
      })
      .from(queueItems)
      .leftJoin(admins, eq(admins.id, queueItems.decidedBy))
      .where(eq(queueItems.id, itemId));
    return row ?? null;
  }

  async function allowedNow(kind: QueueItemKind, item: QueueItem): Promise<AllowedDecision[]> {
    const keys = kind.allowed ? await kind.allowed(ctx, item) : Object.keys(kind.decisions);
    return keys.flatMap((key) => {
      const option = kind.decisions[key];
      return option ? [{ key, ...option }] : [];
    });
  }

  return {
    /**
     * The Admin home: every queue's count, and one stream of their open
     * items, oldest first: every queue's, or one queue's.
     */
    async home(viewer: Actor, input: { queue?: QueueName } = {}) {
      if (viewer.kind !== "admin") return null;
      const [items, byQueue] = await Promise.all([
        ctx.db
          .select({
            id: queueItems.id,
            queue: queueItems.queue,
            title: queueItems.title,
            raisedAt: queueItems.raisedAt,
          })
          .from(queueItems)
          .where(
            and(
              isNull(queueItems.decidedAt),
              input.queue ? eq(queueItems.queue, input.queue) : undefined,
            ),
          )
          .orderBy(asc(queueItems.raisedAt), asc(queueItems.id))
          .limit(500),
        counts(),
      ]);
      return { counts: byQueue, items };
    },

    /** One item's page. Once decided it shows the decision and offers none. */
    async item(viewer: Actor, input: { itemId: string }) {
      if (viewer.kind !== "admin") return null;
      const row = await find(input.itemId);
      if (!row) return null;
      const kind = kindOf(row);
      const [view, byQueue, allowed] = await Promise.all([
        kind.view(ctx, row),
        counts(),
        row.decidedAt ? [] : allowedNow(kind, row),
      ]);
      const decided =
        row.decision && row.decidedAt
          ? {
              decision: row.decision,
              label: kind.decisions[row.decision]?.label ?? row.decision,
              reason: row.reason,
              /** The Admin who decided; null for what the sender did, such as withdrawing. */
              by: row.decidedBy,
              at: row.decidedAt,
            }
          : null;
      const timeline = [
        { at: row.raisedAt, text: "Raised" },
        ...(view.timeline ?? []),
        ...(decided
          ? [
              {
                at: decided.at,
                text: decided.by ? `${decided.label}, by ${decided.by}` : decided.label,
              },
            ]
          : []),
      ].sort((a, b) => a.at.getTime() - b.at.getTime());
      const decisions: AllowedDecision[] = decided ? [] : allowed;
      return {
        id: row.id,
        queue: row.queue,
        title: row.title,
        raisedAt: row.raisedAt,
        counts: byQueue,
        decided,
        decisions,
        tabs: view.tabs,
        sidebar: view.sidebar,
        timeline,
      };
    },

    /**
     * Records the Admin's decision on an item, with the writes its kind
     * makes and a line in the audit log, in one batch. A recorded decision
     * cannot be reopened.
     */
    async decide(actor: Actor, input: { itemId: string; decision: string; reason?: string }) {
      if (actor.kind !== "admin") return adminOnly();
      const row = await find(input.itemId);
      if (!row) return notFound();
      if (row.decidedAt) return alreadyDecided();
      const kind = kindOf(row);
      const option = (await allowedNow(kind, row)).find(
        (allowed) => allowed.key === input.decision,
      );
      if (!option) return refuse("not-allowed", "That decision is not allowed on this item.");
      const reason = option.reason === "none" ? null : input.reason?.trim() || null;
      if (option.reason === "required" && !reason) {
        return refuse("reason-required", "Give the reason for this decision.");
      }

      const made = await kind.decide(ctx, actor, row, { decision: option.key, reason });
      if (!made.ok) return made;
      try {
        await ctx.commit([
          // Unguarded on purpose: on a decided item a trigger aborts the batch.
          ctx.db
            .update(queueItems)
            .set({
              decision: option.key,
              reason,
              decidedBy: actor.adminId,
              decidedAt: ctx.now(),
            })
            .where(eq(queueItems.id, row.id)),
          ...made.value,
          audit(ctx, actor, {
            action: "queue.decided",
            summary: `${option.label}: ${row.title}${reason ? `. Reason: ${reason}` : ""}`,
            subjectId: row.id,
          }),
        ]);
      } catch (error) {
        if (causedBy(error, "a recorded decision cannot be reopened")) return alreadyDecided();
        throw error;
      }
      await emailTells(ctx);
      return ok({ itemId: row.id, decision: option.key });
    },

    /** Opens what an item shows only on a logged click, once the audit log holds it. */
    async open(actor: Actor, input: { itemId: string; read: string }) {
      if (actor.kind !== "admin") return adminOnly();
      const row = await find(input.itemId);
      if (!row) return notFound();
      const read = kindOf(row).reads?.[input.read];
      if (!read) return refuse("not-found", "This item has nothing to open by that name.");
      await logRead(ctx, actor, {
        summary: `Opened ${read.label}: ${row.title}`,
        subjectId: row.id,
      });
      return ok(await read.open(ctx, row));
    },
  };
}

function alreadyDecided() {
  return refuse("already-decided", "This item has been decided. A decision cannot be reopened.");
}

export type Queues = ReturnType<typeof createQueues>;
