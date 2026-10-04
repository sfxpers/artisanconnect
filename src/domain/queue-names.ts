// Shared with the web app. Nothing here may import what only runs on the server.

/** The eight queues the Admin works from, in the order the home shows them. */
export const QUEUE_NAMES = [
  "verification",
  "pre-checks",
  "signals",
  "reports",
  "disputes",
  "chargebacks",
  "support",
  "data-requests",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];
