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
nub run dev        # Vite + Workers runtime on http://localhost:3000
nub run build      # production client + worker
nub run preview    # preview the production build locally
nub run deploy     # build and wrangler deploy
nub run typecheck
nub run lint
nub run fmt
nub run fmt:check
```

## Cloudflare

Bindings live in `wrangler.jsonc` and are available in server code via `import { env } from "cloudflare:workers"`.

| Binding      | Resource                          |
| ------------ | --------------------------------- |
| `DB`         | D1 (`artisanconnect`)                    |
| `R2`         | R2 bucket (`artisanconnect`)             |
| `AI`         | Workers AI                        |
| `QUEUE`      | Queue producer (`artisanconnect`)        |
| `ASSETS`     | Workers Assets (Vite injects dir) |
| `SEND_EMAIL` | Email Routing send binding        |
| `ANALYTICS`  | Analytics Engine dataset          |
| `APP_NAME`   | env var                           |

Inbound email, queue consumption, and cron are stubbed in `src/server.ts`.

Custom domain: uncomment `routes` in `wrangler.jsonc` and replace the hostname.

```sh
nubx wrangler login
nubx wrangler d1 migrations create DB <name>
nubx wrangler d1 migrations apply DB --local
nubx wrangler deploy
```

Workers AI has no local simulation. `vite.config.ts` sets `remoteBindings: false` so `nub run dev` works offline. After `nubx wrangler login`, set `remoteBindings: true` (and `remote: true` on the `AI` binding) for live inference.

Email Routing destination addresses and Analytics Engine queries are configured in the Cloudflare dashboard.

## UI

shadcn/ui is initialized as **base-nova** (Base UI, not Radix). Paths in `components.json` match this Start app (`src/styles.css`, `@/components`).

```sh
nubx -y shadcn@latest add card
```

If the CLI tries to install dependencies with another package manager, add them here instead:

```sh
nub add <package>
```

TanStack Query, Form, and Table are not wired yet — add them when a route needs them:

```sh
nub add @tanstack/react-query @tanstack/react-form @tanstack/react-table
```
