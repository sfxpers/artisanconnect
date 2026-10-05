import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Actor, AdminActor } from "./actor";
import { audit, logRead } from "./audit";
import { keyOfLink } from "./file-links";
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
  | { kind: "facts"; facts: { label: string; value: string }[] }
  /** Stored files, each by a link that works for a while; only a logged read hands them out. */
  | { kind: "files"; files: { kind: "photo" | "pdf"; label: string; href: string }[] };

/** One decision a kind of item can have. */
export type DecisionOption = {
  label: string;
  /** Who the decision tells, said for the Admin: "The Artisan", "Both", "Nobody". */
  told: string;
  reason: "required" | "optional" | "none";
  /** What the reason is called, if not "Reason": an answer, a note. */
  reasonLabel?: string;
};

/** A decision allowed on an item now, by its key. */
export type AllowedDecision = DecisionOption & { key: string };

/** A value the Admin records with a row's decision, such as an Identity Number read from the document. */
export type DecisionField = {
  key: string;
  label: string;
  /** What it holds before the Admin changes it: what the sender gave. */
  value: string;
  /** A text, or a day (YYYY-MM-DD). */
  type: "text" | "day";
  required: boolean;
  /** For a choice, the values allowed and how each is shown. */
  options?: { value: string; label: string }[];
};

export type RowDecision = AllowedDecision & { fields: DecisionField[] };

/**
 * One row of an item whose rows are decided one at a time, such as each
 * check of a Verification. A row's decision is recorded on the row, and the
 * item is decided once nothing on it waits.
 */
export type ItemRow = {
  id: string;
  title: string;
  /** Where it stands, said for the Admin: "Waiting", "Accepted", … */
  state: string;
  blocks: Block[];
  /** What opens on a logged click on this row. */
  reads: { key: string; label: string }[];
  /** The decisions allowed on it now. */
  decisions: RowDecision[];
};

