import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { requestActor, requestDomain } from "./session";

// The People page's server functions (#136): thin adapters onto the domain
// module, which refuses anyone but an Admin.

/** The Accounts whose name or Email holds the words given. */
export const findPeople = createServerFn({ method: "GET" })
  .validator((input: { query: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    const found = await domain.people.find(await requestActor(domain), data);
    if (found === null) throw notFound();
    return found;
  });

/** One Account's page. */
export const getPerson = createServerFn({ method: "GET" })
  .validator((input: { accountId: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    const person = await domain.people.view(await requestActor(domain), data);
    if (person === null) throw notFound();
    return person;
  });

export const warnPerson = createServerFn({ method: "POST" })
  .validator((input: { accountId: string; reason: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.people.warn(await requestActor(domain), data);
  });

export const suspendPerson = createServerFn({ method: "POST" })
  .validator((input: { accountId: string; reason: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.people.suspend(await requestActor(domain), data);
  });

export const liftSuspension = createServerFn({ method: "POST" })
  .validator((input: { accountId: string; reason?: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.people.lift(await requestActor(domain), data);
  });
