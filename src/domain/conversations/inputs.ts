// What a message may hold, and the events a Conversation shows, shared with the composer.

/** The most characters a message's text may have. */
export const MESSAGE_MAX = 2000;

/** The most files one message may carry. */
export const MESSAGE_ATTACHMENTS_MAX = 5;

/** The events a Conversation shows as rows that are not speech. Hire and after come with #126 and #131. */
export const MESSAGE_EVENTS = ["quote.sent"] as const;

export type MessageEvent = (typeof MESSAGE_EVENTS)[number];
