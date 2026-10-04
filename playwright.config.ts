import { defineConfig } from "@playwright/test";

// Smoke tests (seam 2): a few whole journeys through the local app, with
// Turnstile's test keys and the local mailbox at /dev/mail. Every rule is
// tested at the domain module; these only prove the pieces are wired.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    // The installed Chrome, so no browser download is needed.
    channel: "chrome",
  },
  webServer: {
    command: "nub run db:migrate:local && nub run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
