import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { visitor } from "@/domain/actor";
import type { QueueName } from "@/domain/queue-names";
import { requestActor, requestDomain, requestIp, sendCookies, turnstileRefusal } from "./session";

// The Admin's server functions: thin adapters onto the domain module, which
// refuses anyone but an Admin (ADR 0017).

export const requestAdminCode = createServerFn({ method: "POST" })
  .validator((input: { email: string; turnstileToken?: string }) => input)
  .handler(async ({ data }) => {
    const refused = await turnstileRefusal(data.turnstileToken);
    if (refused) return refused;
    return requestDomain().admins.requestSignInCode(visitor, {
      email: data.email,
      ip: requestIp(),
    });
  });

export const adminSignIn = createServerFn({ method: "POST" })
  .validator((input: { email: string; code: string }) => input)
  .handler(async ({ data }) => {
    const signedIn = await requestDomain().admins.signIn(visitor, { ...data, ip: requestIp() });
    if (!signedIn.ok) return signedIn;
    sendCookies(signedIn.value.cookies);
    return { ok: true as const, value: {} };
  });

/** The home stream of the eight queues, or of one. */
export const getAdminHome = createServerFn({ method: "GET" })
  .validator((input: { queue?: QueueName }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return orNotFound(await domain.queues.home(await requestActor(domain), data));
  });

export const getQueueItem = createServerFn({ method: "GET" })
  .validator((input: { itemId: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return orNotFound(await domain.queues.item(await requestActor(domain), data));
  });

export const decideQueueItem = createServerFn({ method: "POST" })
  .validator((input: { itemId: string; decision: string; reason?: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.queues.decide(await requestActor(domain), data);
  });

/** Records the Admin's decision on one row of an item, such as one Verification check. */
export const decideQueueRow = createServerFn({ method: "POST" })
  .validator(
    (input: {
      itemId: string;
      rowId: string;
      decision: string;
      reason?: string;
      fields?: Record<string, string>;
    }) => input,
  )
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.queues.decideRow(await requestActor(domain), data);
  });

/** Opens what an item, or one of its rows, shows only on a logged click. */
export const openLoggedRead = createServerFn({ method: "POST" })
  .validator((input: { itemId: string; read: string; rowId?: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.queues.open(await requestActor(domain), data);
  });

export const getAdmins = createServerFn({ method: "GET" }).handler(async () => {
  const domain = requestDomain();
  return orNotFound(await domain.admins.list(await requestActor(domain)));
});

export const inviteAdmin = createServerFn({ method: "POST" })
  .validator((input: { email: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.admins.invite(await requestActor(domain), data);
  });

export const removeAdmin = createServerFn({ method: "POST" })
  .validator((input: { adminId: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.admins.remove(await requestActor(domain), data);
  });

export const getAuditLog = createServerFn({ method: "GET" })
  .validator((input: { before?: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return orNotFound(await domain.admins.auditLog(await requestActor(domain), data));
  });

/** A projection the viewer may not see is a page that does not exist. */
function orNotFound<T>(value: T | null): T {
  if (value === null) throw notFound();
  return value;
}
