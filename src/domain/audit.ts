import type { SQL } from "drizzle-orm";
import type { AdminActor } from "./actor";
import type { Context, Write } from "./context";
import { insertWhile } from "./guarded";
import { auditLog } from "./schema";

/** One line of the audit log: what an Admin did or read. */
export type AuditEntry = {
  /** What was done, by kind, such as "admin.invited" or "read". */
  action: string;
  /** What it was done to, said for the Admin reading the log. */
  summary: string;
  /** The id of what it was done to, if it has one. */
  subjectId?: string;
};

/**
 * The write that logs an Admin's decision; commit it in the decision's batch.
 * With a condition, written only while it holds when the batch runs, so a
 * decision another Admin's made moot is not logged as made.
 */
export function audit(ctx: Context, admin: AdminActor, entry: AuditEntry, condition?: SQL): Write {
  const row = {
    id: ctx.newId(),
    adminId: admin.adminId,
    action: entry.action,
    summary: entry.summary,
    subjectId: entry.subjectId ?? null,
    at: ctx.now(),
  };
  return condition
    ? insertWhile(ctx, auditLog, row, condition)
    : ctx.db.insert(auditLog).values(row);
}

/**
 * The write that logs something the system did that the Admin should see,
 * such as a Payout sent back, only while the condition holds. Its row has no
 * Admin.
 */
export function systemAudit(ctx: Context, entry: AuditEntry, condition: SQL): Write {
  return insertWhile(
    ctx,
    auditLog,
    {
      id: ctx.newId(),
      adminId: null,
      action: entry.action,
      summary: entry.summary,
      subjectId: entry.subjectId ?? null,
      at: ctx.now(),
    },
    condition,
  );
}

/**
 * Logs a read (a Conversation, an identity document) before it is shown, so
 * nothing is read that the log does not hold.
 */
export async function logRead(
  ctx: Context,
  admin: AdminActor,
  entry: Omit<AuditEntry, "action">,
): Promise<void> {
  await ctx.commit([audit(ctx, admin, { action: "read", ...entry })]);
}
