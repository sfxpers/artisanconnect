import { env } from "cloudflare:test";
import { and, eq, sum } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { assembleDomain, sections, type Actor } from "@/domain";
import { defineSection } from "@/domain/section";
import { startClock } from "@/domain/clocks";
import { ok, refuse } from "@/domain/result";
import { ledgerEntries } from "@/domain/schema";
import { emailTells, tell } from "@/domain/tells";
import { createHarness, TEST_CONFIG } from "./harness";

// A probe section that exists only to test the harness itself: a timer that a
// signed-in party starts and that rings when its clock fires, unless stopped
// first, a way to record money in the ledger, and a poke that Tells an Account.
// Real sections follow its shape.

const probeTimers = sqliteTable("probe_timers", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  state: text("state", { enum: ["running", "stopped", "rang"] }).notNull(),
});

const PROBE_TABLE = `CREATE TABLE probe_timers (
  id text PRIMARY KEY NOT NULL,
  account_id text NOT NULL,
  state text NOT NULL
)`;

const TIMER_RINGS = "probe.timer-rings";

function partyId(actor: Actor): string | null {
  return actor.kind === "client" || actor.kind === "artisan" ? actor.accountId : null;
}

const probe = defineSection({
  name: "probe",
  clocks: {
    [TIMER_RINGS]: async (ctx, clock) => {
      const [timer] = await ctx.db
        .select()
        .from(probeTimers)
        .where(eq(probeTimers.id, clock.subjectId));
      if (timer?.state !== "running") return [];
      // Guarded on the state read, in case the timer was stopped since.
      return [
        ctx.db
          .update(probeTimers)
          .set({ state: "rang" })
          .where(and(eq(probeTimers.id, timer.id), eq(probeTimers.state, "running"))),
      ];
    },
  },
  api: (ctx) => ({
    async startTimer(actor: Actor, input: { minutes: number }) {
      const accountId = partyId(actor);
      if (!accountId) return refuse("sign-in-required", "Sign in to start a timer.");
      if (!Number.isInteger(input.minutes) || input.minutes < 1) {
        return refuse("bad-minutes", "A timer runs for at least one whole minute.");
      }
      const id = ctx.newId();
      const ringsAt = new Date(ctx.now().getTime() + input.minutes * 60_000);
      await ctx.commit([
        ctx.db.insert(probeTimers).values({ id, accountId, state: "running" }),
        startClock(ctx, { kind: TIMER_RINGS, subjectId: id, dueAt: ringsAt }),
      ]);
      return ok({ id, state: "running" as const, ringsAt });
    },

    async stopTimer(actor: Actor, input: { timerId: string }) {
      const [timer] = await ctx.db
        .select()
        .from(probeTimers)
        .where(eq(probeTimers.id, input.timerId));
      if (!timer || timer.accountId !== partyId(actor))
        return refuse("not-yours", "That timer is not yours.");
      if (timer.state !== "running") return refuse("not-running", "That timer is not running.");
      await ctx.commit([
        ctx.db.update(probeTimers).set({ state: "stopped" }).where(eq(probeTimers.id, timer.id)),
      ]);
      return ok({ id: timer.id, state: "stopped" as const });
    },

    async timer(viewer: Actor, input: { timerId: string }) {
      const [timer] = await ctx.db
        .select()
        .from(probeTimers)
        .where(eq(probeTimers.id, input.timerId));
      return timer && timer.accountId === partyId(viewer)
        ? { id: timer.id, state: timer.state }
        : null;
    },

    async saveNote(actor: Actor, input: { text: string }) {
      const accountId = partyId(actor);
      if (!accountId) return refuse("sign-in-required", "Sign in to save a note.");
      const noteId = ctx.newId();
      await ctx.ports.files.put(`probe/${accountId}/${noteId}`, input.text);
      return ok({ noteId });
    },

    async note(viewer: Actor, input: { noteId: string }) {
      const file = await ctx.ports.files.get(`probe/${partyId(viewer)}/${input.noteId}`);
      return file ? file.text() : null;
    },

    /** One domain event writing one ledger row per amount. */
    async recordMoney(_actor: Actor, input: { amountsCents: number[] }) {
      const eventId = ctx.newId();
      const recordedAt = ctx.now();
      await ctx.commit(
        input.amountsCents.map((amountCents) =>
          ctx.db
            .insert(ledgerEntries)
            .values({ id: ctx.newId(), eventId, kind: "probe", amountCents, recordedAt }),
        ),
      );
      return ok({ eventId });
    },

    /** Tells an Account that the actor poked it. */
    async poke(actor: Actor, input: { accountId: string }) {
      await ctx.commit(
        tell(ctx, actor, [input.accountId], {
          event: "probe.poked",
          title: "You were poked",
          link: "/probe",
        }),
      );
      await emailTells(ctx);
      return ok({});
    },

    async ledgerTotalCents(_viewer: Actor) {
      const [row] = await ctx.db
        .select({ total: sum(ledgerEntries.amountCents) })
        .from(ledgerEntries);
      return Number(row?.total ?? 0);
    },
  }),
});

/** The harness with the probe section added to the module. */
export async function createProbeHarness() {
  const harness = await createHarness();
  await env.DB.prepare(PROBE_TABLE).run();
  return { ...harness, domain: assembleDomain(harness.ports, TEST_CONFIG, [...sections, probe]) };
}
