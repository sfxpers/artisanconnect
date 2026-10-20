import { defineConfig } from "void/config";
import {
  CLOUDFLARE_ACCOUNT_ID,
  resolveWorkerEnvironmentName,
  WORKER_ENVIRONMENTS,
  WORKER_SHARED,
} from "./cloudflare-environments";

const environment = resolveWorkerEnvironmentName();

export default defineConfig({
  target: "cloudflare",
  routing: {
    // SSR app; avoids interactive ISR prompt on deploy.
    isr: false,
  },
  worker: {
    // Void deploy default; bump deliberately.
    compatibility_date: "2026-09-11",
    compatibility_flags: ["nodejs_compat", "nodejs_als"],
  },
  cloudflare: {
    account_id: CLOUDFLARE_ACCOUNT_ID,
    ...WORKER_SHARED,
    ...WORKER_ENVIRONMENTS[environment],
  },
});
