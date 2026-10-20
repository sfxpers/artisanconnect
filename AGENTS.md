## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Checks and review

Every commit passes the checks CI runs (`README.md`, Scripts). Review applies `CODING_STANDARDS.md`, which holds only judgement calls; a rule a check can enforce becomes a check.

## Void

- This project uses [Void](https://void.cloud) with TanStack Start on Cloudflare Workers. Void owns resources, typed env, and deploy; TanStack owns routing and SSR.
- Use Void's CLI and typed APIs. Before working with Void, read the relevant Markdown docs in `node_modules/void/docs/`; start with `guide/quickstart.md` for setup, `integrations/frameworks/tanstack-start.md` for this stack, and `reference/cli.md` for commands.