type RowsDefinition = {
  list(ctx: Context, item: QueueItem): Promise<ItemRow[]>;
  /**
   * The writes a row's decision makes and how the audit log says it, or a
   * refusal. Each write must carry the condition it read.
   */
  decide(
    ctx: Context,
    admin: AdminActor,
    item: QueueItem,
    choice: {
      rowId: string;
      decision: string;
      reason: string | null;
      fields: Record<string, string>;
    },
  ): Promise<Result<{ writes: Write[]; summary: string }>>;
  /** What a row's logged read shows. */
  open(ctx: Context, item: QueueItem, rowId: string, read: string): Promise<Block[]>;
  /**
   * The write that records the item decided once nothing on it waits,
   * guarded on that; it is committed after every row's decision.
   */
  settle(ctx: Context, admin: AdminActor, item: QueueItem): Write;
  /**
   * The refusal for a batch a trigger aborted, such as one deciding a row
   * another Admin decided first; null for any other error.
   */
  refusalOf(error: unknown): ReturnType<typeof refuse> | null;
};
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
  /**
   * Rows decided one at a time, for a kind whose item holds several things
   * to decide. Such a kind offers no decision on the item itself.
   */
  rows?: RowsDefinition;
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
      const [view, byQueue, allowed, rows] = await Promise.all([
        kind.view(ctx, row),
        counts(),
        row.decidedAt ? [] : allowedNow(kind, row),
        kind.rows ? kind.rows.list(ctx, row) : null,
      ]);
      const decided =
        row.decision && row.decidedAt
          ? {
              decision: row.decision,
              label: kind.decisions[row.decision]?.label ?? row.decision,
              reason: row.reason,
              reasonLabel: kind.decisions[row.decision]?.reasonLabel ?? null,
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
        /** Rows decided one at a time; a row may still be decided once the item is. */
        rows,
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
      const given = reasonFor(option, input.reason);
      if (!given.ok) return given;
      const reason = given.value;

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
            summary: `${option.label}: ${row.title}${reason ? `. ${option.reasonLabel ?? "Reason"}: ${reason}` : ""}`,
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

    /**
     * Records the Admin's decision on one row of an item, with the writes it
     * makes and a line in the audit log, in one batch; the item is decided
     * once nothing on it waits. A row's decision is never reopened.
     */
    async decideRow(
      actor: Actor,
      input: {
        itemId: string;
        rowId: string;
        decision: string;
        reason?: string;
        fields?: Record<string, string>;
      },
    ) {
      if (actor.kind !== "admin") return adminOnly();
      const item = await find(input.itemId);
      if (!item) return notFound();
      const rows = kindOf(item).rows;
      const target = rows && (await rows.list(ctx, item)).find((row) => row.id === input.rowId);
      if (!rows || !target) return refuse("not-found", "That row does not exist.");
      const option = target.decisions.find((allowed) => allowed.key === input.decision);
      if (!option) return refuse("not-allowed", "That decision is not allowed on this row.");
      const given = reasonFor(option, input.reason);
      if (!given.ok) return given;
      const reason = given.value;

      const made = await rows.decide(ctx, actor, item, {
        rowId: target.id,
        decision: option.key,
        reason,
        fields: input.fields ?? {},
      });
      if (!made.ok) return made;
      try {
        await ctx.commit([
          ...made.value.writes,
          audit(ctx, actor, {
            action: "queue.row-decided",
            summary: `${made.value.summary}${reason ? `. ${option.reasonLabel ?? "Reason"}: ${reason}` : ""}`,
            subjectId: item.id,
          }),
          rows.settle(ctx, actor, item),
        ]);
      } catch (error) {
        const refused = rows.refusalOf(error);
        if (refused) return refused;
        throw error;
      }
      await emailTells(ctx);
      return ok({ itemId: item.id, rowId: target.id, decision: option.key });
    },

    /**
     * Opens what an item, or one of its rows, shows only on a logged click,
     * once the audit log holds it.
     */
    async open(actor: Actor, input: { itemId: string; read: string; rowId?: string }) {
      if (actor.kind !== "admin") return adminOnly();
      const row = await find(input.itemId);
      if (!row) return notFound();
      const kind = kindOf(row);
      if (input.rowId !== undefined) {
        const target =
          kind.rows && (await kind.rows.list(ctx, row)).find((each) => each.id === input.rowId);
        const read = target?.reads.find((each) => each.key === input.read);
        if (!kind.rows || !target || !read) {
          return refuse("not-found", "This row has nothing to open by that name.");
        }
        await logRead(ctx, actor, {
          summary: `Opened ${read.label} (${target.title}): ${row.title}`,
          subjectId: row.id,
        });
        return ok(await kind.rows.open(ctx, row, target.id, read.key));
      }
      const read = kind.reads?.[input.read];
      if (!read) return refuse("not-found", "This item has nothing to open by that name.");
      await logRead(ctx, actor, {
        summary: `Opened ${read.label}: ${row.title}`,
        subjectId: row.id,
      });
      return ok(await read.open(ctx, row));
    },

    /**
     * A stored file, by a link a logged read handed out, while it works.
     * Only an Admin is served one.
     */
    async file(viewer: Actor, input: { token: string }) {
      if (viewer.kind !== "admin") return null;
      const key = await keyOfLink(ctx, input.token);
      if (!key) return null;
      const object = await ctx.ports.files.get(key);
      if (!object) return null;
      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
        size: object.size,
      };
    },
  };
}

/** The reason a decision is recorded with: none, or the one given, which it may require. */
function reasonFor(option: DecisionOption, given: string | undefined) {
  if (option.reason === "none") return ok(null);
  const reason = given?.trim() || null;
  if (option.reason === "required" && !reason) {
    return refuse("reason-required", "Give the reason for this decision.");
  }
  return ok(reason);
}

function alreadyDecided() {
  return refuse("already-decided", "This item has been decided. A decision cannot be reopened.");
}

export type Queues = ReturnType<typeof createQueues>;
