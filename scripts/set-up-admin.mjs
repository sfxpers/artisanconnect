// The deploy-time setup command: makes the first Admin of one environment
// (ADR 0015), through the domain module's own entry point. Once there is an
// Admin it refuses; further Admins are invited from the Admins page.
//
//   nub run admin:setup -- you@example.com                    local D1
//   nub run admin:setup -- you@example.com --env staging      staging D1 (or production)
//
// Staging and production need `nubx wrangler login` first, and their D1 must
// exist and be migrated (the first deploy does both).
import { execFileSync } from "node:child_process";
import { rmSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parseArgs } from "node:util";
import { applyEdits, modify, parse } from "jsonc-parser";
import { runnerImport } from "vite";
import { getPlatformProxy } from "wrangler";

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

const configPath = environment ? remoteConfig(environment) : path.join(root, "wrangler.jsonc");
let proxy;
try {
  proxy = await getPlatformProxy({
    configPath,
    environment,
    remoteBindings: Boolean(environment),
  });
  const { module } = await runnerImport(path.join(root, "src/worker/set-up-admin.ts"), {
    configFile: false,
    logLevel: "error",
    resolve: { tsconfigPaths: true },
    plugins: [wasmModules()],
  });
  const result = await module.setUpFirstAdmin(proxy.env, email);
  if (!result.ok) {
    console.error(result.refusal.message);
    process.exitCode = 1;
  } else {
    const signIn = new URL("/admin/sign-in", proxy.env.APP_URL).href;
    console.log(
      `${result.value.email} is the first Admin. Sign in with an Email code at ${signIn}`,
    );
  }
} finally {
  await proxy?.dispose();
  if (environment) rmSync(configPath, { force: true });
}

/**
 * Loads `*.wasm?module` as a compiled WebAssembly.Module, as the Worker build
 * does. The domain imports the photo codecs that way, and Vite alone does not
 * know the suffix.
 */
function wasmModules() {
  return {
    name: "wasm-modules",
    enforce: "pre",
    load(id) {
      if (!id.endsWith(".wasm?module")) return;
      const file = id.slice(0, -"?module".length);
      return [
        `import { readFileSync } from "node:fs";`,
        `export default new WebAssembly.Module(readFileSync(${JSON.stringify(file)}));`,
      ].join("\n");
    },
  };
}

/**
 * A copy of wrangler.jsonc whose D1 for this environment is the remote one.
 * Remote D1 needs its id, which wrangler.jsonc leaves out so the first deploy
 * can provision it; it is looked up by name.
 */
function remoteConfig(environment) {
  const source = readFileSync(path.join(root, "wrangler.jsonc"), "utf8");
  const database = parse(source).env[environment].d1_databases[0];
  const wrangler = createRequire(import.meta.url).resolve("wrangler/bin/wrangler.js");
  const listed = JSON.parse(
    execFileSync(process.execPath, [wrangler, "d1", "list", "--json"], { encoding: "utf8" }),
  );
  const found = listed.find((listedDatabase) => listedDatabase.name === database.database_name);
  if (!found)
    throw new Error(`No D1 named ${database.database_name}. Deploy ${environment} first.`);
  let edited = source;
  for (const [key, value] of [
    ["database_id", found.uuid],
    ["remote", true],
  ]) {
    edited = applyEdits(
      edited,
      modify(edited, ["env", environment, "d1_databases", 0, key], value, {}),
    );
  }
  // Beside wrangler.jsonc, so its relative paths still resolve.
  const written = path.join(root, `wrangler.admin-setup.${environment}.jsonc`);
  writeFileSync(written, edited);
  return written;
}
