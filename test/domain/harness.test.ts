import { describe, expect, test } from "vitest";
import { visitor } from "@/domain/actor";
import { createProbeHarness } from "../support/probe";

// The harness itself, driven through a probe section (test/support/probe.ts).

const client = { kind: "client", accountId: "client-1" } as const;

async function startedTimer(minutes = 5) {
  const harness = await createProbeHarness();
  const started = await harness.domain.probe.startTimer(client, { minutes });
  if (!started.ok) throw new Error(started.refusal.message);
  const state = async () =>
    (await harness.domain.probe.timer(client, { timerId: started.value.id }))?.state;
  return { ...harness, timerId: started.value.id, state };
}

describe("a domain command", () => {
  test("runs end to end against local D1 and returns the new state", async () => {
    const { domain } = await createProbeHarness();

    const started = await domain.probe.startTimer(client, { minutes: 5 });

    expect(started).toMatchObject({ ok: true, value: { state: "running" } });
    if (!started.ok) return;
    expect(await domain.probe.timer(client, { timerId: started.value.id })).toEqual({
      id: started.value.id,
      state: "running",
    });
  });

  test("returns a typed refusal with a reason, and changes nothing", async () => {
    const { domain } = await createProbeHarness();

    const refused = await domain.probe.startTimer(visitor, { minutes: 5 });

    expect(refused).toEqual({
      ok: false,
      refusal: { reason: "sign-in-required", message: "Sign in to start a timer." },
    });
    expect(await domain.system.runDueClocks()).toEqual({ fired: 0 });
  });
});

describe("the file store", () => {
  test("keeps what a command stores in local R2", async () => {
    const { domain } = await createProbeHarness();

    const saved = await domain.probe.saveNote(client, { text: "Bring the ladder" });

    if (!saved.ok) throw new Error(saved.refusal.message);
    expect(await domain.probe.note(client, { noteId: saved.value.noteId })).toBe(
      "Bring the ladder",
    );
  });
});

describe("run due clocks", () => {
  test("fires a clock once the fake clock reaches its due time", async () => {
    const { domain, clock, state } = await startedTimer(5);

    clock.advance({ minutes: 4 });
    expect(await domain.system.runDueClocks()).toEqual({ fired: 0 });
    expect(await state()).toBe("running");

    clock.advance({ minutes: 1 });
    expect(await domain.system.runDueClocks()).toEqual({ fired: 1 });
    expect(await state()).toBe("rang");
  });

  test("fires a clock late if the run is late", async () => {
    const { domain, clock, state } = await startedTimer(5);

    clock.advance({ days: 3 });
    await domain.system.runDueClocks();

    expect(await state()).toBe("rang");
  });

  test("does nothing when the clock's condition has lapsed", async () => {
    const { domain, clock, state, timerId } = await startedTimer(5);
    await domain.probe.stopTimer(client, { timerId });

    clock.advance({ minutes: 5 });
    await domain.system.runDueClocks();

    expect(await state()).toBe("stopped");
  });

  test("fires a clock only once", async () => {
    const { domain, clock } = await startedTimer(5);
    clock.advance({ minutes: 5 });

    expect(await domain.system.runDueClocks()).toEqual({ fired: 1 });
    expect(await domain.system.runDueClocks()).toEqual({ fired: 0 });
  });

  test("fires a clock only once when two runs overlap", async () => {
    const { domain, clock } = await startedTimer(5);
    clock.advance({ minutes: 5 });

    const runs = await Promise.all([domain.system.runDueClocks(), domain.system.runDueClocks()]);

    expect(runs.map((run) => run.fired).sort()).toEqual([0, 1]);
  });
});
