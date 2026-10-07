import { getTableColumns, sql, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Context } from "./context";

/**
 * The insert of a row, written only while the condition holds when the batch
 * runs, as what a command read may change between the read and the batch.
 */
export function insertWhile<Table extends SQLiteTable>(
  ctx: Context,
  table: Table,
  row: Table["$inferSelect"],
  condition: SQL,
) {
  const columns = getTableColumns(table);
  // In the table's order, as an insert of a select needs it.
  const selected = Object.fromEntries(
    Object.entries(columns).map(([key, column]) => {
      if (!(key in row)) throw new Error(`insertWhile: no value for column "${key}"`);
      const value: unknown = row[key as keyof typeof row];
      return [
        key,
        // JSON columns are stored as text, as Drizzle stores them.
        sql`${value instanceof Date ? value.getTime() : Array.isArray(value) ? JSON.stringify(value) : value}`.as(
          column.name,
        ),
      ];
    }),
  );
  return ctx.db.insert(table).select(
    ctx.db
      .select(selected as Record<string, SQL.Aliased>)
      .from(sql`(select 1)`)
      .where(condition) as never,
  );
}
