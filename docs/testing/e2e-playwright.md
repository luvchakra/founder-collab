# E2E: Playwright critical-path smoke suite

Status: adopted. Supersedes `TESTING_STRATEGY.md` §5's earlier "hold off on Playwright
until the shell/navigation layer stops churning" note — that churn (business-slug
routing, the FSM→Service and GST→Compliance URL renames) is done, which is the exact
point that note said to revisit it.

## What this is (and isn't)

A **critical-path smoke suite**, not full P0 screen coverage: login/signup, the
Executive Dashboard and sidebar navigation, and each of the five modules' own landing
page plus one or two of its most important screens. It exists to catch two kinds of
regression nothing else in this repo's test suite can:

1. **Crash-on-render bugs invisible to typecheck/lint/vitest.** This session's own
   history is the reason this suite exists at all: the CRM Sales Opportunities page (in
   its *default* Kanban view), the Compliance Reconciliation page, and the platform admin
   tool all crashed on every single load — a Server Component handing a Client Component
   either a plain closure wrapping a `"use server"` action instead of a bound reference,
   or an event handler attached directly to an element it rendered itself. Both compile
   clean, lint clean, and pass every vitest suite; only an actual browser render surfaces
   them. `e2e/support/assertions.ts#expectNoAppCrash` is the one-line guard every
   authenticated spec calls after navigating.
2. **The platform-wide mobile-card rule silently regressing.** CLAUDE.md's own rule 12
   (any table-of-rows page collapses to cards below `md`) has real history of drifting.
   `e2e/support/responsive.ts#expectResponsiveTableOrCards` checks both the desktop table
   and the mobile card list are the *correct* one for the current viewport — every
   authenticated spec runs at both a desktop and a real phone viewport
   (`playwright.config.ts`'s `desktop`/`mobile` projects) for exactly this reason, not as
   a fixed pair of dedicated mobile tests.

It deliberately does **not** attempt full coverage of every screen listed in
`docs/plan/`. Extend it the same way you'd extend any other test file — see "Adding a
spec" below — rather than treating this doc as the ceiling.

## Requirements

- A **real, reachable Supabase project** — the same one already configured via
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. This
  suite exercises real authorization end-to-end (CLAUDE.md: "use real authorization... do
  not fake security behavior with UI-only checks") — it has no mock/stub mode, and it
  will not run anywhere that can't reach that project (a fully network-isolated sandbox,
  for instance).
- A **real account** on that project, seeded with at least one business. Set:
  ```
  E2E_TEST_EMAIL=...
  E2E_TEST_PASSWORD=...
  ```
  in `apps/web/.env.local` (see `.env.example`). The suite signs in through the real
  `/login` form with these — never a seeded session or an API shortcut — so it can't stop
  catching an auth regression the way a faked session would.
- Optionally pin a specific business instead of "whichever one the test account sees
  first": `E2E_TEST_BUSINESS_SLUG=your-seed-business`. Most specs don't need this — see
  `e2e/support/business.ts#getTestBusinessSlug`, which discovers a slug from the sidebar
  at runtime so the suite isn't hard-coded to one environment's seed data.
- Browsers: `npx playwright install chromium` once per machine (standard Playwright
  browser management — this repo's own dev sandbox instead has a browser pre-baked at a
  nonstandard path with no network access to fetch the expected revision; if you ever hit
  that specific situation, `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome` in the environment
  points `playwright.config.ts` at it instead of downloading — not something a normal
  local/CI run needs).

## Running it

```bash
cd apps/web
npm run e2e             # headless, all projects
npm run e2e:ui          # Playwright's own interactive UI mode
npx playwright test authenticated/crm.spec.ts   # one file
npx playwright test --project=desktop           # one viewport
npm run e2e:report      # open the last HTML report
```

`playwright.config.ts`'s `webServer` starts `next dev` automatically against
`http://localhost:3100` unless `PLAYWRIGHT_BASE_URL` is already set (point that at a
running dev server, a Vercel preview, or staging to skip starting one here — the common
CI shape, and useful when you already have `next dev` running locally too).

## Structure

```
apps/web/e2e/
  auth.setup.ts              One real UI login; saves playwright/.auth/user.json
  unauthenticated/           Runs signed-out: landing page, login, signup, forgot-password
  authenticated/             Depends on auth.setup.ts; runs on both desktop + mobile projects
  support/
    assertions.ts            expectNoAppCrash()
    responsive.ts            expectResponsiveTableOrCards()
    business.ts               getTestBusinessSlug()
```

A file under `unauthenticated/` must never assume a signed-in session (its project
carries no `storageState`); a file under `authenticated/` should never itself attempt to
log in (that's `auth.setup.ts`'s only job) or it'll fight the shared, cached session.

## Adding a spec

1. Authenticated and business-scoped? Put it in `authenticated/`, get the slug via
   `getTestBusinessSlug(page)`, and call `expectNoAppCrash(page)` right after every
   `page.goto()` — the whole reason this suite exists is to catch exactly that failure
   mode, so skipping the check on a new page defeats the point.
2. Table-of-rows content? Call `expectResponsiveTableOrCards(page)` too; it reads the
   current project's viewport itself, so the same call is correct on both `desktop` and
   `mobile`.
3. A brand-new module page, not yet in `dashboard-nav.spec.ts`'s `MODULE_LANDING_PAGES`
   loop? Add it there so the crash-regression net covers it for free.
4. Prefer `getByRole`/`getByLabel` over CSS selectors (this repo's shadcn/Radix
   components already expose real accessible roles and labels) — a selector that only
   matches by class name breaks the moment a component's styling changes, which is
   exactly the kind of churn this shell has had.

## What this suite is not a substitute for

- `docs/testing/TESTING_STRATEGY.md`'s RLS/tenant-isolation scripts
  (`scripts/test-*-rls.mjs`) — those remain the authoritative tenant-isolation coverage;
  this suite drives the UI as one signed-in user in one account and never attempts to
  prove cross-tenant isolation itself.
- Each module's own vitest suite (`packages/module-*/src/**/*.test.ts`) — business-logic
  unit coverage stays there; this suite only proves a page renders and a flow completes,
  not that every edge case of the underlying calculation is correct.
