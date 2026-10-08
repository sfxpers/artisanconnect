// What a message may hold, and the events a Conversation shows, shared with the composer.

/** The most characters a message's text may have. */
export const MESSAGE_MAX = 2000;

/** The most files one message may carry. */
export const MESSAGE_ATTACHMENTS_MAX = 5;

/** The events a Conversation shows as rows that are not speech. */
export const MESSAGE_EVENTS = [
  "quote.sent",
  "hire",
  "work.started",
  "completion.made",
  "fix.requested",
  "approved",
  "refund",
  "cancelled",
  "dispute.opened",
  "dispute.released",
  "dispute.settled",
  "dispute.decided",
] as const;

export type MessageEvent = (typeof MESSAGE_EVENTS)[number];
