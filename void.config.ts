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
    // Existing Worker date (newer than Void's deploy default).
    compatibility_date: "2026-10-12",
    compatibility_flags: ["nodejs_compat", "nodejs_als"],
  },
  cloudflare: {
    account_id: CLOUDFLARE_ACCOUNT_ID,
    ...WORKER_SHARED,
    ...WORKER_ENVIRONMENTS[environment],
  },
});
