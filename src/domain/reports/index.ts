import * as z from "zod";
import { and, eq, sql } from "drizzle-orm";
import { accountIdOf, system, type Actor } from "../actor";
import { firstProblem } from "../accounts/inputs";
import { checkContent } from "../content/check";
import type { Context } from "../context";
import { causedBy } from "../errors";
import { insertWhile } from "../guarded";
import { ok, refuse } from "../result";
import { reports, REPORT_SUBJECTS } from "../schema";
import { defineSection } from "../section";
import { emailTells, tell } from "../tells";
import { itemTitle, REPORT_KINDS } from "./items";
import { REPORT_NOTE_MAX, REPORT_REASONS } from "./reasons";
import { reportable, type About } from "./subjects";

// Reports (#136, ADR 0020): the third wall. Any signed-in Account Reports a
// Job, Quote, message, or Artisan Profile it can see, once, with one fixed
// reason and an optional note. Each folds into the one queue item open for
// the thing. The reporter is told it was received, never the outcome; the
// Account reported is told nothing unless the Admin acts on it.

const reportInput = z.object({
  about: z.object({ kind: z.enum(REPORT_SUBJECTS), id: z.string().min(1) }),
  reason: z.enum(REPORT_REASONS, { error: "Choose why you are reporting it." }),
  note: z
    .string()
    .trim()
    .max(REPORT_NOTE_MAX, { error: `Keep the note to ${REPORT_NOTE_MAX} characters.` })
    .optional()
    .transform((note) => note || null),
});

export const reportsSection = defineSection({
  name: "reports",
  queueItems: Object.values(REPORT_KINDS),
  api: (ctx) => ({
    /**
     * Reports a thing the Account can see, and not its own, to the Admin.
     * The note is read by the Content check, as everything sent is: a sure
     * hit is refused with the reason; an unsure one goes to the Admin, who
     * alone reads it, with what the check made of it.
     */
    async report(actor: Actor, input: { about: About; reason: string; note?: string }) {
      const accountId = accountIdOf(actor);
      if (!accountId) return refuse("sign-in-required", "Sign in to Report something.");
      const parsed = reportInput.safeParse(input);
      if (!parsed.success) return refuse("invalid", firstProblem(parsed.error));
      const { about, reason, note } = parsed.data;
      const thing = await reportable(ctx, actor, about);
      if (!thing) return refuse("not-found", "There is nothing by that name for you to Report.");
      if (thing.reportedId === accountId) return refuse("own", "You cannot Report your own.");
      if (await hasReported(ctx, accountId, about)) return alreadyReported();

      let noteHeldFor: string | null = null;
      if (note) {
        const checked = await checkContent(ctx, {
          text: note,
          context: { kind: "before-payment" },
        });
        if (!checked.ok) return checked;
        if (checked.value.verdict === "held") noteHeldFor = checked.value.reason;
      }
      const raised = REPORT_KINDS[about.kind].raiseUnlessOpen(ctx, {
        subjectId: about.id,
        title: itemTitle(about.kind, thing.name),
      });
      const row = {
        id: ctx.newId(),
        reporterId: accountId,
        subjectKind: about.kind,
        subjectId: about.id,
        reportedId: thing.reportedId,
        reason,
        note,
        noteHeldFor,
        // The item open once the write above runs, whether it raised it or an earlier Report did.
        queueItemId: raised.openItemId as unknown as string,
        reportedAt: ctx.now(),
      };
      try {
        await ctx.commit([
          raised.write,
          insertWhile(ctx, reports, row, sql`1`),
          // The one Tell to its own actor: the reporter is told it was received.
          ...tell(ctx, system, [accountId], {
            event: "report.received",
            title: `Your Report was received: ${thing.name}`,
            link: thing.link,
          }),
        ]);
      } catch (error) {
        if (causedBy(error, "UNIQUE constraint failed: reports.reporter_id")) {
          return alreadyReported();
        }
        throw error;
      }
      await emailTells(ctx);
      return ok({});
    },

    /** Whether the viewer has Reported the thing, so its Report action says so. */
    async made(viewer: Actor, input: { about: About }) {
      const accountId = accountIdOf(viewer);
      return accountId ? hasReported(ctx, accountId, input.about) : false;
    },
  }),
});

/** Whether the Account has Reported the thing. */
async function hasReported(ctx: Context, accountId: string, about: About) {
  const [row] = await ctx.db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.reporterId, accountId),
        eq(reports.subjectKind, about.kind),
        eq(reports.subjectId, about.id),
      ),
    );
  return !!row;
}

function alreadyReported() {
  return refuse("already-reported", "You have Reported this already.");
}
