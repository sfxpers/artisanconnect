/** The party a command acts for. Every command takes one explicitly. */
export type Actor =
  | { kind: "visitor" }
  | { kind: "client"; accountId: string }
  | { kind: "artisan"; accountId: string }
  | { kind: "admin"; adminId: string }
  | { kind: "system" };

export const visitor: Actor = { kind: "visitor" };
export const system: Actor = { kind: "system" };
