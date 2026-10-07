import type { DomainConfig, Email, Mailer, Ports } from "@/domain";
import { createDomain } from "@/domain";
import { createStoredFakePayments } from "@/domain/fakes/payments";
import { workersAiContentReader } from "./content-reader";
import { d1FakePaymentsStore } from "./fake-payments";

/** The domain module, built from the Worker's bindings. */
export function domainFromEnv(env: Env) {
  return createDomain(portsFromEnv(env), configFromEnv(env));
}

/** The domain's ports, from the Worker's bindings. */
export function portsFromEnv(env: Env): Ports {
  return {
    db: env.DB,
    files: env.R2,
    clock: { now: () => new Date() },
    contentReader: workersAiContentReader(env.AI),
    payments: fakePaymentsFromEnv(env),
    mailer: env.ENVIRONMENT === "local" ? localMailbox : cloudflareMailer(env),
  };
}

export function configFromEnv(env: Env): DomainConfig {
  if (!env.BETTER_AUTH_SECRET) throw new Error("Set the BETTER_AUTH_SECRET secret");
  return {
    appUrl: env.APP_URL,
    authSecret: env.BETTER_AUTH_SECRET,
    payoutRunTime: env.PAYOUT_RUN_TIME,
  };
}

/**
 * Launch money is fake in every environment (#111). Its state is kept in D1,
 * so its checkout page finds a collection whichever isolate opened it.
 */
export function fakePaymentsFromEnv(env: Env) {
  return createStoredFakePayments({ store: d1FakePaymentsStore(env.DB) });
}

/** Cloudflare Email Sending, outbound only. */
function cloudflareMailer(env: Env): Mailer {
  return {
    async send(email) {
      await env.SEND_EMAIL.send({ from: env.MAIL_FROM, ...email });
    },
  };
}

/**
 * Locally, email goes nowhere: the newest stays in this isolate's memory, for
 * the /dev/mail page to show (Email codes included).
 */
export const localMail: Email[] = [];
const localMailbox: Mailer = {
  async send(email) {
    localMail.unshift(email);
    localMail.length = Math.min(localMail.length, 50);
  },
};
