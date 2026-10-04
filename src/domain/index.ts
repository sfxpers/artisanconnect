// The domain module: every rule of ArtisanConnect. The web app reaches it only
// through server functions; the scheduled handler and the payment webhook
// route are thin adapters onto its system entry points.

import type { Section, SectionsApi } from "./section";
import { runDueClocks, type ClockHandler } from "./clocks";
import { createContext } from "./context";
import { PORT_NAMES, type Ports } from "./ports";

/** Every section of the module. Each ticket adds its section here. */
export const sections = [] as const satisfies readonly Section[];

export type Domain = ReturnType<typeof createDomain>;

export function createDomain(ports: Ports) {
  return assembleDomain(ports, sections);
}

/** Builds the module from its sections. Tests of the harness itself add a probe section. */
export function assembleDomain<const Sections extends readonly Section[]>(
  ports: Ports,
  sections: Sections,
) {
  assertExactPorts(ports);
  const ctx = createContext(ports);
  const clocks: Record<string, ClockHandler> = {};
  const api: Record<string, unknown> = {};
  for (const section of sections) {
    if (section.name in api || section.name === "system") {
      throw new Error(`Section "${section.name}" is defined twice`);
    }
    api[section.name] = section.api(ctx);
    for (const [kind, handler] of Object.entries(section.clocks ?? {})) {
      if (kind in clocks) throw new Error(`Clock kind "${kind}" is defined twice`);
      clocks[kind] = handler;
    }
  }
  return {
    ...(api as SectionsApi<Sections>),
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
