import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Times are stored as milliseconds since the epoch. */
const instant = (name: string) => integer(name, { mode: "timestamp_ms" });

/**
 * Every clock is a row with a due time, fired by "run due clocks" (ADR 0017).
 * A fired clock is never fired again: a trigger in the migration refuses it.
 */
export const dueClocks = sqliteTable(
  "due_clocks",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    subjectId: text("subject_id").notNull(),
    dueAt: instant("due_at").notNull(),
    firedAt: instant("fired_at"),
  },
  (table) => [
    index("due_clocks_unfired")
      .on(table.dueAt)
      .where(sql`${table.firedAt} is null`),
  ],
);

/**
 * The money ledger: append-only rows, never updated or deleted (a trigger in
 * the migration refuses both). Every row of one domain event shares an
 * eventId and is written in that event's one atomic batch. What is paid in,
 * released, owed, or refunded is derived from these rows, never stored.
 */
export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    kind: text("kind").notNull(),
    amountCents: integer("amount_cents").notNull(),
    recordedAt: instant("recorded_at").notNull(),
  },
  (table) => [
    index("ledger_entries_event").on(table.eventId),
    check("ledger_entries_whole_cents", sql`typeof(${table.amountCents}) = 'integer'`),
  ],
);
