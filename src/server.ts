import * as Sentry from "@sentry/cloudflare";
import handler from "@tanstack/react-start/server-entry";
import { domainFromEnv } from "@/worker/ports";

// Errors go to Workers Logs and, where SENTRY_DSN is set, to Sentry.
export default Sentry.withSentry(
  (env: Env) => ({ dsn: env.SENTRY_DSN || undefined, environment: env.ENVIRONMENT }),
  {
    // Server code reads bindings from `cloudflare:workers`.
    fetch: (request) => handler.fetch(request),

    // Every minute (ADR 0017). Every clock's rule, and when the daily Payout
    // run goes, lives in the domain module; one failing does not stop the other.
    async scheduled(_controller, env) {
      const { system } = domainFromEnv(env);
      const failed = (
        await Promise.allSettled([system.runDueClocks(), system.runPayouts()])
      ).flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
      if (failed.length > 0) throw new AggregateError(failed, "The scheduled run failed");
    },
  } satisfies ExportedHandler<Env>,
);
