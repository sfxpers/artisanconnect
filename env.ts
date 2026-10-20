import { defineEnv, string } from "void/env";

// Server secrets (Worker secrets). Optional so local/CI can run without every
// key; production values stay Worker secrets (`void secret put`). No VITE_*
// client keys in this app.
export default defineEnv({
  BETTER_AUTH_SECRET: string().optional(),
  TURNSTILE_SECRET_KEY: string().optional(),
  PAYMENTS_WEBHOOK_SECRET: string().optional(),
});
