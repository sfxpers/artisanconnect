// Materialize `.void-wrangler.jsonc` from `void.lock.json` so Wrangler D1
// commands work without a root wrangler.jsonc (Void owns that config now).
// Prefer Void's own materialize when available; fall back to the lock text.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".void-wrangler.jsonc");

async function materializeViaVoid() {
  const dist = join(root, "node_modules", "void", "dist");
  if (!existsSync(dist)) return false;
  const file = readdirSync(dist).find((name) => name.startsWith("cloudflare-config-"));
  if (!file) return false;
  const mod = await import(pathToFileURL(join(dist, file)).href);
  // Bundled export: materializeCloudflareConfig as `r`
  if (typeof mod.r !== "function") return false;
  mod.r(root);
  return existsSync(out);
}

function materializeFromLock() {
  const lockPath = join(root, "void.lock.json");
  if (!existsSync(lockPath)) {
    console.error(
      "[ensure-void-wrangler] void.lock.json missing — run void migrate / void prepare",
    );
    process.exit(1);
  }
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const text =
    typeof lock.text === "string"
      ? lock.text
      : `${JSON.stringify(lock.resolved ?? lock.source ?? {}, null, 2)}\n`;
  writeFileSync(out, text);
}

if (!(await materializeViaVoid())) {
  materializeFromLock();
}

if (!existsSync(out)) {
  console.error("[ensure-void-wrangler] failed to write .void-wrangler.jsonc");
  process.exit(1);
}
