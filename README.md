# ArtisanConnect

A marketplace for hiring verified Artisans in Cape Town: TanStack Start on Cloudflare Workers, with D1, R2, and shadcn/ui (Base UI). Live at https://artisanconnect.co.za.

Each thing is written down once:

| What                      | Where                            |
| ------------------------- | -------------------------------- |
| What the product does     | #111 on GitHub, then `docs/adr/` |
| The words it uses         | `GLOSSARY.md`                    |
| How code is judged        | `CODING_STANDARDS.md`            |
| What agents need          | `AGENTS.md`                      |
| Bindings and environments | `wrangler.jsonc`                 |
| Secrets                   | `.dev.vars.example`              |
| Colours, radius, and type | `src/styles.css`                 |
| Every word the app shows  | `src/web/copy.ts`                |

## Setup

[mise](https://mise.jdx.dev) installs the Node and [nub](https://nubjs.com) versions `mise.toml` pins; nub installs the rest. `postinstall` writes `worker-configuration.d.ts` from `wrangler.jsonc` (`nub run cf-typegen` after changing it).

```sh
mise install
nub install
cp .dev.vars.example .dev.vars   # then set BETTER_AUTH_SECRET and PAYMENTS_WEBHOOK_SECRET
nub run db:migrate:local
nub run dev                      # http://localhost:3000; mail at /dev/mail
```

Workers AI runs only remotely, so locally (`remoteBindings: false` in `vite.config.ts`) the Content check Holds everything its patterns pass for the Admin's Pre-check. After `nubx wrangler login`, set it to `true` for live inference.

## Scripts

```sh
nub run lint               # oxlint, then scripts/check-tokens.mjs
nub run fmt                # oxfmt (fmt:check in CI)
nub run typecheck
nub run test               # Vitest in the Workers runtime, on local D1 and R2
nub run test:smoke         # Playwright against the local app, in the installed Chrome
nub run db:generate        # a migration from src/domain/schema.ts
nub run deploy:staging     # migrate, build, and deploy (or deploy:production)
nub run admin:setup -- you@example.com [--env staging|production]   # the first Admin
```

CI (`.github/workflows/check.yml`) runs lint, fmt:check, typecheck, test, and test:smoke on every pull request and push to `main`.

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

Both environments are on the account in `wrangler.jsonc`. The first deploy of an environment provisions its D1 and R2, so deploy before migrating, set its secrets, then make its first Admin:

```sh
nubx wrangler login
CLOUDFLARE_ENV=staging nub run build && nubx wrangler deploy
nubx wrangler d1 migrations apply DB --env staging --remote
nubx wrangler secret put BETTER_AUTH_SECRET --env staging   # and each secret in .dev.vars.example
nub run admin:setup -- you@example.com --env staging
```

## UI

shadcn/ui is set up as **base-nova** (`components.json`). Add a component with `nubx -y shadcn@latest add <name>`; when its CLI cannot install dependencies with nub, add them with `nub add <package>`. Forms are TanStack Form on shadcn's Field (`src/components/form.tsx`); pages load through route loaders and reload after each action.
