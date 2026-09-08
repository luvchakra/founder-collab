# Test execution — 2026-09-08

First execution pass of `docs/testing/test-cases/*.md` (landed into the repo in this
same commit, from an uploaded review document — see each file's own content for the
case definitions) against `main` at commit `f6a84cb`. Scope: the P0 cases per module
that are checkable without a browser/e2e framework (still an explicit, documented gap —
see `TESTING_STRATEGY.md` §5), using this repo's own established rigor: the full
`npm run test:db` suite as a baseline, plus direct source-code tracing and, where a case
needed it, live SQL against the dev Supabase project. Cases needing a real browser
session, real outbound email, or wall-clock time travel are marked **Not verified** below
and left for the shell/e2e framework once it exists, or for manual QA.

**Update, same day:** a second uploaded review added `docs/testing/test-cases/menu-smoke.md`
+ `apps/web/tests/menu-routes.test.ts` (a real automated test, now landed and wired into
`npm test --workspaces`) and reported 3 confirmed-failing menu/navigation items,
including one this doc's own first pass had wrongly marked passing. Findings 5 and 6
below, and the correction to TC-SHELL-002 in `## P0 cases executed`, are from that
second pass — independently re-verified against this repo's own source and the dev
database, not taken on trust.

## Baseline

- `npm run test:db` (all 21 chained scripts): **green**, exit 0. (Ran as the `postgres`
  OS user — this container's local Postgres peer-auth only maps to that role; `root`,
  the default OS user, has no matching Postgres role. Not a code issue.)
- `npm run lint:boundaries`: 655 files, no violations.
- `npm run lint:migrations`: 43 files, no violations.
- `node --test scripts/lint-import-boundaries.test.mjs` (TC-SHELL-009): 6/6 pass,
  including the deliberately-failing fixture case — the lint genuinely catches a real
  violation, not just passing on the clean repo.
- `packages/module-registry` unit tests: 9/9 pass.

## Findings — real gaps, not covered by the automated suite

