// Shared with the web app. Nothing here may import what only runs on the server.

// Money is whole cents. A share of an amount rounds half up to the cent.

/** The Client's charge on each Payment, in percent (ADR 0008). */
export const PROTECTION_FEE_PERCENT = 5;

/** A percentage of an amount in cents, rounded half up to the cent. */
function percentOf(cents: number, percent: number): number {
  return Math.floor((cents * percent + 50) / 100);
}

/** The Protection Fee on a Payment of this many cents. */
export function protectionFeeCents(cents: number): number {
  return percentOf(cents, PROTECTION_FEE_PERCENT);
}

/** The Artisan Fee on a Release of this many cents, at the Engagement's rate (ADR 0009). */
export function artisanFeeCents(cents: number, percent: number): number {
  return percentOf(cents, percent);
}

/** An amount as South Africans read it: "R 1 500,00". */
export function formatRands(cents: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(cents / 100);
}
