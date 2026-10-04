import type { Actor } from "./actor";
import type { ClockHandler } from "./clocks";
import type { Context } from "./context";
import type { QueueItemKind } from "./queues";

/**
 * Takes the acting party (or, for a query, the viewer) first. A command
 * returns a Result; a query returns that viewer's projection.
 */
// oxlint-disable-next-line no-explicit-any -- each command names its own input
type Operation = (actor: Actor, input?: any) => Promise<unknown>;

/**
 * One group of commands and queries (accounts, jobs, quotes, …), the clocks
 * it fires, and the queue items it raises.
 */
export type Section<
  Name extends string = string,
  Api extends Record<string, Operation> = Record<string, Operation>,
> = {
  name: Name;
  /** Clock handlers by kind. Kinds are unique across the module. */
  clocks?: Record<string, ClockHandler>;
  /** The kinds of item it raises in the Admin's queues. Kinds are unique across the module. */
  queueItems?: QueueItemKind[];
  api(ctx: Context): Api;
};

export function defineSection<const Name extends string, Api extends Record<string, Operation>>(
  section: Section<Name, Api>,
) {
  return section;
}

export type SectionsApi<Sections extends readonly Section[]> = {
  [S in Sections[number] as S["name"]]: ReturnType<S["api"]>;
};
