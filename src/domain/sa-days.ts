// Shared with the web app. Nothing here may import what only runs on the server.

// A date a person enters (an expiry, an issue date) is a South African
// calendar day, written YYYY-MM-DD. South Africa keeps UTC+2 all year.

const SA_OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The South African calendar day an instant falls on. */
export function saDay(at: Date): string {
  return new Date(at.getTime() + SA_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant a South African calendar day starts. */
export function saDayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - SA_OFFSET_MS);
}

/** The day this many days before (or, negative, after) a day. */
export function daysBefore(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
}

/** Whether a string is a real calendar day, written YYYY-MM-DD. */
export function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** A day as South Africans read it: "5 Oct 2026". */
export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-ZA", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}
