# AGENTS.md

## Project rules for AI coding agents

This repository is the Hem-Listan app. Follow these rules for all code changes.

## Core principles

- Prefer small, focused changes.
- Do not mix unrelated fixes in the same PR.
- Do not change UI styling unless explicitly requested.
- Do not change Supabase schema unless explicitly requested.
- Do not change pricing, auth, sync, invite, or sharing behavior unless the task is specifically about that area.
- Preserve existing behavior unless the task explicitly asks for a behavior change.
- Prefer reuse over duplication. Search for existing helpers, hooks, utilities, components, and tests before creating new ones.
- Avoid parallel implementations of the same behavior under different names. If existing code is close, prefer a small extension or refactor when it stays within scope.
- Keep reuse practical. Do not force reuse when it would make the code harder to understand or expand the task beyond its intended scope.

## File size and structure

Keep files focused and small.

Guidelines:

- Prefer files under 400 lines.
- If a file approaches 400 lines, extract logic into a dedicated module, hook, or component.
- Files over 600 lines should generally be refactored before adding more logic.
- Avoid adding more unrelated logic to large files such as `App.tsx`, large modals, or basket/pricing orchestration files.
- Test files may be larger, but split them by area when they become hard to review.

Each file should have one clear responsibility.

Preferred structure:

- UI components in `src/components/...`
- Hooks in `src/hooks/...`
- Browser/localStorage helpers in `src/lib/...`
- Supabase/client logic in `src/lib/supabase...`
- Pricing matching logic in dedicated pricing modules
- Pricing diagnostics in dedicated diagnostics modules
- API orchestration separate from scoring/matching helpers

## App architecture

Avoid turning `App.tsx` into a catch-all file.

Do not add new major logic directly to `App.tsx` if it can reasonably live in:

- a hook
- a helper module
- a dedicated component
- a domain-specific service file

Examples of logic that should be extracted:

- auth/session handling
- local list storage
- deleted-list restore logic
- invite flow
- task actions
- meal actions
- list sync
- pricing diagnostics

## Pricing rules

Pricing is critical. Be conservative.

When changing pricing code:

- Do not loosen matching globally.
- Do not allow fallback logic to bypass normal ranking.
- Do not allow learning summaries to override hard mismatch rules.
- Do not change basket totals directly unless explicitly requested.
- Do not change cache identity unless explicitly requested.
- Do not change shopping-row identity unless explicitly requested.
- Keep provider search, candidate filtering, ranking, diagnostics, and learning separated where possible.

For pricing bugs:

- First determine whether the problem is provider search, candidate filtering, ranking, learning, caching, or UI display.
- Add diagnostics before broadening matching.
- Prefer narrow, test-covered fixes over broad heuristics.
- Reuse existing normalization, search-query, scoring, penalty, diagnostics, and quality-signal helpers before introducing new pricing heuristics.

## Supabase rules

When changing Supabase-related code:

- Do not change RLS, tables, migrations, or auth behavior unless explicitly requested.
- Migrations must be idempotent where possible.
- Client-side code must not require service-role privileges.
- Do not expose server-only diagnostics or internal learning tables directly to the client.

## PR expectations

Every PR should include:

- A clear motivation.
- A concise description of what changed.
- Testing performed.
- Any risks or known limitations.

Before opening a PR, run:

```bash
npm test
npm run lint
```

If tests or lint cannot be run, explain why in the PR body.

## Review expectations

When asked to review a PR, review the actual diff/code first.

Start with:

- blockers
- regressions
- risky behavior changes

End with a clear recommendation:

- Merge OK
- Do not merge
- Merge only after changes

## Non-goals unless explicitly requested

Do not add:

- new AI features
- broad redesigns
- styling rewrites
- unrelated cleanup
- large refactors mixed into bugfix PRs

Refactors should be separate PRs with no intended behavior change.
