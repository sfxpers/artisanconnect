# Coding standards

The judgement calls a reviewer checks. Anything mechanical is a check instead: oxlint (including the rule that pages and components import no domain rule), `scripts/check-tokens.mjs` (no colour or arbitrary value outside `src/styles.css`), oxfmt, `tsc`, the tests, and CI (`.github/workflows/check.yml`).

## Sources of truth

#111, then `docs/adr/`, then `GLOSSARY.md`, then the sub-issues. Code is never one. Name things with the glossary's terms and none of its _Avoid_ words. A change that contradicts an ADR, or a money, fee, or clock rule, waits for approval.

## Stack first

Use Cloudflare (Workers, D1, R2, Images, Workers AI, Turnstile, the Rate Limiting binding, Email Sending, Cron), TanStack (Start, Router, Form), shadcn, and Drizzle before writing code or adding a library. Custom code that stays carries one line saying why the stack cannot do it.

## Design

- shadcn first: a component shadcn has is added with its CLI and used as written; it changes only through tokens and its variants. The design is in `docs/review/111.md` §11.
- Copy lives in `src/web/copy.ts`, in the glossary's words.
- One primary action a screen; money as lines; a deadline as a date and a countdown; a loading, an empty, and an error state for every list.

## Shape

- Every rule lives in `src/domain`. A server function, the cron handler, and the webhook route only pass the request to it.
- A command takes the acting party first and returns the new state or a typed refusal. Permission checks live inside it.
- An abstraction earns its place by removing duplication in three or more places.
- Config states only what differs from a default.
- A write that depends on what a command read carries that condition into its batch (`WHERE state = …`), or a trigger guards it.

## Tests

- Drive public commands and queries, and assert what a party can observe: projections, refusals, Tells, emails, and money from the ledger.
- Never read tables or private functions, test a fake or a framework, or re-assert a type.
- Near-duplicates become one table-driven test.
- Smoke tests cover only sign-up, Hire, and Approval, plus a UI path that no domain test can reach.

## Commits

One concern per commit, and every check passes after each.
