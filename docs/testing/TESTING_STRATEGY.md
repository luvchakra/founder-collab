# Testing Strategy

Status: adopted process. Operationalizes `CLAUDE.md`'s Development Principle #9
("Every feature has tests; tenant-isolation tests are mandatory for anything touching
workspace- or business-scoped data, license-gating tests for anything touching a
licensed module's tables") — that principle already exists in this repo's
constitution; this doc is the concrete mechanism for following it, not a new rule.

## 0. Running one module's tests on demand

`npm run test:db` runs every module's DB/RLS scripts in one long chain — useful for CI,
too slow to reach for while working on a single module. `scripts/test-module.mjs`
scopes that down:

```
node scripts/test-module.mjs <core|discovery|inventory|fsm|crm|gst|all>
# or
npm run test:module -- <module>
```

Runs, in order: (1) that module's own package vitest suite (`npm run test --workspace
<pkg>`, no database involved), then (2) its `scripts/test-<module>-*.mjs` DB/RLS and
workflow scripts against a throwaway Postgres database. Stops at the first failing
script (same fail-fast behavior as the `test:db` chain) and exits non-zero. A workflow
script a module doesn't have yet is skipped, not a failure, so this never blocks on
coverage still being built out.

From inside Claude Code, `/test-module <module>` runs the same thing and reports
pass/fail with the actual failing script's output, not just a status line.

## 1. What already exists (don't duplicate it)

This repo already has real, running automated tests for the layer that matters most
for a multi-tenant, multi-licensed platform:

- `scripts/lib/rls-test-harness.mjs` — shared setup/teardown against a throwaway
  Postgres database with the full migration timeline applied.
- `scripts/test-{core,discovery,inventory,fsm,crm,gst}-*-rls.mjs` — per-schema
  tenant + license isolation tests, chained in `npm run test:db`.
- `scripts/test-inventory-procedural.mjs`, `test-inventory-compat-views.mjs`,
  `test-discovery-party-backfill.mjs`, `test-core-domain-events.mjs`,
  `test-core-audit-log.mjs`, `test-sales-returns-workflow.mjs` — a handful of
  scripts that go beyond pure RLS into procedural/workflow correctness.
- `scripts/lint-import-boundaries.mjs` (+ its own `.test.mjs`) and
  `lint-migration-schema.mjs` — architecture-rule enforcement, not feature tests,
  but part of the same "tests all green" gate in the workflow section of `CLAUDE.md`.
- `packages/module-registry/src/index.test.ts` — the one package-level unit test.

**This doc does not re-document those.** `INDEX.md` lists them so coverage is
visible in one place, but their content lives in the scripts themselves.

## 2. The actual gap

RLS/tenancy/license isolation is well covered. **Feature-level business logic and
workflow correctness is not** — e.g. no test (automated or documented) currently
answers "does approving a sales return actually create a correct credit note," "does
license cancellation's 30-day grace period actually degrade to read-only and then to
denied on schedule," "does the FSM→inventory parts-reservation handoff actually
decrement stock." That's what this pass adds, as `docs/testing/test-cases/<module>.md`.

## 3. Test case format

```markdown
### TC-<MODULE>-<NUMBER>: <short title>
**Feature:** <what this verifies>
**Priority:** P0 (blocks release) / P1 (should pass) / P2 (nice to catch)
**Story:** <the backlog story ID this traces to, e.g. F-8, SP-7d, D-6, C-4>
**Preconditions:** <state required>
**Steps:** 1. ... 2. ...
**Expected result:** <exact observable outcome>
**Covers:** <package/path this exercises>
```

Numbering is sequential per module, never reused.

## 4. Keeping this current (the part that matters)

1. **Definition of Done, extended.** `CLAUDE.md`'s own workflow section already
   requires "tests all green" before a story is finished. Add one line to that same
   checklist: *and `docs/testing/test-cases/<module>.md` + `INDEX.md` reflect the
   story just completed.* This is the same document, not a parallel process — a
   second testing doc nobody reads while `CLAUDE.md` says something else is how this
   drifts.
2. **A changed story updates its existing cases, not just adds new ones** — e.g. if
   `06-DECISIONS-LOCKED.md`-style trims change what SP-3 actually does, the SP-3 test
   cases move/update in the same commit, matching how `docs/plan/`'s own numbered
   docs already handle supersession ("where a numbered doc and a later one disagree,
   the later document wins" — apply the same rule here).
3. **`INDEX.md` is the single source of truth for coverage state** across both kinds
   (script-automated and documented). Any PR touching a module's test-case file or
   adding a `scripts/test-*.mjs` updates that module's row in the same commit.
4. **New modules (`crm`, `gst` moving past skeleton) get a row and a file the moment
   their first real story lands** — not retroactively once someone notices the gap.

## 5. Gaps to close, in order

- No workflow-level automated tests outside the handful listed in §1 — e.g. nothing
  automates "generate invoice → send → record payment → balance reaches zero"
  end-to-end. `test-sales-returns-workflow.mjs` is the one example of this pattern in
  the repo; more modules should get an equivalent once their core RLS layer is stable.
- No e2e/UI test framework. Given the pace of UI changes visible in the git history
  (sidebar rebuilt multiple times, stage tabs rebuilt multiple times), hold off on
  Playwright until the shell/navigation layer stops churning — same reasoning as
  `co-founder-ai`'s own testing doc reached before the port.
- License lifecycle (`core.license_events`, 30-day grace, reactivation replay) is
  architecturally central (ADR-9) but only has RLS-level coverage today
  (`test-core-*` scripts don't appear to include a dedicated license-lifecycle
  script) — see `TC-CORE` cases below; promote the P0 ones to a real
  `scripts/test-license-lifecycle.mjs` next.
