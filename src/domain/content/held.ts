import { and, eq, isNull } from "drizzle-orm";
import type { AdminActor } from "../actor";
import type { Context, Write } from "../context";
import { causedBy } from "../errors";
import { defineQueueItemKind, type ItemView, type QueueItem, type QueueItemKind } from "../queues";
import { ok, refuse } from "../result";
import { queueItems } from "../schema";
import { tell } from "../tells";

// A Held item waits for the Admin's Pre-check (ADR 0020). Until it is
// released it exists only for its sender, who sees "being checked" and may
// withdraw it, and for the Admin, who releases or refuses it with a reason,
// with no time limit. The sender is told the decision; nobody is told it was
// Held. Each kind of content (names, a Job, a Quote, a message) keeps its own
// state and plugs into the Pre-checks queue through this.

type HeldKindDefinition = {
  /** The Account that sent the item, which is told the decision; null if it is gone. */
  sender(ctx: Context, subjectId: string): Promise<string | null>;
  /** The writes that put it live, each guarded on it still being Held. */
  release(ctx: Context, admin: AdminActor, subjectId: string): Promise<Write[]>;
  /** The writes that refuse it, each guarded on it still being Held. */
  refuse(ctx: Context, admin: AdminActor, subjectId: string, reason: string): Promise<Write[]>;
  /** What the sender is told, and the page it links to, where a refusal shows its reason. */
  told: { released: string; refused: string; link: string };
  view(ctx: Context, item: QueueItem): Promise<ItemView>;
};

export type HeldKind = QueueItemKind & {
  /**
   * The writes that mark the item's Pre-check withdrawn by its sender, if it
   * is in the queue. A decision recorded meanwhile aborts the batch it is in,
   * with an error `isAlreadyDecided` recognises.
   */
  withdraw(ctx: Context, subjectId: string): Promise<Write[]>;
};

export const WITHDRAWN = "withdrawn";

/** A kind of Held item, in the Pre-checks queue. */
export function defineHeldKind(kind: string, definition: HeldKindDefinition): HeldKind {
  const queueItemKind = defineQueueItemKind(kind, {
    queue: "pre-checks",
    decisions: {
      release: { label: "Release", told: "The sender", reason: "optional" },
      refuse: { label: "Refuse", told: "The sender, with the reason", reason: "required" },
      // Recorded by the sender, never offered to the Admin.
      [WITHDRAWN]: { label: "Withdrawn by the sender", told: "Nobody", reason: "none" },
    },
    async allowed() {
      return ["release", "refuse"];
    },
    async decide(ctx, admin, item, choice) {
      const sender = await definition.sender(ctx, item.subjectId);
      const released = choice.decision === "release";
      const writes = released
        ? await definition.release(ctx, admin, item.subjectId)
        : await definition.refuse(ctx, admin, item.subjectId, choice.reason ?? "");
      const told = sender
        ? tell(ctx, admin, [sender], {
            event: `${kind}.${released ? "released" : "refused"}`,
            title: released ? definition.told.released : definition.told.refused,
            link: definition.told.link,
          })
        : [];
      return ok([...writes, ...told]);
    },
    view: definition.view,
  });

  return {
    ...queueItemKind,
    async withdraw(ctx, subjectId) {
      const [open] = await ctx.db
        .select({ id: queueItems.id })
        .from(queueItems)
        .where(
          and(
            eq(queueItems.kind, kind),
            eq(queueItems.subjectId, subjectId),
            isNull(queueItems.decidedAt),
          ),
        );
      if (!open) return [];
      // Unguarded on purpose: on a decided item a trigger aborts the batch.
      return [
        ctx.db
          .update(queueItems)
          .set({ decision: WITHDRAWN, decidedAt: ctx.now() })
          .where(eq(queueItems.id, open.id)),
      ];
    },
  };
}

/** Whether a batch failed because the Admin decided the item first. */
export function isAlreadyDecided(error: unknown): boolean {
  return causedBy(error, "a recorded decision cannot be reopened");
}

/** The refusal of withdrawing an item the Admin has decided. */
export function alreadyChecked() {
  return refuse("already-checked", "This has been checked already, so it cannot be withdrawn.");
}
