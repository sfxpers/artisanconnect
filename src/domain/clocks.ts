import { and, asc, eq, isNull, lte } from "drizzle-orm";
import type { Context, Write } from "./context";
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
 */
export type ClockHandler = (ctx: Context, clock: DueClock) => Promise<Write[]>;

/** The write that starts a clock; commit it with the event that starts it. */
export function startClock(
  ctx: Context,
  clock: { kind: string; subjectId: string; dueAt: Date },
): Write {
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
      const writes = await handler(ctx, clock);
      const markFired = ctx.db
        .update(dueClocks)
        .set({ firedAt: now })
        .where(eq(dueClocks.id, clock.id));
      await ctx.commit([markFired, ...writes]);
      fired += 1;
    } catch (error) {
      if (isAlreadyFired(error)) continue;
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `${failures.length} due clocks failed to fire`);
  }
  return { fired };
}

function isAlreadyFired(error: unknown): boolean {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (e.message.includes("clock already fired")) return true;
  }
  return false;
}
