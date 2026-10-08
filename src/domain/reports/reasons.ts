// Shared with the web app. Nothing here may import what only runs on the server.

/** The one fixed reason a Report gives, in the order offered (#136). */
export const REPORT_REASONS = [
  "contact-or-payment",
  "leaving",
  "threat-or-abuse",
  "fake-or-misleading",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_NAMES: Record<ReportReason, string> = {
  "contact-or-payment": "Contact or payment details",
  leaving: "Asking to leave the platform",
  "threat-or-abuse": "Threat or abuse",
  "fake-or-misleading": "Fake or misleading",
  other: "Other",
};

/** How long a Report's note may be, in characters. */
export const REPORT_NOTE_MAX = 1000;
