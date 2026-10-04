import type { Clock } from "../ports";

export type FakeClock = Clock & {
  set(now: Date): void;
  advance(by: { minutes?: number; hours?: number; days?: number }): void;
};

/** A clock that moves only when told to. */
export function createFakeClock(start = new Date("2026-10-05T06:00:00Z")): FakeClock {
  let now = start.getTime();
  return {
    now: () => new Date(now),
    set(date) {
      now = date.getTime();
    },
    advance({ minutes = 0, hours = 0, days = 0 }) {
      now += ((days * 24 + hours) * 60 + minutes) * 60_000;
    },
  };
}
