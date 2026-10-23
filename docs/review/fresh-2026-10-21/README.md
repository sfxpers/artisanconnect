# Evidence for fresh-2026-10-21 review

Baseline `b47e2cfdb9bb074e6e200ce3f063d2a63b93f7ea`, branch `review/fresh-2026-10-21`. Captured 2026-10-21. All commands ran in a disposable `git archive` checkout (`git init` + `git add -A`, `node_modules` linked to installed dependencies, `void prepare` local codegen). No `.env` copied; no remote or production resource touched; database probes only touched scratch local databases created inside disposable checkouts. Raw unabridged collection: `/Users/sfx/phase1-evidence/` (not part of this repository).

## Command logs (ANSI-stripped; exit code in `.exit`)

- `check.log` — `vp check`, exit 0
- `check-tokens.log` — `vp run check:tokens`, exit 0
- `test.log` — `vp test run`, exit 0 (903 tests, 35 files)
- `test-tooling.log` — `vp run test:tooling`, exit 0
- `build.log` — `vp build`, exit 0
- `fresh-review-export.log` — lead-authored reproduction `vp test run test/fresh-review-export.test.ts`, exit 1 (2 expected failures); source preserved verbatim in `fresh-review-export.test.ts.src`, not a committed test

## Migration compatibility logs

- `wrangler-migrate.log` — existing `vp run db:migrate:local` on fresh scratch DB, exit 0 (40 migrations)
- `void-migrate-after-wrangler.log` — `WORKER_TARGET=local vp exec void db migrate` on that Wrangler-initialized DB, exit 1 ("no Void migration history", lists `d1_migrations`)
- `void-db-migrate-1.log` / `void-db-migrate-2.log` — same command twice on an empty scratch DB: applied 40 migrations, then "All migrations are up to date", exit 0

## Frozen inputs

- `dependency-snapshot.json`, `dependency-table.md` — generated frozen dependency metadata (37 package/tool rows)
- `github-maintenance.json` — GitHub repo maintenance fields per package (raw `gh api repos/...` fields)
- `spec-111.source.txt`, `spec-111.json` — verbatim governing spec snapshot (governing issue #111)
- `coverage-inventory.json` — verified composite coverage-row ID inventory
- `skills-symlinks-and-inventory.txt`, `skills-diff-summary.txt`, `skills-upstream-head.txt` — agent-skills capture vs upstream `mattpocock/skills@5beb35b`
