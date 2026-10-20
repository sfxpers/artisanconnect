/** Staging / production / local Worker targets. Void has no named envs — pick one via CLOUDFLARE_ENV. */

export const CLOUDFLARE_ACCOUNT_ID = "ab816378ce175deba8768e44d4c9478b";

export const WORKER_SHARED = {
  // Also on cloudflare (not only worker:) so .void-wrangler.jsonc has them for
  // Wrangler/Vitest tooling that reads the materialized file directly.
  compatibility_date: "2026-10-12",
  compatibility_flags: ["nodejs_compat", "nodejs_als"],
  // Cron + fetch live in src/server.ts (TanStack Start custom entry).
  main: "src/server.ts",
  upload_source_maps: true,
  triggers: {
    crons: ["* * * * *"],
  },
  observability: {
    enabled: true,
    issues: { enabled: true },
  },
  // Workers AI has no local simulation; local Content check Holds pattern-pass
  // items (see README). Do not set `remote: true` here — that forces a remote
  // proxy session during `vp dev` / smoke.
  ai: {
    binding: "AI",
  },
  images: {
    binding: "IMAGES",
  },
  send_email: [{ name: "SEND_EMAIL" }],
  secrets: {
    required: ["BETTER_AUTH_SECRET", "TURNSTILE_SECRET_KEY", "PAYMENTS_WEBHOOK_SECRET"],
  },
};

export const WORKER_ENVIRONMENTS = {
  local: {
    name: "artisanconnect",
    vars: {
      ENVIRONMENT: "local",
      MAIL_FROM: "ArtisanConnect <no-reply@example.com>",
      APP_URL: "http://localhost:3000",
      PAYOUT_RUN_TIME: "09:00",
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    },
    ratelimits: [
      {
        name: "IP_LIMIT",
        namespace_id: "1001",
        simple: { limit: 100, period: 60 },
      },
    ],
    d1_databases: [
      {
        binding: "DB",
        database_name: "artisanconnect",
        migrations_dir: "migrations",
      },
    ],
    r2_buckets: [
      {
        binding: "R2",
        bucket_name: "artisanconnect",
      },
    ],
  },
  staging: {
    name: "artisanconnect-staging",
    // Staging is served on workers.dev only.
    workers_dev: true,
    preview_urls: false,
    vars: {
      ENVIRONMENT: "staging",
      MAIL_FROM: "ArtisanConnect <no-reply@artisanconnect.co.za>",
      APP_URL: "https://artisanconnect-staging.weathered-shadow-5138.workers.dev",
      PAYOUT_RUN_TIME: "09:00",
      TURNSTILE_SITE_KEY: "0x4AAAAAAFU7PtdnwZ5hBIB7",
    },
    ratelimits: [
      {
        name: "IP_LIMIT",
        namespace_id: "1002",
        simple: { limit: 20, period: 60 },
      },
    ],
    d1_databases: [
      {
        binding: "DB",
        database_name: "artisanconnect-staging",
        database_id: "658d50d5-6b9f-4d92-afe8-6e1e80570c82",
        // admin:setup runs beside the Worker and reads this D1.
        remote: true,
        migrations_dir: "migrations",
      },
    ],
    r2_buckets: [
      {
        binding: "R2",
        bucket_name: "artisanconnect-staging",
      },
    ],
  },
  production: {
    name: "artisanconnect-production",
    workers_dev: false,
    preview_urls: false,
    routes: [{ pattern: "artisanconnect.co.za", custom_domain: true }],
    vars: {
      ENVIRONMENT: "production",
      MAIL_FROM: "ArtisanConnect <no-reply@artisanconnect.co.za>",
      APP_URL: "https://artisanconnect.co.za",
      PAYOUT_RUN_TIME: "09:00",
      TURNSTILE_SITE_KEY: "0x4AAAAAAFWwjRc9qeMKE8Jh",
    },
    ratelimits: [
      {
        name: "IP_LIMIT",
        namespace_id: "1003",
        simple: { limit: 20, period: 60 },
      },
    ],
    d1_databases: [
      {
        binding: "DB",
        database_name: "artisanconnect-production",
        database_id: "3874eb0d-f6f5-4d2d-992e-96381a3d21e6",
        // admin:setup runs beside the Worker and reads this D1.
        remote: true,
        migrations_dir: "migrations",
      },
    ],
    r2_buckets: [
      {
        binding: "R2",
        bucket_name: "artisanconnect-production",
      },
    ],
  },
};

export type WorkerEnvironmentName = keyof typeof WORKER_ENVIRONMENTS;

export function resolveWorkerEnvironmentName(
  cloudflareEnv = process.env.CLOUDFLARE_ENV,
): WorkerEnvironmentName {
  if (cloudflareEnv === "staging" || cloudflareEnv === "production") return cloudflareEnv;
  return "local";
}
