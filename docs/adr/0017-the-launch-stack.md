# The launch stack

**App and data**

- TanStack Start on Cloudflare Workers. Every rule lives in one plain TypeScript domain module; the web app reaches it through server functions, and an HTTP API over the same module comes when a native app does.
- shadcn on Base UI with Tailwind v4, plus TanStack Form and Zod schemas shared with the domain module. Pages load their data through TanStack Router's loaders and its built-in cache, invalidated after each action.
- D1 with Drizzle. Money is append-only ledger rows, written in one atomic batch per event.
- R2 for files. Cloudflare Images draws each photo again, which drops its location data, and it is stored as one resized copy plus a thumbnail.

**Services**

- **Sign-in:** better-auth, with Email and password plus Email codes. Its admin plugin marks staff only; impersonation and user management are off. Cloudflare Turnstile and rate limits guard sign-up, sign-in, and code requests.
- **Mail:** Cloudflare Email Sending, outbound only. support@ stays at HostAfrica.
- **Clocks:** every clock is a row with a due time, fired by a cron every minute; Payouts go in a daily run.
- **Workers AI** reads media and text for the content check.
- **Payments:** a fake adapter, shaped like the provider the research picks.
- **Monitoring and environments:** Workers Logs, with Workers Issues grouping every failure and logged error; local, staging, and production, each with its own data.

**Tests and tooling**

- **Tests:** Vitest at one Engagement seam over the domain module, with a fake clock, a fake AI, and a fake payment adapter, plus a few Playwright smoke tests.
- **Tooling:** Vite+ (`vp`), which runs Node and pnpm at the versions the repo pins and ships Vite, Vitest, Oxlint, and Oxfmt as one set. **Void** owns the Cloudflare Vite plugin (`voidPlugin()`), typed env, Worker config (`void.config.ts` / `void.lock.json`), and `void deploy --platform cloudflare` (staging and production selected with `CLOUDFLARE_ENV`).

**Data home.** Personal data lives on Cloudflare's network, which may be outside South Africa, and the POPIA consent at sign-up names that transfer.

**Rejected**

- An hourly cron, because clocks would land up to an hour late.
- Workflows per Engagement, because Fix requests, "Not started", and Chargebacks would keep waking and aborting them.
- Postgres, because launch volume does not need a second service.
- An HTTP API from day one, because no app exists yet.
- Sentry, because Workers Issues groups the same failures, and the errors the code catches and logs, with no SDK or secret.
- mise and nub beside Vite+, because Vite+ manages Node and pnpm itself and does not run nub.
- TanStack Query, because the router's own loader cache covers what the pages need: no data is shared between routes, and every write reloads the page that made it.
