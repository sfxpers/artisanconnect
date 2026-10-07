// Seeds the local app's D1 for a smoke test, and prints what it made as JSON:
//   node e2e/support/seed.mjs hire
import path from "node:path";
import { withWorkerModule } from "../../scripts/worker-module.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const [name] = process.argv.slice(2);

await withWorkerModule(
  path.join(root, "e2e/support/seeds.ts"),
  // Workers AI is remote only, and the seed passes the Content check by a fake.
  { configPath: path.join(root, "wrangler.jsonc"), remoteBindings: false },
  async (seeds, env) => {
    if (typeof seeds[name] !== "function") throw new Error(`No seed named "${name}"`);
    console.log(JSON.stringify(await seeds[name](env)));
  },
);
