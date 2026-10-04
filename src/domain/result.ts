/**
 * What every command returns: the new state, or a typed refusal whose reason
 * the UI can show. A refusal changes nothing.
 */
export type Result<T, Reason extends string = string> =
  | { ok: true; value: T }
  | { ok: false; refusal: Refusal<Reason> };

export type Refusal<Reason extends string = string> = {
  reason: Reason;
  message: string;
};

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function refuse<const Reason extends string>(
  reason: Reason,
  message: string,
): { ok: false; refusal: Refusal<Reason> } {
  return { ok: false, refusal: { reason, message } };
}
