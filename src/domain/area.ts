import type { ClockHandler } from "./clocks";
import type { Context } from "./context";

/**
 * One group of commands and queries (accounts, jobs, quotes, …) and the clocks
 * it fires. Each command takes the acting party first and returns a Result.
 */
export type Area<Name extends string = string, Api = unknown> = {
  name: Name;
  /** Clock handlers by kind. Kinds are unique across the module. */
  clocks?: Record<string, ClockHandler>;
  api(ctx: Context): Api;
};

export function defineArea<const Name extends string, Api>(area: Area<Name, Api>) {
  return area;
}

export type AreasApi<Areas extends readonly Area[]> = {
  [A in Areas[number] as A["name"]]: ReturnType<A["api"]>;
};
