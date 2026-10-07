import { and, asc, eq, isNull, lte } from "drizzle-orm";
import type { Context, Write } from "./context";
import { causedBy } from "./errors";
import { isOverdrawn } from "./ledger";
import { dueClocks } from "./schema";

export type DueClock = {
  id: string;
  kind: string;
  subjectId: string;
  dueAt: Date;
};

/**
 * Fires one clock. It reads the current state and returns the writes the
 * firing makes, or none when its condition no longer holds (the Client already
 * answered, the Engagement was Approved): firing a lapsed clock does nothing.
 *
 * A command may land between the handler's read and its batch, so each write
 * must also carry the condition it read (`UPDATE … WHERE state = 'running'`),
 * or the firing would undo that command.
 */
export type ClockHandler = (ctx: Context, clock: DueClock) => Promise<Write[]>;

/** The write that starts a clock; commit it with the event that starts it. */
export function startClock(ctx: Context, clock: Omit<DueClock, "id">): Write {
  return ctx.db.insert(dueClocks).values({ id: ctx.newId(), ...clock });
}

/**
 * Fires every clock due by now, oldest first, however late. Each clock is
 * marked fired in the same batch as its writes, and a clock already fired
 * aborts its batch, so a clock fires exactly once even if two runs overlap.
 */
export async function runDueClocks(
  ctx: Context,
  handlers: Record<string, ClockHandler>,
): Promise<{ fired: number }> {
  const now = ctx.now();
  const due = await ctx.db
    .select({
      id: dueClocks.id,
      kind: dueClocks.kind,
      subjectId: dueClocks.subjectId,
      dueAt: dueClocks.dueAt,
    })
    .from(dueClocks)
    .where(and(isNull(dueClocks.firedAt), lte(dueClocks.dueAt, now)))
    .orderBy(asc(dueClocks.dueAt), asc(dueClocks.id));

  let fired = 0;
  const failures: unknown[] = [];
  for (const clock of due) {
    try {
      const handler = handlers[clock.kind];
      if (!handler) throw new Error(`No handler for clock kind "${clock.kind}"`);
      if (await fireClock(ctx, clock, handler)) fired += 1;
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `${failures.length} due clocks failed to fire`);
  }
  return { fired };
}

/**
 * Fires the subject's clock of this kind now if one is due, as the run would
 * within the minute: for an event that should not wait for it, such as the
 * first Batch of a Job posted. Whether it fired.
 */
export async function fireDueClock(
  ctx: Context,
  kind: string,
  subjectId: string,
  handler: ClockHandler,
): Promise<boolean> {
  const [clock] = await ctx.db
    .select({
      id: dueClocks.id,
      kind: dueClocks.kind,
      subjectId: dueClocks.subjectId,
      dueAt: dueClocks.dueAt,
    })
    .from(dueClocks)
    .where(
      and(
        eq(dueClocks.kind, kind),
        eq(dueClocks.subjectId, subjectId),
        isNull(dueClocks.firedAt),
        lte(dueClocks.dueAt, ctx.now()),
      ),
    )
    .orderBy(asc(dueClocks.dueAt), asc(dueClocks.id))
    .limit(1);
  return clock ? fireClock(ctx, clock, handler) : false;
}

/**
 * Fires one clock with its writes; false if another run fired it first. A
 * Release or Refund it worked out from the money unreleased is worked out
 * again if a command took that money meanwhile, as the ledger then aborts
 * the batch rather than overdraw.
 */
async function fireClock(ctx: Context, clock: DueClock, handler: ClockHandler): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const writes = await handler(ctx, clock);
    const markFired = ctx.db
      .update(dueClocks)
      .set({ firedAt: ctx.now() })
      .where(eq(dueClocks.id, clock.id));
    try {
      await ctx.commit([markFired, ...writes]);
      return true;
    } catch (error) {
      if (causedBy(error, "clock already fired")) return false;
      if (!isOverdrawn(error)) throw error;
    }
  }
  throw new Error(`Clock ${clock.id}'s money kept changing while it fired`);
}
