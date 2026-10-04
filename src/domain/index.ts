// The domain module: every rule of ArtisanConnect. The web app reaches it only
// through server functions; the scheduled handler and the payment webhook
// route are thin adapters onto its system entry points.

import type { Area, AreasApi } from "./area";
import { runDueClocks, type ClockHandler } from "./clocks";
import { createContext } from "./context";
import { PORT_NAMES, type Ports } from "./ports";

/** Every area of the module. Each ticket adds its area here. */
export const areas = [] as const satisfies readonly Area[];

export type Domain = ReturnType<typeof createDomain>;

export function createDomain(ports: Ports) {
  return assembleDomain(ports, areas);
}

/** Builds the module from its areas. Tests of the harness itself add a probe area. */
export function assembleDomain<const Areas extends readonly Area[]>(ports: Ports, areas: Areas) {
  assertExactPorts(ports);
  const ctx = createContext(ports);
  const clocks: Record<string, ClockHandler> = {};
  const api: Record<string, unknown> = {};
  for (const area of areas) {
    if (area.name in api || area.name === "system") {
      throw new Error(`Area "${area.name}" is defined twice`);
    }
    api[area.name] = area.api(ctx);
    for (const [kind, handler] of Object.entries(area.clocks ?? {})) {
      if (kind in clocks) throw new Error(`Clock kind "${kind}" is defined twice`);
      clocks[kind] = handler;
    }
  }
  return {
    ...(api as AreasApi<Areas>),
    /** Entry points the platform calls, not a party. */
    system: {
      /** Called by the every-minute cron. */
      runDueClocks: () => runDueClocks(ctx, clocks),
    },
  };
}

function assertExactPorts(ports: Ports) {
  const given = Object.keys(ports).sort();
  const expected = [...PORT_NAMES].sort();
  if (given.join() !== expected.join()) {
    throw new Error(
      `The domain takes exactly the ports ${expected.join(", ")}; given ${given.join(", ")}`,
    );
  }
}

export type { Actor } from "./actor";
export type { Result, Refusal } from "./result";
export type * from "./ports";
export { PORT_NAMES } from "./ports";
