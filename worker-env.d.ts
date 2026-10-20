// Worker bindings for this app. Void's default Env names STORAGE; we bind R2,
// plus Images, Email Sending, and a rate limit (ADR 0017).
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    R2: R2Bucket;
    IMAGES: ImagesBinding;
    AI: Ai;
    SEND_EMAIL: SendEmail;
    IP_LIMIT: RateLimit;
    ENVIRONMENT: string;
    MAIL_FROM: string;
    APP_URL: string;
    PAYOUT_RUN_TIME: string;
    TURNSTILE_SITE_KEY: string;
    BETTER_AUTH_SECRET: string;
    TURNSTILE_SECRET_KEY: string;
    PAYMENTS_WEBHOOK_SECRET: string;
  }
}

interface Env extends Cloudflare.Env {}
