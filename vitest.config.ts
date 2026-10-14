import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside workerd against real local D1 and R2, with the bindings
// from wrangler.jsonc. The migrations are read here and applied per test.
export default defineConfig(async () => {
  // The domain is given its own test config.
  process.env.BETTER_AUTH_SECRET ??= "";
  process.env.TURNSTILE_SECRET_KEY ??= "";
  process.env.PAYMENTS_WEBHOOK_SECRET ??= "";
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
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
      // A test drives whole Engagements through workerd, and the slowest take
      // about five seconds alone: past Vitest's default when the machine is busy.
      testTimeout: 20_000,
      // On by default since 5.0.4, but workerd cannot read the cache it writes (@cloudflare/vitest-plugin 1.4.0).
      fsModuleCache: false,
    },
  };
});
