import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Tests run inside workerd against real local D1 and R2, with the bindings
// from wrangler.jsonc. The migrations are read here and applied per test.
export default defineConfig(async () => {
  // Sentry is off in tests.
  process.env.SENTRY_DSN ??= "";
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    resolve: { tsconfigPaths: true },
    // Test fixtures Vite does not know as assets, imported with ?inline.
    assetsInclude: ["test/fixtures/**/*.heic"],
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        main: "./test/support/worker.ts",
        // Workers AI has no local simulation; tests use the fake content reader.
        remoteBindings: false,
        miniflare: {
          // The pool's workerd supports dates up to this one, older than
          // wrangler.jsonc's. Remove once the pool catches up.
          compatibilityDate: "2026-08-22",
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
    },
  };
});
