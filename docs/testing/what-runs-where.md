# What runs where

Pull requests get fast checks only, so CI finishes in a minute or two and merging stays
cheap. The slow end-to-end suite runs every night instead, and before a risky merge you run
the affected specs on your own machine. Since 2026-10-16, replacing the earlier "e2e on a
labelled PR" rule.

| When | Workflow | What runs | Typical time |
|---|---|---|---|
| Pull request | `ci.yml` | Parallel jobs: typecheck · ESLint on the changed files · unit tests related to the changed files · dependency audit · the repo's own lints and script tests. Also the DB/RLS scripts for a migrated area, and `next build` when app code changed. | ~1–2 min |
| Pull request that changes dependencies, TS/test/lint/build config or CI | `ci.yml` | As above, with **every** unit test and the **whole** lint. A CI change also runs every DB test and the build. | ~2–3 min |
| Push to `main` (a merge) | `ci.yml` | The same jobs with every unit test and the whole lint. No E2E. | ~2–3 min |
| Manual (Actions → CI → Run workflow) | `ci.yml` | Everything in `ci.yml`, in full. | ~3 min |
| Nightly, 03:00 IST | `e2e-nightly.yml` | The full Playwright suite (security, multi-user, signed-out, desktop, mobile) against a fresh build and a fresh local Supabase stack. | ~9 min (~5 min of tests) |
| Manual (Actions → Nightly E2E → Run workflow) | `e2e-nightly.yml` | The same, on any branch. The optional **specs** input takes space-separated paths relative to `apps/web`, such as `e2e/security/storage.spec.ts`. | |
| Your machine | `npm run e2e:local -- <specs>` | Chosen specs against a local production build and a fresh local stack (needs Docker). | |

## Why each piece is where it is

- **Typecheck, lint and unit tests on every PR.** They're cheap and catch most mistakes.
  `scripts/ci-affected.mjs` narrows them to what the change touches:
  - `vitest --changed <base>` runs the tests whose imports reach a changed file, so a
    change in `packages/core` still runs the `apps/web` tests that use it.
  - `scripts/lint-changed.mjs` lints the changed JS/TS files under `apps/web`, the only
    workspace with an ESLint config.
  - A change to `package.json`, the lockfile, a `tsconfig`, the vitest, ESLint, Next,
    PostCSS or Playwright config, or CI itself runs everything instead. Those can change
    any file's result, and import-following can't see that.
- **Full unit tests and the whole lint on `main`.** This catches anything the narrowing
  missed, on the commit that deploys. A red `main` opens or comments on the issue
  "CI failing on main".
- **DB/RLS tests per migrated area** (`scripts/run-db-tests.mjs`). Tenant isolation and
  license gating are non-negotiable (CLAUDE.md), and a migration's own area takes
  seconds.
- **The build when app code changed.** With its cache it takes about 50 s, runs in
  parallel, and catches a broken build before it costs a Vercel deployment.
- **No E2E on PRs or on `main`.** The suite needs a whole Supabase stack, a browser and a
  build, which is minutes of setup for about 5 minutes of tests. It runs nightly, and by
  hand when a change is risky.
- **Secret scanning** isn't set up in this repo's CI. GitHub's own secret scanning, where
  it's enabled on the repository, covers pushes.

## The nightly run

- **Fresh every time.** It builds the app and starts its own throwaway Supabase stack with
  the whole migration timeline (`scripts/start-local-supabase.sh`). It never uses the
  hosted project, which also serves production. `playwright.config.ts` refuses to start
  against production (`e2e/support/target.ts`), and refuses any other hosted target unless
  `E2E_REMOTE_IS_NOT_PRODUCTION=1`.
- **Repeatable.** Nothing survives from one run to the next. A run killed halfway can't
  leave data or a changed setting (such as a licence status a spec flips) behind for the
  next one. Within a run, fixtures are named with the `e2e-qa` prefix, removed before
  seeding and removed again after the last spec (`e2e/support/tenants.ts`). Real accounts
  are never listed or touched.
- **Time budget.** There is one part today. Playwright's `--global-timeout` (25 minutes)
  stops it cleanly: tests not started by then are reported as *not run*, and every report
  is still written. If the suite outgrows the budget, split it into parts using the
  "slowest spec files" table in the run summary, with the slowest files in parts of their
  own, balanced by time rather than file count.
- **Retries.** Each test gets one retry. A test that passes only on the retry is counted
  as **flaky**, not passed, and needs a root cause.
- **Results.** `scripts/e2e-summary.mjs` writes passed / failed / flaky / skipped /
  not run and the slowest spec files to the run summary. The run fails when anything
  failed or didn't run. The HTML report, traces and the app log are always uploaded as
  an artifact, kept 14 days.
- **Alerts.** A failed or flaky scheduled run opens the issue "Nightly E2E failing", or
  comments on it if it's already open.

## Rules

- A red nightly is fixed before other work merges. Find the root cause; "flaky" is not one.
- Never skip, disable or delete a test to make CI green.
- Before merging something risky (sign-in, permissions, database migrations, payments, a
  new cross-feature flow), run the affected specs. Use `npm run e2e:local -- <specs>`, or
  run Nightly E2E by hand on the branch with those specs.

## Running specs locally

```
npm run e2e:local -- e2e/security/rbac-licensing.spec.ts e2e/multi-user/http-routes.spec.ts
npm run e2e:local            # the whole suite
```

This needs Docker running and `npx playwright install chromium` once. The script:

1. Moves `apps/web/.env.local` to `apps/web/.env.before-e2e.local`.
2. Starts a fresh local stack.
3. Builds the app and serves it on :3100.
4. Runs the specs.
5. Puts your env file back and stops the stack, however the run ends.

Set `E2E_KEEP_STACK=1` to leave the stack running afterwards, and `E2E_KEEP_FIXTURES=1` to
keep the seeded accounts for debugging. To open the report afterwards, run
`npm run e2e:report -w apps/web`.
