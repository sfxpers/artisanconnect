import { createDomain } from "@/domain";
import { portsFromEnv } from "./ports";

/**
 * The deploy-time setup command's body (scripts/set-up-admin.mjs): makes the
 * first Admin in the environment the bindings belong to.
 */
export function setUpFirstAdmin(env: Env, email: string) {
  // Setting up signs no session in, so it needs no BETTER_AUTH_SECRET.
  const domain = createDomain(portsFromEnv(env), {
    appUrl: env.APP_URL,
    authSecret: "",
    payoutRunTime: env.PAYOUT_RUN_TIME,
  });
  return domain.system.setUpFirstAdmin({ email });
}
