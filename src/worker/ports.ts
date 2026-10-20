import type { ContentReader, DomainConfig, Email, Mailer, Ports } from "@/domain";
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
  const local = env.ENVIRONMENT === "local";
  return {
    db: env.DB,
    files: env.R2,
    images: env.IMAGES,
    clock: { now: () => new Date() },
    // Local: do not call Workers AI (binding stays remote:true so vp dev can
    // start). Unsures Hold for the Admin's Pre-check — same as when AI is down.
    contentReader: local ? localContentReader : workersAiContentReader(env.AI),
    payments: fakePaymentsFromEnv(env),
    mailer: local ? localMailbox : cloudflareMailer(env),
  };
}

/** Setting up the first Admin signs no session in, so it passes an empty secret. */
export function configFromEnv(env: Env, authSecret = env.BETTER_AUTH_SECRET || null): DomainConfig {
  if (authSecret === null) throw new Error("Set the BETTER_AUTH_SECRET secret");
  return {
    appUrl: env.APP_URL,
    authSecret,
    payoutRunTime: env.PAYOUT_RUN_TIME,
  };
}

/**
 * Launch money is fake in every environment (#111). Its state is kept in D1,
 * so its checkout page finds a collection whichever isolate opened it.
 */
export function fakePaymentsFromEnv(env: Env) {
  if (!env.PAYMENTS_WEBHOOK_SECRET) throw new Error("Set the PAYMENTS_WEBHOOK_SECRET secret");
  return createStoredFakePayments({
    store: d1FakePaymentsStore(env.DB),
    webhookSecret: env.PAYMENTS_WEBHOOK_SECRET,
  });
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

/** Local stand-in: file reads are empty; the verdict cannot run, so items Hold. */
const localContentReader: ContentReader = {
  async readPhoto() {
    return "";
  },
  async transcribe() {
    return "";
  },
  async readPdf() {
    return [];
  },
  async read() {
    return { kind: "cannot-run", reason: "Workers AI is not used locally." };
  },
};
