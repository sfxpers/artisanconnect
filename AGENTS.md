## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Checks and review

Every commit passes `nub run lint`, `fmt:check`, `typecheck`, `test`, and `test:smoke`; CI runs them on every pull request and every push to `main` (`.github/workflows/check.yml`). Review applies `CODING_STANDARDS.md`, which holds only judgement calls; a rule a check can enforce becomes a check.
