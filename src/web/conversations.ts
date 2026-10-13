import { createServerFn } from "@tanstack/react-start";
import { requestActor, requestDomain } from "./session";
import { filesOf, textOf } from "./form-data";

// Conversations: thin adapters onto the domain module, which decides who sees
// a Conversation, what may be said in it, and who is told (ADR 0010).

const byConversation = (input: { conversationId: string }) => input;

/** The Conversations on the Job the signed-in Account sees. */
export const getConversations = createServerFn({ method: "GET" })
  .validator((input: { jobId: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.conversations.forJob(await requestActor(domain), data);
  });

/** One Conversation as the signed-in Account sees it. */
export const getConversation = createServerFn({ method: "GET" })
  .validator(byConversation)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.conversations.view(await requestActor(domain), data);
  });

/** Sends a message: "conversationId", "text", and up to five "files" (photos, voice notes, PDFs). */
export const sendMessage = createServerFn({ method: "POST" })
  .validator((input: FormData) => {
    if (!(input instanceof FormData)) throw new Error("Expected a form");
    return {
      conversationId: textOf(input, "conversationId") ?? "",
      text: textOf(input, "text") ?? "",
      files: filesOf(input, "files"),
    };
  })
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.conversations.send(await requestActor(domain), data);
  });

/** Marks the Conversation opened: what was delivered to the Account is read. */
export const openConversation = createServerFn({ method: "POST" })
  .validator(byConversation)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.conversations.opened(await requestActor(domain), data);
  });

/** Withdraws the Account's message being checked. */
export const withdrawMessage = createServerFn({ method: "POST" })
  .validator((input: { messageId: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.conversations.withdrawHeld(await requestActor(domain), data);
  });
