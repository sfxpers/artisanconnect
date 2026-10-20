import { defineScheduled } from "void";
import { domainFromEnv } from "@/worker/ports";

// Every minute (ADR 0017). Every clock's rule, and when the daily Payout
// run goes, lives in the domain module; one failing does not stop the other.
export const cron = "* * * * *";

export default defineScheduled(async (_controller, env) => {
  const { system } = domainFromEnv(env as unknown as Env);
  const failed = (await Promise.allSettled([system.runDueClocks(), system.runPayouts()])).flatMap(
    (result) => (result.status === "rejected" ? [result.reason] : []),
  );
  if (failed.length > 0) throw new AggregateError(failed, "The scheduled run failed");
});
