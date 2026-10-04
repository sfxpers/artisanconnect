import { createServerFn } from "@tanstack/react-start";
import { requestActor, requestDomain } from "./session";

/** The signed-in Account's own Support requests, newest first. */
export const getMySupport = createServerFn({ method: "GET" }).handler(async () => {
  const domain = requestDomain();
  return domain.support.mine(await requestActor(domain));
});

/** Sends the Admin a Support request under one of the fixed topics. */
export const sendSupport = createServerFn({ method: "POST" })
  .inputValidator((input: { topic: string; message: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.support.send(await requestActor(domain), data);
  });
