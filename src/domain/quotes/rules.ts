import type { Context } from "../context";
import { saDay } from "../sa-days";
import { SERVICE_CATEGORY_NAMES, type ServiceCategory } from "../service-categories";
import { verifiedFor } from "../verification";

// What a Quote needs at the moment it is Sent, whether at once or when the
// Admin releases a Held one, beyond its Job taking it (ADR 0002).

export type SendingProblem = "start-passed" | "not-verified";

/**
 * Why the Artisan may not Send this Quote on the Job now: its start date has
 * passed, or they are not verified for the Job's category (and for gas work
 * on a gas Job). Null if they may. Not while Suspended, too, once there are
 * Suspensions (#136).
 */
export async function sendingProblem(
  ctx: Context,
  artisanId: string,
  job: { category: ServiceCategory | null; gasWork: boolean | null },
  startOn: string,
): Promise<SendingProblem | null> {
  if (startPassed(ctx, startOn)) return "start-passed";
  if (!(await verifiedForJob(ctx, artisanId, job))) return "not-verified";
  return null;
}

/**
 * Whether the Artisan is verified now for the Job's category, and for gas
 * work on a gas Job: asked at Quote and at Hire, never after (ADR 0002).
 */
export async function verifiedForJob(
  ctx: Context,
  artisanId: string,
  job: { category: ServiceCategory | null; gasWork: boolean | null },
): Promise<boolean> {
  if (!job.category) return false;
  const verified = await verifiedFor(ctx, artisanId, job.category);
  return verified.verified && (!job.gasWork || verified.gasWork);
}

/** Whether a start date is before today, South African time. */
export function startPassed(ctx: Context, startOn: string): boolean {
  return startOn < saDay(ctx.now());
}

/** What the problem is, said to the Artisan. */
export function problemMessage(problem: SendingProblem, category: ServiceCategory | null) {
  return problem === "start-passed"
    ? "The start date has passed."
    : `You can Quote only while every check ${category ? SERVICE_CATEGORY_NAMES[category] : "its trade"} needs is current. See your Verification.`;
}
