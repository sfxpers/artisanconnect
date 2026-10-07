import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { requestActor, requestDomain } from "./session";

// Payouts' server functions (#128): thin adapters onto the domain module,
// which decides who may see and do what.

/** A Payout the bank refused or sent back, which shows red (#129). */
export function isStopped(state: string): state is "refused" | "sent-back" {
  return state === "refused" || state === "sent-back";
}

/** The Artisan's Payouts view: each Release and where its Payout stands. */
export const getMyPayouts = createServerFn({ method: "GET" }).handler(async () => {
  const domain = requestDomain();
  const payouts = await domain.payouts.mine(await requestActor(domain));
  if (!payouts) throw notFound();
  return payouts;
});

/** Each Artisan's unpaid total, and each one held, for the Admin. */
export const getUnpaidTotals = createServerFn({ method: "GET" }).handler(async () => {
  const domain = requestDomain();
  const unpaid = await domain.payouts.unpaid(await requestActor(domain));
  if (!unpaid) throw notFound();
  return unpaid;
});

/** An Artisan's money history, for the Admin: each Release and every Payout of it. */
export const getPayoutHistory = createServerFn({ method: "GET" })
  .validator((input: { artisanId: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    const history = await domain.payouts.history(await requestActor(domain), data);
    if (!history) throw notFound();
    return history;
  });

/** Whether the float can cover the Payouts sent, for the Admin home's banner. */
export const getFloat = createServerFn({ method: "GET" }).handler(async () => {
  const domain = requestDomain();
  const float = await domain.payouts.float(await requestActor(domain));
  if (!float) throw notFound();
  return float;
});

export const holdPayouts = createServerFn({ method: "POST" })
  .validator((input: { artisanId: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.payouts.hold(await requestActor(domain), data);
  });

export const liftPayoutHold = createServerFn({ method: "POST" })
  .validator((input: { artisanId: string }) => input)
  .handler(async ({ data }) => {
    const domain = requestDomain();
    return domain.payouts.lift(await requestActor(domain), data);
  });
