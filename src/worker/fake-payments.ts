import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { FakePaymentsState, FakePaymentsStore } from "@/domain/fakes/payments";
import { fakePaymentState } from "@/domain/schema";

const ROW = "state";

/**
 * Keeps the fake payment adapter's state in one D1 row, so its collections
 * outlive the isolate that opened them (#126). Each save names the version
 * it read, so of two at once the second starts again.
 */
export function d1FakePaymentsStore(database: D1Database): FakePaymentsStore {
  const db = drizzle(database);
  return {
    async load() {
      const [row] = await db.select().from(fakePaymentState).where(eq(fakePaymentState.id, ROW));
      return row ? { state: row.state as FakePaymentsState, version: row.version } : null;
    },
    async save(state, version) {
      const saved =
        version === 0
          ? await db
              .insert(fakePaymentState)
              .values({ id: ROW, state, version: 1 })
              .onConflictDoNothing()
              .returning({ id: fakePaymentState.id })
          : await db
              .update(fakePaymentState)
              .set({ state, version: version + 1 })
              .where(and(eq(fakePaymentState.id, ROW), eq(fakePaymentState.version, version)))
              .returning({ id: fakePaymentState.id });
      return saved.length > 0;
    },
  };
}
