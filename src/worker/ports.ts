import type { ContentReader, DomainConfig, Email, Mailer, Ports } from "@/domain";
import { createDomain } from "@/domain";
import { createFakePayments } from "@/domain/fakes/payments";

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
    contentReader: unbuiltContentReader,
    payments,
    mailer: env.ENVIRONMENT === "local" ? localMailbox : cloudflareMailer(env),
  };
}

export function configFromEnv(env: Env): DomainConfig {
  if (!env.BETTER_AUTH_SECRET) throw new Error("Set the BETTER_AUTH_SECRET secret");
  return { appUrl: env.APP_URL, authSecret: env.BETTER_AUTH_SECRET };
}

/**
 * Launch money is fake in every environment (#111). Its state lives in this
 * isolate's memory until the Hire ticket (#126) gives it a home that survives.
 */
const payments = createFakePayments();

/**
 * The Workers AI reader comes with the content check (#116). Until then every
 * read cannot run, which Holds the item for the Admin: nothing unread goes out.
 */
const unbuiltContentReader: ContentReader = {
  async read() {
    return { kind: "cannot-run", reason: "The content reader is not built yet." };
  },
};

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
