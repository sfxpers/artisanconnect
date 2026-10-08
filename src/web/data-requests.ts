import { createServerFn } from "@tanstack/react-start";
import { requestActor, requestDomain, endSession } from "./session";

/** The signed-in Account's own Data requests, newest first. */
export const getMyDataRequests = createServerFn({ method: "GET" }).handler(async () => {
  const domain = requestDomain();
  return domain.dataRequests.mine(await requestActor(domain));
});

/** Asks for a copy of the signed-in Account's data, or for erasure, which closes it and signs it out. */
export const requestData = createServerFn({ method: "POST" })
  .validator((input: { kind: "copy" | "erasure" }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    const asked = await domain.dataRequests.request(await requestActor(domain), data);
    if (asked.ok && data.kind === "erasure") await endSession(domain);
    return asked;
  });
