import type { ContentReader, Mailer, Ports } from "@/domain";
import { createFakePayments } from "@/domain/fakes/payments";

/** The domain's ports, from the Worker's bindings. */
export function portsFromEnv(env: Env): Ports {
  return {
    db: env.DB,
    files: env.R2,
    clock: { now: () => new Date() },
    contentReader: unbuiltContentReader,
    payments,
    mailer: cloudflareMailer(env),
  };
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
