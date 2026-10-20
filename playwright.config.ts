import { defineConfig } from "@playwright/test";

// One worker: each seed writes the local D1 file the dev server also holds,
// and two writers at once lock it.
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  // A journey signs in several people, and a sign-in on a dev server that has
  // just started may take 30 seconds (e2e/support/helpers.ts).
  timeout: 60_000,
  // A line per test, on CI too, where the default prints only dots.
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    // The installed Chrome, so no browser download is needed.
    channel: "chrome",
  },
  webServer: {
    command: "vp run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ...process.env,
      // Match the old remoteBindings: false local path (Workers AI has no local sim).
      CLOUDFLARE_VITE_FORCE_LOCAL: "true",
      VOID_INSPECTOR_PORT: "false",
    },
  },
});
