## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Cloud Agent

Run project scripts with `nub`. It uses the Node version pinned in `mise.toml`. The `node` binary earlier on `PATH` is the image Node and is a different version.

Boot applies local D1 migrations and serves the app at http://localhost:3000. When `.dev.vars` is missing, boot writes local random secrets and Turnstile's always-pass test key. Local dev keeps Workers AI off, so it does not need a Cloudflare login.
