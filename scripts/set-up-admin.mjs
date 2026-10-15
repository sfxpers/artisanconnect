// Makes the first Admin (ADR 0015). Once there is one, it refuses.
import path from "node:path";
import { parseArgs } from "node:util";
import { withWorkerModule } from "./worker-module.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const { values, positionals } = parseArgs({
  // `vp run admin:setup -- …` passes its "--" on.
  args: args[0] === "--" ? args.slice(1) : args,
  allowPositionals: true,
  options: { env: { type: "string" } },
});
const [email] = positionals;
const environment = values.env;
if (!email || (environment && !["staging", "production"].includes(environment))) {
  console.error("Usage: vp run admin:setup <email> [--env staging|production]");
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
