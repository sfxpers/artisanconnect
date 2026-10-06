// The domain module: every rule of ArtisanConnect. The web app reaches it only
// through server functions; the scheduled handler and the payment webhook
// route are thin adapters onto its system entry points.

import type { Section, SectionsApi } from "./section";
import { runDueClocks, type ClockHandler } from "./clocks";
import { accountsSection } from "./accounts";
import { adminsSection, setUpFirstAdmin } from "./admins";
import { marketplaceRulesSection } from "./accounts/rules";
import { createContext } from "./context";
import { jobsSection } from "./jobs";
import { matchesSection } from "./matches";
import { createQueues, type QueueItemKind } from "./queues";
import { profilesSection } from "./profiles";
import { regionsSection } from "./regions";
import { availabilitySection } from "./regions/availability";
import { supportSection } from "./support";
import { emailTells, noticesSection } from "./tells";
import { verificationSection } from "./verification";
import { PORT_NAMES, type DomainConfig, type Ports } from "./ports";

/** Every section of the module. Each ticket adds its section here. */
export const sections = [
  accountsSection,
  adminsSection,
  availabilitySection,
  jobsSection,
  marketplaceRulesSection,
  matchesSection,
  noticesSection,
  profilesSection,
  regionsSection,
  supportSection,
  verificationSection,
] as const satisfies readonly Section[];

export type Domain = ReturnType<typeof createDomain>;

export function createDomain(ports: Ports, config: DomainConfig) {
  return assembleDomain(ports, config, sections);
}

/** Builds the module from its sections. Tests of the harness itself add a probe section. */
export function assembleDomain<const Sections extends readonly Section[]>(
  ports: Ports,
  config: DomainConfig,
  sections: Sections,
) {
  assertExactPorts(ports);
  const ctx = createContext(ports, config);
  const clocks: Record<string, ClockHandler> = {};
  const queueItemKinds: Record<string, QueueItemKind> = {};
  const api: Record<string, unknown> = {};
  for (const section of sections) {
    if (section.name in api || section.name === "system" || section.name === "queues") {
      throw new Error(`Section "${section.name}" is defined twice`);
    }
    api[section.name] = section.api(ctx);
    for (const [kind, handler] of Object.entries(section.clocks ?? {})) {
      if (kind in clocks) throw new Error(`Clock kind "${kind}" is defined twice`);
      clocks[kind] = handler;
    }
    for (const kind of section.queueItems ?? []) {
      if (kind.kind in queueItemKinds) {
        throw new Error(`Queue item kind "${kind.kind}" is defined twice`);
      }
      queueItemKinds[kind.kind] = kind;
    }
  }
  return {
    ...(api as SectionsApi<Sections>),
    /** The Admin's home stream and item pages, over every section's queue items. */
    queues: createQueues(ctx, queueItemKinds),
    /** Entry points the platform calls, not a party. */
    system: {
      /** Called by the every-minute cron. Also sends any Tell's email that has not gone. */
      async runDueClocks() {
        try {
          return await runDueClocks(ctx, clocks);
        } finally {
          // Never in place of a clock's failure.
          await emailTells(ctx).catch((error: unknown) => {
            console.error("Tell emails did not go", error);
          });
        }
      },
      /** The deploy-time setup command: makes the first Admin. */
      setUpFirstAdmin: (input: { email: string }) => setUpFirstAdmin(ctx, input),
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
