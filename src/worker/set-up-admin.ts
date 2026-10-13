import { createDomain } from "@/domain";
import { configFromEnv, portsFromEnv } from "./ports";

/**
 * The deploy-time setup command's body (scripts/set-up-admin.mjs): makes the
 * first Admin in the environment the bindings belong to.
 */
export function setUpFirstAdmin(env: Env, email: string) {
  const domain = createDomain(portsFromEnv(env), configFromEnv(env, ""));
  return domain.system.setUpFirstAdmin({ email });
}
