import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vite-plus";

// A file of its own, not a `test` block in vite.config.ts: the tests load the
// domain through cloudflareTest, never the app's plugins.
export default defineConfig(async () => {
  process.env.BETTER_AUTH_SECRET ??= "";
  process.env.TURNSTILE_SECRET_KEY ??= "";
  process.env.PAYMENTS_WEBHOOK_SECRET ??= "";
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    resolve: { tsconfigPaths: true },
    assetsInclude: ["test/fixtures/**/*.heic"],
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        main: "./test/support/worker.ts",
        // The plugin default is remote. Workers AI has no local simulation.
        remoteBindings: false,
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
      // A test drives whole Engagements through workerd, and the slowest take
      // about five seconds alone: past Vitest's default when the machine is busy.
      testTimeout: 20_000,
    },
  };
});