These four came directly out of tracing the P0 cases below to their actual
implementation. None is caught by `test:db` (which tests RLS/tenancy/workflow
correctness, not "is the app-layer guard actually wired up" or "is this secret actually
encrypted") — that's exactly the gap `TESTING_STRATEGY.md` says this layer of testing
exists to close.

### 1. `core.license_events`/ADR-9 grace period never actually expires (P0) — TC-CORE-003
`packages/core/src/licensing/lifecycle.ts`'s `expireGracePeriods()` correctly flips every
`grace` license past its `grace_ends_at` to `expired` — but nothing ever calls it.
`apps/web/app/api/cron/` has exactly two routes (`drain-events`, `send-reminders`), and
`vercel.json`'s `crons` array lists only those same two. There is no
`api/cron/expire-licenses`-equivalent, anywhere. Practical effect: a cancelled license
sits in `grace` (read access, no write) forever in production — ADR-9's second phase
("then access denied") never fires on its own. `core.has_module()` would keep returning
`true` past 30 days since it only checks `status in ('active','grace')`, with nothing
ever moving the row out of `grace`.

### 2. Cancelling a job never releases its reserved inventory (P0) — TC-FSM-011
`packages/module-fsm/src/lib/inventory-integration/mutations.ts`'s `reserveJobParts()` is
called from `markJobScheduled()` and the schedule-event path
(`lib/events/mutations.ts`); `consumeJobParts()` (which itself calls `releaseStock()`
then `consumeStock()`) is called from `completeJob()`. `cancelJob()`
(`lib/jobs/mutations.ts:108`) transitions a job out of `unscheduled`/`scheduled`/
`in_progress`/`on_hold` straight to `cancelled` and calls neither — traced every call site
of `reserveJobParts`/`consumeJobParts`/`releaseStock` in `module-fsm` to confirm there is
no third call site. `inventory.stock_levels.reserved` (a real, separate tracked column —
confirmed in `module-inventory`'s `contract/index.ts`'s `getAvailability()`) stays
incremented permanently for any job cancelled after being scheduled, understating real
available stock for that item/warehouse indefinitely. This is the exact scenario
TC-FSM-011 calls out by name ("not left reserved-forever if the job is cancelled instead
of completed (check that path too)").

### 3. GST GSP credentials are plaintext, not encrypted like BYOK keys (P0, security) — TC-GST-001
`supabase/migrations/20260907150000_gst_credentials_schema.sql` stores
`gst.eway_bill_credentials`/`gst.einvoice_credentials`'s `gsp_password`/`client_secret`
columns as plain `text`, protected only by access control (no `SELECT` grant to
`authenticated` at all — only `service_role` can read them). The migration's own comment
says this was "kept verbatim from upstream" and flags it as "the same class of risk as
the reveal-service-role-key finding." Contrast `discovery.ai_provider_credentials`
(BYOK), whose comment states plainly: `encrypted_api_key` is application-level
AES-256-GCM ciphertext (`packages/core/src/crypto/api-key.ts`), specifically *because*
"RLS does not by itself protect a column from application code." TC-GST-001's expected
result ("encrypted at rest — same standard as BYOK keys — not plaintext") does not hold:
GST relies on RLS/grants alone, exactly the weaker guarantee BYOK's own migration comment
says isn't sufficient. Any future migration or admin-client bug that adds a stray
`SELECT` grant/policy on either GST credentials table would expose real GSP passwords
and OAuth client secrets in the clear.

### 4. `requireModule()`, named by `CLAUDE.md` as one of licensing's four required
   enforcement layers, does not exist anywhere in the codebase (P1, architecture-doc vs.
   reality gap) — TC-CORE-001
`CLAUDE.md`'s architecture section: "Enforcement is four layers, all four required: RLS
..., route guard in `proxy.ts` ..., `requireModule()` in server actions (defense in
depth), and UI ... ". Confirmed present: RLS (thoroughly, throughout `test:db`), the
route guard (real — `packages/core/src/db/middleware.ts`'s `isUnlicensedModuleRoute()`,
called from `updateSession()`, called from `proxy.ts`), and the UI/registry layer. No
function named `requireModule()` (or any equivalent) exists anywhere — grepped the whole
repo. The one place that mentions it by name
(`module-fsm/src/lib/work-requests/mutations.ts`'s own comment) explains it had to
special-case around the fact that the helper it wanted to call doesn't exist for its
no-session case, implying the author expected it to exist elsewhere and it doesn't. Each
module's own `contract/index.ts` has a *private*, per-module `requireLicensed()` used only
for mechanism-2 cross-module calls (correctly implements ADR-10's `MODULE_NOT_LICENSED`
degraded mode there) — but a plain in-module write (create an opportunity, a ticket, a
product) calls no license check of its own before running its query; RLS is the only
thing standing between an unlicensed/grace-period business and a write if the UI's
"don't render the control" layer were ever bypassed. Grepped every `mutations.ts` in
`module-fsm` and `module-crm`: only 4 of `module-fsm`'s files reference licensing at all,
all 4 for cross-module contract calls, none for the module's own in-schema writes; zero
of `module-crm`'s do. Not a live security hole (RLS is authoritative and does reject the
write), but a real gap against the architecture doc's own "all four required" framing —
worth either building the shared helper or correcting the doc to describe what's
actually enforced.

### 5. Sidebar shows every module regardless of license — corrects this doc's own earlier "Pass" verdict (P0) — TC-SHELL-002, TC-MENU-LIC-001/002 — **Fixed 2026-09-08**
Fix: `packages/core/src/licensing/queries.ts`'s new `listLicensedModuleKeysByBusiness()`
(one batched, RLS-scoped query for every business on the account) is now called from
`apps/web/app/(dashboard)/layout.tsx` and threaded into `DashboardChrome`, which filters
`modules` by the active business's active-or-grace licenses (falling back to the first
business when none is active yet, matching `AppSidebar`'s own existing
`effectiveBusinessId` fallback) before passing them to `DashboardShell`/`AppSidebar`/
`module-selector.tsx`. `scripts/test-core-licensed-modules-by-business.mjs` (new, in
`test:db`) covers tenant isolation on the batched query itself. This fixes the
*visibility* half only — `proxy.ts`'s route guard still returns a bare 404 for direct/
typed access to an unlicensed route, which is the separate "informative not-licensed
page" requirement below, still open.
A second uploaded review (`docs/testing/test-cases/menu-smoke.md`, landed same day as
this correction) checked what this doc's first pass didn't: not just *how* nav items
render once a module section is shown, but whether the *set of modules shown at all* is
filtered by license. It isn't. Independently re-verified, not just taken on trust:
`apps/web/app/(dashboard)/layout.tsx` passes the raw `moduleRegistry` straight through
(`modules={moduleRegistry}`, no license query anywhere in that file) into
`DashboardChrome` → `DashboardShell` → `AppSidebar`/`module-selector.tsx`; grepped the
whole shell component tree and `apps/web/components/dashboard/*.tsx` for
`has_module`/licensing logic — none exists, only a comment in `module-selector.tsx`
describing intent ("carved out from the licensed modules in between") that the code
never actually does. Confirmed against real dev-DB data (business "Aroma Adorn",
`6a68ff2b-e7b5-4ee1-9c06-7f05cd66c776`, licensed for only `discovery`/`fsm`): the sidebar
would show all 5 modules regardless. This is the most likely explanation for a
previously-reported "CRM and GST menus lead to page not found" symptom — clicking into
an unlicensed module reaches a route with undefined behavior instead of a clean block,
since (also re-confirmed) `proxy.ts` still has no license logic of its own and
`crm/page.tsx`/`gst/*/page.tsx` call only `getBusiness()`, never a license check. RLS is
the only one of `CLAUDE.md`'s 4 enforcement layers actually protecting `crm`/`gst` today.
**This doc's first pass (`## P0 cases executed, no gap found` below) wrongly marked
TC-SHELL-002 "Pass" — it only checked TC-SHELL-001 (nav items sourced from the registry,
which is true) and incorrectly extended that to entitlement filtering, which it never
checked. TC-SHELL-001 stays Pass; TC-SHELL-002 is corrected to Fail here.**

### 6. Two `fsm` nav items 404 — no route exists on disk (P0) — TC-MENU-FSM-001/002
Confirmed by filesystem check (`ls apps/web/app/(dashboard)/dashboard/businesses/
[businessId]/fsm/`: `invoices, jobs, my-day, opportunities, reports, schedule, settings`
— no `page.tsx` at the `fsm` root and no `customers/` folder at all), and by the new
automated test `apps/web/tests/menu-routes.test.ts` (landed same commit; 29 passed, 2
expected-fail for exactly these two). `fsm`'s root nav item ("Dashboard," `slug: ""`) and
its "Customers" item both point at routes that were never built, despite the registry
declaring them — the module's own root route, its single highest-visibility nav item,
404s.

## P0 cases executed, no gap found

- **TC-CORE-005** (`requirePermission()` blocks a server action) — real, exists
  (`packages/core/src/rbac/require-permission.ts`), used in 30 files (7 `packages/`, 23
  `apps/`). Pass.
- **TC-CORE-007** (`next_number()` concurrency) — `scripts/test-core-number-sequences.mjs`
  (in `test:db`) issues 20 concurrent calls and asserts no duplicates. Pass.
- **TC-CORE-008** (document/lines totals reconcile) — covered by this session's own
  earlier compat-view tax-field fix + its live-verified test additions in
  `test-inventory-compat-views.mjs`; `core.recompute_document_totals()` traced and
  confirmed authoritative from lines. Pass.
- **TC-CORE-009** (payment allocation/aging) — `scripts/test-core-payments-rls.mjs` (in
  `test:db`). Pass.
- **TC-CORE-011** (domain events drain exactly once) — `scripts/test-core-domain-events.mjs`
  (in `test:db`) explicitly asserts retry/backoff, a poison-message permanent failure, a
  parked-event (unlicensed module) case, and "replaying with nothing parked returns 0."
  Pass.
- **TC-FSM-012** (low-stock/parts integration degrades without `inventory` licensed) —
  both `reserveJobParts()`/`consumeJobParts()` check `hasModule(businessId, "inventory")`
  first and return silently if false. Pass.
- **TC-INVENTORY-010** / **TC-GST-004** (inventory never imports `module-gst` internals) —
  grepped `module-inventory/src` for any `module-gst` import outside `contract/`: none.
  `lint:boundaries` (655 files) confirms platform-wide. Pass.
- **TC-SHELL-001** (sidebar's nav *items* sourced from `module-registry`, never
  hardcoded) — code-verified against this session's own earlier sidebar-nav commit
  (`packages/core/src/components/shell/app-sidebar.tsx`'s `ModuleContent` driven by
  `navGroups`/`routePrefix` props, no hardcoded nav consts remain). Pass. **TC-SHELL-002
  (which module *sections* appear at all, filtered by entitlements) is a separate claim
  this doc originally lumped in here without separately checking — see Finding 5 above,
  corrected to Fail.**
- **TC-SHELL-009** (boundary lint fixture) — see Baseline above. Pass.
- **TC-CRM-004**, **TC-GST-005** — already continuously exercised by `test-crm-rls.mjs`
  and the `requireLicensed()`/`MODULE_NOT_LICENSED` pattern in every `module-gst`
  contract function. Pass.

## Not verified this pass (needs a browser/e2e framework, real email, or time travel)

Per `TESTING_STRATEGY.md` §5's own standing gap (no Playwright yet, deliberately, until
the shell stops churning): TC-FSM-002/003 (public token pages), TC-FSM-007 (reminder
cron + real Resend send), TC-FSM-009 (customer-center contact form routing),
TC-DISCOVERY-003/004/005/006/007/010/011/012 (live AI-provider calls), TC-SHELL-003/005/
007 (onboarding flow, alert bell/chat widget, settings pages), TC-CORE-003's own
time-manipulation half (confirmed via code above instead — see Finding 1), TC-CORE-004's
UI-visible half (the domain-events replay mechanism itself is automated-tested; the
"user sees full access restored" half is a UI check). These remain open until either a
browser-driven test framework exists or someone runs them manually.
