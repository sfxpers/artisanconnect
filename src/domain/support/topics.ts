// Shared with the web app. Nothing here may import what only runs on the server.

/** The fixed topics an Account writes to the Admin under, in the order offered. */
export const SUPPORT_TOPICS = [
  "account",
  "payment",
  "verification",
  "suspension",
  "other",
] as const;

export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

export const SUPPORT_TOPIC_NAMES: Record<SupportTopic, string> = {
  account: "Account",
  payment: "Payment",
  verification: "Verification",
  suspension: "Suspension",
  other: "Other",
};

/** How long a Support request may be, in characters. */
export const SUPPORT_MESSAGE_MAX = 4000;
