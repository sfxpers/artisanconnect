import type { AdminActor } from "./actor";
import type { Context, Write } from "./context";
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

/** The write that logs an Admin's decision; commit it in the decision's batch. */
export function audit(ctx: Context, admin: AdminActor, entry: AuditEntry): Write {
  return ctx.db.insert(auditLog).values({
    id: ctx.newId(),
    adminId: admin.adminId,
    action: entry.action,
    summary: entry.summary,
    subjectId: entry.subjectId ?? null,
    at: ctx.now(),
  });
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
