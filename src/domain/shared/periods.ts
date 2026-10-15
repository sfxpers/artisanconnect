// Shared with the web app. Imports nothing.

/** The spans the Admin reads the figures over: the last so many days, or all time. */
export const FIGURE_PERIODS = ["7d", "30d", "90d", "365d", "all"] as const;

export type FigurePeriod = (typeof FIGURE_PERIODS)[number];

/** The span the figures page opens on. */
export const DEFAULT_FIGURE_PERIOD: FigurePeriod = "30d";

/** The days a period reaches back, or null for all time. */
export function periodDays(period: FigurePeriod): number | null {
  return period === "all" ? null : Number(period.slice(0, -1));
}
