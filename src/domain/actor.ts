/** The party a command acts for. Every command takes one explicitly. */
export type Actor =
  | { kind: "visitor" }
  | { kind: "client"; accountId: string }
  | { kind: "artisan"; accountId: string }
  | { kind: "admin"; adminId: string }
  | { kind: "system" };

export const visitor: Actor = { kind: "visitor" };
export const system: Actor = { kind: "system" };

/** A signed-in Client or Artisan. */
export type AccountActor = Extract<Actor, { kind: "client" | "artisan" }>;

/** A signed-in Admin. */
export type AdminActor = Extract<Actor, { kind: "admin" }>;

/** The Account the actor is, if it is one. */
export function accountIdOf(actor: Actor): string | null {
  return actor.kind === "client" || actor.kind === "artisan" ? actor.accountId : null;
}
