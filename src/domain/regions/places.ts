// Shared with the web app and the seed script. Imports nothing, so Node can
// load it as it is.

/** The most Regions an Artisan works in. */
export const REGIONS_MAX = 3;

/**
 * What a suburb is searched by: its name with case, spaces, punctuation, and
 * accents taken out, so "Bel'Aire", "bel aire", and "BELAIRE" are one.
 */
export function suburbKey(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
