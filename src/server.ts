import * as Sentry from "@sentry/cloudflare";
import handler from "@tanstack/react-start/server-entry";
import { createDomain } from "@/domain";
import { portsFromEnv } from "@/worker/ports";

// Errors go to Workers Logs and, where SENTRY_DSN is set, to Sentry.
export default Sentry.withSentry(
  (env: Env) => ({ dsn: env.SENTRY_DSN || undefined, environment: env.ENVIRONMENT }),
  {
    // Server code reads bindings from `cloudflare:workers`.
    fetch: (request) => handler.fetch(request),

    // Every minute (ADR 0017). Every clock's rule lives in the domain module.
    async scheduled(_controller, env) {
      await createDomain(portsFromEnv(env)).system.runDueClocks();
    },
  } satisfies ExportedHandler<Env>,
);
