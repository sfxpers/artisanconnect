# ArtisanConnect

A marketplace for hiring verified Artisans in Cape Town: TanStack Start on Cloudflare Workers, with D1, R2, and shadcn/ui (Base UI). Live at https://artisanconnect.co.za.

Each thing is written down once:

| What                      | Where                                                                         |
| ------------------------- | ----------------------------------------------------------------------------- |
| What the product does     | #111 on GitHub, then `docs/adr/`                                              |
| The words it uses         | `GLOSSARY.md`                                                                 |
| How code is judged        | `CODING_STANDARDS.md`                                                         |
| What agents need          | `AGENTS.md`                                                                   |
| Bindings and environments | `void.config.ts` / `void.lock.json` (targets in `cloudflare-environments.ts`) |
| Secrets                   | `env.ts` + `docs/local.env.example` → `.env`                                  |
| Colours, radius, and type | `src/styles.css`                                                              |
| Every word the app shows  | `src/web/copy.ts`                                                             |

## Setup

[Vite+](https://viteplus.dev) (`vp`) runs everything: it uses the Node in `.node-version` and the pnpm in `package.json`, and ships Vite, Vitest, Oxlint, and Oxfmt as one set, pinned in `pnpm-workspace.yaml`. `vp install` also sets up the pre-commit hook, which checks what is staged. `postinstall` runs `void prepare` for Void codegen.

```sh
curl -fsSL https://vite.plus | bash   # once per machine
vp install
cp docs/local.env.example .env        # then set BETTER_AUTH_SECRET and PAYMENTS_WEBHOOK_SECRET
vp run dev                            # applies local D1 migrations, then http://localhost:3000; mail at /dev/mail
```

Workers AI has no local simulation (`ai.remote: true` in `cloudflare-environments.ts`). Locally and in CI, `vp dev` / smoke need `CLOUDFLARE_API_TOKEN` (or `void cloudflare login`) so the remote AI proxy can start. The Content check still Holds everything its patterns pass for the Admin's Pre-check when inference is not required.

## Scripts

```sh
vp check                  # format, lint, and type check (vp check --fix to fix)
vp run check:tokens       # every colour and size is a token from src/styles.css
vp test                   # Vitest in the Workers runtime, on local D1 and R2
vp run test:smoke         # Playwright against the local app, in the installed Chrome
vp run db:generate        # a migration from src/domain/schema.ts
vp run deploy:staging     # void deploy to artisanconnect-staging
vp run deploy:production  # void deploy to artisanconnect-production (custom domain)
vp run admin:setup you@example.com [--env staging|production]   # the first Admin
```

CI (`.github/workflows/check.yml`) runs check, check:tokens, test, build, and test:smoke on every pull request and push to `main`, then deploys a push to `main` (see Deploying).

## Architecture

Every rule lives in `src/domain`, built from sections with exactly seven ports: D1, R2, Images, a clock, a content reader, a payment adapter, and a mailer (ADR 0017, ADR 0018).

- **Clocks** are rows in `due_clocks`; the every-minute cron runs the due ones, each once, however late.
- **Money** is append-only `ledger_entries`, written in one D1 batch per event.
- **Payments** use the fake adapter (`src/domain/fakes/payments.ts`) in every environment: no money moves at launch.
- **Sign-in** is better-auth inside the `accounts` section, never mounted as HTTP. Server functions check Turnstile and the `IP_LIMIT` rate limit before a command runs.
- **Admins** sign in with an Email code (ADR 0015); every decision and logged read goes to `audit_log` in the same batch.
- **Queues** are the Admin's eight, each item kind declared with `defineQueueItemKind` (`src/domain/queues.ts`).
- **Tells** are `notices` rows written with the event; their email goes after the commit, retried by the cron.

Tests drive the module through `test/support/harness.ts`: real local D1 and R2, with a fake clock, content reader, payment adapter, and mailer.

## Deploying

GitHub Actions deploys. Once `check` passes on a push to `main`, `deploy-staging` runs `vp run deploy:staging`, then `deploy-production` waits in the `production` environment until a reviewer approves it in the run (Actions → the run → Review deployments) and runs `vp run deploy:production` on the same commit. Each environment deploys one run at a time. Both jobs use the `CLOUDFLARE_API_TOKEN` secret and the `CLOUDFLARE_ACCOUNT_ID` variable.

Void does not support Wrangler named environments: `CLOUDFLARE_ENV=staging|production` selects the matching target in `cloudflare-environments.ts` / `void.config.ts`. Bindings and resource IDs live there and in `void.lock.json`.

Both environments are on the account in `void.config.ts`. The first deploy of an environment provisions its D1 and R2, so deploy before relying on remote data, set its secrets, then make its first Admin:

```sh
void cloudflare login
CLOUDFLARE_ENV=staging void deploy --platform cloudflare
CLOUDFLARE_ENV=staging void secret put BETTER_AUTH_SECRET   # and each server key in env.ts
vp run admin:setup you@example.com --env staging
```

## UI

shadcn/ui is set up as **base-nova** (`components.json`); its packages stay at the versions shadcn's components ask for, so recharts is pinned at the 3.8.0 its chart names. Add a component with `vpx shadcn@latest add <name>`; when its CLI cannot install dependencies, add them with `vp add <package>`. Forms are TanStack Form on shadcn's Field (`src/components/form.tsx`); pages load through route loaders and reload after each action.
