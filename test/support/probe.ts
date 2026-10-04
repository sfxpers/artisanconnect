import { env } from "cloudflare:test";
import { eq, sum } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { assembleDomain, areas, type Actor } from "@/domain";
import { defineArea } from "@/domain/area";
import { startClock } from "@/domain/clocks";
import { ok, refuse } from "@/domain/result";
import { ledgerEntries } from "@/domain/schema";
import { createHarness } from "./harness";

// A probe area that exists only to test the harness itself: a timer that a
// signed-in party starts and that rings when its clock fires, unless stopped
// first, and a way to record money in the ledger. Real areas follow its shape.

const probeTimers = sqliteTable("probe_timers", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  state: text("state", { enum: ["running", "stopped", "rang"] }).notNull(),
});

const PROBE_TABLE = `CREATE TABLE probe_timers (
  id text PRIMARY KEY NOT NULL,
  owner_id text NOT NULL,
  state text NOT NULL
)`;

const TIMER_RINGS = "probe.timer-rings";

function partyId(actor: Actor): string | null {
  return actor.kind === "client" || actor.kind === "artisan" ? actor.accountId : null;
}

const probe = defineArea({
  name: "probe",
  clocks: {
    [TIMER_RINGS]: async (ctx, clock) => {
      const [timer] = await ctx.db
        .select()
        .from(probeTimers)
        .where(eq(probeTimers.id, clock.subjectId));
      if (timer?.state !== "running") return [];
      return [
        ctx.db.update(probeTimers).set({ state: "rang" }).where(eq(probeTimers.id, timer.id)),
      ];
    },
  },
  api: (ctx) => ({
    async startTimer(actor: Actor, input: { minutes: number }) {
      const ownerId = partyId(actor);
      if (!ownerId) return refuse("sign-in-required", "Sign in to start a timer.");
      if (!Number.isInteger(input.minutes) || input.minutes < 1) {
        return refuse("bad-minutes", "A timer runs for at least one whole minute.");
      }
      const id = ctx.newId();
      const ringsAt = new Date(ctx.now().getTime() + input.minutes * 60_000);
      await ctx.commit([
        ctx.db.insert(probeTimers).values({ id, ownerId, state: "running" }),
        startClock(ctx, { kind: TIMER_RINGS, subjectId: id, dueAt: ringsAt }),
      ]);
      return ok({ id, state: "running" as const, ringsAt });
    },

    async stopTimer(actor: Actor, input: { timerId: string }) {
      const [timer] = await ctx.db
        .select()
        .from(probeTimers)
        .where(eq(probeTimers.id, input.timerId));
      if (!timer || timer.ownerId !== partyId(actor))
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
      return timer && timer.ownerId === partyId(viewer)
        ? { id: timer.id, state: timer.state }
        : null;
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

    async ledgerTotalCents() {
      const [row] = await ctx.db
        .select({ total: sum(ledgerEntries.amountCents) })
        .from(ledgerEntries);
      return Number(row?.total ?? 0);
    },
  }),
});

/** The harness with the probe area added to the module. */
export async function createProbeHarness() {
  const harness = await createHarness();
  await env.DB.prepare(PROBE_TABLE).run();
  return { ...harness, domain: assembleDomain(harness.ports, [...areas, probe]) };
}
