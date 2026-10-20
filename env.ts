import { defineEnv, string } from "void/env";

// Server secrets (Worker secrets). No VITE_* client keys in this app.
// Local values go in a single root `.env` (Void forbids `.env.example` / `.dev.vars`).
export default defineEnv({
  BETTER_AUTH_SECRET: string(),
  TURNSTILE_SECRET_KEY: string(),
  PAYMENTS_WEBHOOK_SECRET: string(),
});
