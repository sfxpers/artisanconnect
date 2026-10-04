import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { createProbeHarness } from "../support/probe";

const system = { kind: "system" } as const;

describe("the money ledger", () => {
  test("writes every row of one domain event, or none of them", async () => {
    const { domain } = await createProbeHarness();
    await domain.probe.recordMoney(system, { amountsCents: [10_000, 500] });

    // Half a cent breaks the ledger's whole-cents rule, so the event's first row goes too.
    await expect(
      domain.probe.recordMoney(system, { amountsCents: [2_000, 0.5] }),
    ).rejects.toThrow();

    expect(await domain.probe.ledgerTotalCents(system)).toBe(10_500);
  });

  // The ledger has no public command that could change a row, so this checks
  // the database itself refuses: append-only holds even against a bug.
  test("refuses to change or remove a row", async () => {
    const { domain } = await createProbeHarness();
    await domain.probe.recordMoney(system, { amountsCents: [10_000] });

    await expect(
      env.DB.prepare("UPDATE ledger_entries SET amount_cents = 1").run(),
    ).rejects.toThrow(/append-only/);
    await expect(env.DB.prepare("DELETE FROM ledger_entries").run()).rejects.toThrow(/append-only/);
    expect(await domain.probe.ledgerTotalCents(system)).toBe(10_000);
  });
});
