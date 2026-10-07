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
  const selected = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      // JSON columns are stored as text, as Drizzle stores them.
      sql`${value instanceof Date ? value.getTime() : Array.isArray(value) ? JSON.stringify(value) : value}`.as(
        columns[key]!.name,
      ),
    ]),
  );
  return ctx.db.insert(table).select(
    ctx.db
      .select(selected as Record<string, SQL.Aliased>)
      .from(sql`(select 1)`)
      .where(condition) as never,
  );
}
