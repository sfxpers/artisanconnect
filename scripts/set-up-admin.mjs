// The deploy-time setup command: makes the first Admin of one environment
// (ADR 0015), through the domain module's own entry point. Once there is an
// Admin it refuses; further Admins are invited from the Admins page.
//
//   nub run admin:setup -- you@example.com                    local D1
//   nub run admin:setup -- you@example.com --env staging      staging D1 (or production)
//
// Staging and production need `nubx wrangler login` first, and their D1 must
// exist and be migrated (the first deploy does both).
import path from "node:path";
import { parseArgs } from "node:util";
import { withWorkerModule } from "./worker-module.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const { values, positionals } = parseArgs({
  // `nub run admin:setup -- …` passes its "--" on.
  args: args[0] === "--" ? args.slice(1) : args,
  allowPositionals: true,
  options: { env: { type: "string" } },
});
const [email] = positionals;
const environment = values.env;
if (!email || (environment && !["staging", "production"].includes(environment))) {
  console.error("Usage: nub run admin:setup -- <email> [--env staging|production]");
  process.exit(1);
}

await withWorkerModule(
  path.join(root, "src/worker/set-up-admin.ts"),
  // Staging's and production's D1 are remote: wrangler.jsonc names each by its id.
  {
    configPath: path.join(root, "wrangler.jsonc"),
    environment,
    remoteBindings: Boolean(environment),
  },
  async (module, env) => {
    const result = await module.setUpFirstAdmin(env, email);
    if (!result.ok) {
      console.error(result.refusal.message);
      process.exitCode = 1;
    } else {
      const signIn = new URL("/admin/sign-in", env.APP_URL).href;
      console.log(
        `${result.value.email} is the first Admin. Sign in with an Email code at ${signIn}`,
      );
    }
  },
);
