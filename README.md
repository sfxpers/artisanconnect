# artisanconnect

TanStack Start on Cloudflare Workers, with Tailwind CSS v4 and shadcn/ui (Base UI).

## Prerequisites

- [mise](https://mise.jdx.dev) — pins Node LTS and nub for this repo
- [nub](https://nubjs.com) — package manager, script runner, and `nubx`

```sh
mise install
```

## Setup

```sh
nub install
```

`postinstall` runs `wrangler types` and writes `worker-configuration.d.ts`. Re-run it after changing `wrangler.jsonc`:

```sh
nub run cf-typegen
```

## Scripts

```sh
nub run dev                # Vite + Workers runtime on http://localhost:3000
nub run build              # production client + worker
nub run preview            # preview the production build locally
nub run test               # Vitest in the Workers runtime, against local D1 and R2
nub run test:smoke         # Playwright smoke tests against the local app, in the installed Chrome
nub run typecheck
nub run lint
nub run fmt
nub run fmt:check
nub run db:generate        # SQL migration from src/domain/schema.ts
nub run db:migrate:local   # apply migrations to local D1
nub run deploy:staging     # migrate staging D1, build, and deploy
nub run deploy:production  # migrate production D1, build, and deploy
nub run admin:setup -- you@example.com                 # make the first Admin in local D1
nub run admin:setup -- you@example.com --env staging   # or --env production
```

## Domain module

Every rule lives in `src/domain` (ADR 0017). It is built with exactly seven ports, D1, R2, Images, a clock, a content reader, a payment adapter, and a mailer, and nothing else, which is how ADR 0018 (no path to or from another product) is tested. Each section adds its commands and clocks to `sections` in `src/domain/index.ts`. A command takes the acting party first and returns the new state or a typed refusal.

- **Clocks** are rows in `due_clocks`. The every-minute cron calls `system.runDueClocks`, the scheduled handler's only job. A clock fires once, however late, and does nothing if its condition has lapsed.
- **Money** is append-only rows in `ledger_entries`. A domain event writes all its rows in one D1 batch.
- **Payments** use the fake adapter in `src/domain/fakes/payments.ts` in every environment; no money moves at launch.

Tests drive the module through `test/support/harness.ts`: real local D1 and R2, with a fake clock, content reader, payment adapter, and mailer. better-auth reads `Date`, so the harness keeps the system time on the fake clock.

- **Sign-in** is better-auth (ADR 0017) inside the `accounts` section, on D1. Its HTTP handler is never mounted: the web app reaches it only through the module's commands, which add the rules (kinds, Marketplace rules, per-Email limits). Turnstile and a per-network limit (the Workers Rate Limiting binding `IP_LIMIT`) are checked by the server functions before a command runs.
- **Admins** (ADR 0015) are better-auth identities with `role = "admin"` and no `accounts` row. They sign in with an Email code only (`/admin/sign-in`). The first is made by `nub run admin:setup`, which calls `system.setUpFirstAdmin` through `getPlatformProxy`; it refuses once there is an Admin. Every Admin decision and every logged read is written to `audit_log` in the same batch (`src/domain/audit.ts`).
- **Queues**: a section raises an item in one of the Admin's eight queues with a kind from `defineQueueItemKind` (`src/domain/queues.ts`), declared in its `queueItems` like its `clocks`. The kind names the decisions it allows and who each tells, the writes a decision makes, its page's tabs and sidebar, and what opens only on a logged click. A recorded decision cannot be reopened.
- **Tells** are rows in `notices` written with the event; their one email goes after the commit, and the every-minute cron retries one that did not go (`src/domain/tells.ts`).

Locally, email is not sent: open http://localhost:3000/dev/mail to read it, Email codes included.

## Cloudflare

Bindings live in `wrangler.jsonc` and are available in server code via `import { env } from "cloudflare:workers"`. The top level is local; `staging` and `production` each have their own D1, R2, and secrets.

| Binding                | Resource                                              |
| ---------------------- | ----------------------------------------------------- |
| `DB`                   | D1 (`artisanconnect`, `-staging`, `-production`)      |
| `R2`                   | R2 bucket (same names)                                |
| `AI`                   | Workers AI                                            |
| `IMAGES`               | Cloudflare Images: draws each photo again             |
| `SEND_EMAIL`           | Email Sending, outbound only                          |
| `ENVIRONMENT`          | env var: `local`, `staging`, or `production`          |
| `MAIL_FROM`            | env var: the sending address                          |
| `APP_URL`              | env var: the web app's origin, for links in email     |
| `TURNSTILE_SITE_KEY`   | env var: locally, Cloudflare's always-pass test key   |
| `BETTER_AUTH_SECRET`   | secret: signs session cookies                         |
| `TURNSTILE_SECRET_KEY` | secret: locally, Cloudflare's always-pass test secret |

Local secrets go in `.dev.vars` (copy `.dev.vars.example` and set `BETTER_AUTH_SECRET`). Set the others with `nubx wrangler secret put BETTER_AUTH_SECRET --env staging` (or `production`), and the same for `TURNSTILE_SECRET_KEY` and `PAYMENTS_WEBHOOK_SECRET`. Errors go to Workers Logs, and Workers Issues groups them in the dashboard. `MAIL_FROM` is an address on `artisanconnect.co.za`, the domain onboarded for Email Sending; `TURNSTILE_SITE_KEY` is the widget made for each environment's host.

Both environments are on the Work account (`account_id` in `wrangler.jsonc`). Production serves `https://artisanconnect.co.za` as a Workers custom domain (`routes` under `env.production`); staging serves its `workers.dev` address.

D1 databases are provisioned on first deploy, so the first time an environment is deployed, deploy before migrating, then make its first Admin:

```sh
nubx wrangler login
CLOUDFLARE_ENV=staging nub run build && nubx wrangler deploy
nubx wrangler d1 migrations apply DB --config wrangler.jsonc --env staging --remote
nub run admin:setup -- you@example.com --env staging
```

The setup command looks the environment's D1 up by name and reaches it as a remote binding. The new Admin signs in at `/admin/sign-in` with an Email code; every other Admin is invited from the Admins page.

Workers AI has no local simulation. `vite.config.ts` and the tests set `remoteBindings: false` so `nub run dev` and `nub run test` work offline. Without it the Content check cannot run, so everything sent locally that passes its patterns (names at sign-up included) is Held for the Admin's Pre-check. After `nubx wrangler login`, set `remoteBindings: true` in `vite.config.ts` for live inference.

## UI

shadcn/ui is initialized as **base-nova** (Base UI, not Radix). Paths in `components.json` match this Start app (`src/styles.css`, `@/components`).

```sh
nubx -y shadcn@latest add card
```

If the CLI tries to install dependencies with another package manager, add them here instead:

```sh
nub add <package>
```

Every form is TanStack Form on shadcn's Field (`src/components/form.tsx`). Pages load through route loaders and reload after each action; TanStack Query is not used (ADR 0017).

The design (`docs/review/111.md` §11) lives in tokens only: every colour, the radius, and the font are in `src/styles.css` (`:root` and `.dark`), and pages and components use those tokens, never their own colours or arbitrary values; `nub run lint` checks it (`scripts/check-tokens.mjs`). shadcn's own files in `src/components/ui` stay as it writes them; customise through tokens and variants. Copy is only in `src/web/copy.ts`. To save every designed screen at 375 and 1280 pixels, light and dark, against a running dev server:

```sh
SCREENS=after nub x playwright test -c e2e/screens
```
