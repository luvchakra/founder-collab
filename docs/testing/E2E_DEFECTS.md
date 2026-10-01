# E2E Defects

Found during the 2026-10-01 end-to-end validation ([E2E_TEST_PLAN.md](E2E_TEST_PLAN.md)).
Severity per the brief: P0 critical (tenant leak, auth/authz/licence bypass), P1 high (core
workflow broken / severe regression), P2 medium (partial failure, wrong validation, broken
secondary feature), P3 low (cosmetic, minor UX). Severity is not inflated: where impact is
bounded, the entry says why.

| ID | Sev | Module | Summary | Status |
|---|---|---|---|---|
| E2E-DEF-001 | P1 | Finance / CI | Tax-rule version uniqueness didn't hold for national rules; kept `test:db` (and the CI build) red on `main` | **Fixed** |
| E2E-DEF-002 | **P0** | Finance | `gst.account_balances` exposed every tenant's chart of accounts and balances to any signed-in user | **Fixed** (live on dev) |
| E2E-DEF-003 | P2 | Billing | Anonymous calls to two billing endpoints crashed with 500 instead of 401 | **Fixed** |
| E2E-DEF-004 | P2 | Platform admin | `/platform/compliance` (compliance registry) 404'd for every superadmin | **Fixed** |
| E2E-DEF-005 | P2 | Discovery AI | Five prompts didn't fully fence external text (import files, emailed replies, crawled pages) | **Fixed** |
| E2E-DEF-006 | P3 | Service | Jobs board column counts overlapped the next column's label | **Fixed** |
| E2E-DEF-007 | P3 | Service | Jobs table view had no mobile card layout (CLAUDE.md rule 12) | **Fixed** |
| E2E-DEF-008 | P2 | Business / env | Business logo upload unusable on dev: migration never applied; file input unlabelled | **Fixed** (migration applied to dev; label added) |
| E2E-DEF-009 | P2 | Shell | Sidebar hydration failure on Service/CRM/admin/billing pages; Service & CRM sections never opened from the URL | **Fixed** |
| E2E-DEF-010 | P3 | Core data | Database accepts blank party (customer/supplier) names | **Open** |
| E2E-DEF-011 | P2 | Session / server actions | A revoked session makes server actions fail with a raw `42501` → "Something went wrong" instead of "please sign in again"; the test-suite trigger (shared identity signed out globally) is fixed | **Test cause fixed; product follow-up open** |
| E2E-DEF-012 | P2 | CRM | Two simultaneous first visits to Opportunities crashed one of them (duplicate default stages) | **Fixed** |
| E2E-DEF-013 | **P0** | Core / env | Audit-log forgery (any user could write into any business's audit log as anyone) was still live on the dev database: its fix was merged to `main` but the migration was never applied | **Fixed** (migration applied to dev; regression in SEC-RPC) |
| E2E-OBS-01 | P3 | All | Not-found pages are served with HTTP 200 (soft 404) | Open (observation) |
| E2E-OBS-02 | P3 | Service | `/service/dashboard` 404s; every other module has `/<module>/dashboard` | Open (observation) |
| E2E-OBS-03 | P3 | Storage | No bucket sets a size limit or MIME allow-list; attachment reads are membership-scoped, not module/permission-scoped | Open (observation) |
| E2E-OBS-04 | P3 | Exports | A foreign business slug answers 403 `MODULE_NOT_LICENSED` vs 403 `forbidden` depending on the *other* tenant's licence -- a 1-bit oracle about another business | Open (observation) |
| E2E-OBS-05 | P3 | Cron / webhooks | Shared secrets compared with `!==` (not constant-time) | Resolved on `main` (SEC-3) |

---

### E2E-DEF-001 -- tax-rule versions not unique for national rules (P1)
- **Module:** Finance (`gst.tax_rules`), CI.
- **Steps:** `npm run test:db` → `scripts/test-gst-tax-rules-rls.mjs` inserts a second
  `version = 2` row for `('IN', NULL jurisdiction, 'GST', 'GST_STANDARD_RATE')`.
- **Expected:** rejected by `unique (country, regime, jurisdiction, rule_key, version)`.
- **Actual:** accepted -- Postgres treats `NULL` jurisdictions as distinct. The as-of lookup
  (`order by version desc limit 1`) could then return either of two rates. Because the
  `test:db` chain is fail-fast, every later script **and the CI Build step** never ran: CI
  had been red on `main` for at least the last five pushes (runs #602-#606).
- **Root cause:** documented "known limitation" in `20260911004500_gst_tax_rules.sql`
  contradicted by its own test.
- **Fix:** `supabase/migrations/20261001093000_gst_tax_rules_unique_nulls_not_distinct.sql`
  (`UNIQUE NULLS NOT DISTINCT`; dev data checked first: 0 duplicate groups). Applied to dev.
- **Regression test:** the existing assertion in `test-gst-tax-rules-rls.mjs` now passes;
  full `test:db` chain green.

### E2E-DEF-002 -- cross-tenant financial data leak via `gst.account_balances` (P0)
- **Module:** Finance.
- **Steps:** as any authenticated user -- including one with no business and no Finance
  licence -- `select * from gst.account_balances` through PostgREST.
- **Expected:** only the caller's own licensed businesses' accounts.
- **Actual:** every business's account names, numbers and balances. Found by SEC-TI-01,
  which failed identically for all five test users (`outsider` included).
- **Root cause:** the view was created (and later re-created) without `security_invoker`;
  its comment assumed invoker was Postgres's default -- it is not. Owned by `postgres`, it
  bypassed the RLS on `gst.accounts` / `journal_lines` / `journal_entries`, and
  `grant select ... to authenticated` exposed it. It was the only such view in any tenant
  schema.
- **Fix:** `20261001094000_gst_account_balances_security_invoker.sql`
  (`alter view ... set (security_invoker = true)`), **applied to the dev project** and
  re-verified live (SEC-TI-01 green for all users).
- **Regression tests:** `scripts/test-views-security-invoker.mjs` (in `test:db`): every view
  in every tenant schema must be `security_invoker`, plus behavioural checks for this view
  (red before the fix, green after); SEC-TI-01 sweeps every relation on every run.
- **Note for the owner:** the dev project holds real accounts. Whether anyone queried this
  view directly cannot be determined from here; review API logs if that matters.

### E2E-DEF-003 -- anonymous billing calls returned 500 (P2)
- **Steps:** `POST /api/billing/razorpay/create-order` or `/verify` with no session.
- **Expected:** 401. **Actual:** 500; server log `42501 permission denied for schema core`.
- **Root cause:** `getCurrentAccount()` queried `core` before any user check; `anon` has no
  usage on `core`. Still refused (no bypass) but wrong status and log noise.
- **Fix:** both routes authenticate first. **Regression:** SEC-HTTP-03 "refuse anonymous callers".

### E2E-DEF-004 -- `/platform/compliance` unreachable for superadmins (P2)
- **Steps:** open `/platform/compliance` (or `/platform/compliance/packs/<id>`).
- **Expected:** the compliance registry. **Actual:** 308 → `/platform/finance` → 404.
- **Root cause:** the legacy `/<slug>/{products,fsm,gst,compliance}` rewrites in
  `packages/core/src/db/middleware.ts` matched any first segment, reading `platform` as a
  business slug.
- **Fix:** `legacyModuleRedirectPath()` applies only to business-scoped paths.
- **Regression:** `middleware.test.ts` "legacyModuleRedirectPath (E2E-DEF-004)" (red with the
  guard removed, green with it); SEC-PLAT exercises the route.

### E2E-DEF-005 -- external text not fully fenced in five Discovery prompts (P2)
- **Module:** Discovery AI (protected subsystem; prompt text only, no structural change).
- **Detail:** `restructure_import` appended uploaded-file text after `SOURCE:` with no fence
  or rule; `classify_reply` / `generate_reply` used a `"""` fence the reply could close and no
  "data, not instructions" rule; the two crawl prompts were fenced but a page containing
  `</findings>` could close the fence. CLAUDE.md AI rule 1 requires fencing.
- **Impact bound:** outputs are Zod-validated and nothing AI-produced executes on its own, so
  the realistic effect was skewed classification/extraction, not an unauthorised action.
- **Fix:** shared `untrusted()` + `UNTRUSTED_RULES` (length cap lifted for imports), tag
  neutralisation for `<findings>`; version constants bumped in place.
- **Regression:** `packages/module-discovery/src/prompts/injection.test.ts` (4 tests; red on
  the old prompts, green now).

### E2E-DEF-006 -- jobs board header overlap (P3)
- **Steps:** `/<slug>/service/jobs` at a 1280-wide window. **Actual:** each column's count
  printed over the next column's label. **Root cause:** `lg:grid-cols-5` tracks narrower than
  the columns' `min-w-[220px]`. **Fix:** `lg:grid-cols-[repeat(5,minmax(220px,1fr))]`.
  **Verified:** screenshot after the fix; covered by the A11Y/RESP sweep.

### E2E-DEF-007 -- jobs table had no mobile cards (P3)
- **Steps:** `/<slug>/service/jobs` → Table at 390 px. **Actual:** raw table.
  **Fix:** standard `md:hidden` card list. **Regression:** `authenticated/service.spec.ts`
  "Jobs list renders responsively" (desktop + mobile).

### E2E-DEF-008 -- business logo upload unusable on dev (P2)
- **Steps:** Business page → upload a PNG. **Actual (dev):** fails -- the dev database had
  neither `core.businesses.logo_url` nor the `business-logos` bucket.
- **Root cause:** environment drift: `20260917100000_core_business_logo.sql` was never applied
  to the dev project (the only missing migration found when diffing all 259 repo migrations
  against the project's recorded history). Separately, the file input had no accessible name.
- **Fix:** migration applied to dev verbatim from the repo; `aria-label` added.
- **Regression:** `quality.spec.ts` LOGO (wrong type, >2 MB, real upload, persisted URL);
  `storage.spec.ts` logo bucket isolation; A11Y sweep (label).
- **Action for owners:** check the **production** project for the same drift.

### E2E-DEF-009 -- sidebar hydration failure; Service/CRM not mapped (P2)
- **Steps:** visit any Inventory page, then open `/<slug>/service/jobs` (also customers,
  `/crm/leads`, `/admin/users`, `/billing`) with a fresh load.
- **Expected:** clean hydration. **Actual:** React #418 "Hydration failed", the whole
  dashboard tree discarded and re-rendered client-side, plus `Cannot read properties of null
  (reading 'parentNode')`.
- **Root cause:** `AppSidebar`'s `useState` initializer read `localStorage`
  (`cofounderai:selected-module`), which the server cannot; and `inferModuleFromPath()` never
  mapped `service`/`fsm`/`crm`, so on those pages the stored value decided the open section.
- **Fix:** stored choice applied in a mount effect (the pattern the same file already used for
  `groupFolds`); `service`/`fsm`/`crm` mapped.
- **Regression:** `app-sidebar.test.ts`; A11Y/RESP sweep now fails on any page error (0
  after the fix, 5 pages before).

### E2E-DEF-010 -- blank party names accepted (P3, open)
- **Steps:** as any member with write access, `insert into core.parties (business_id, name)
  values (<own>, '   ')` via PostgREST. **Actual:** accepted.
- **Why not fixed here:** a `CHECK (length(trim(name)) > 0)` would apply cleanly on dev (only
  this suite's rows were blank), but `core.parties` is written by many modules including
  webhook ingestion; a blind constraint could turn a valid-but-nameless inbound contact into
  a failed delivery. **Recommendation:** audit the insert paths, then add the constraint.
- **Test:** `quality.spec.ts` "blank and whitespace-only names…" is `test.fixme` (reported as
  skipped).

### E2E-DEF-011 -- revoked session surfaces as a raw error page (P2; test cause fixed, product follow-up open)
- **Seen:** in full runs #1-#3, `discovery-flows.spec.ts` "round: amounts need a currency;
  opening sets the round live" ended on "Something went wrong" after "Open round"; it always
  passed alone. Server log at that moment: `42501 permission denied for schema core` (the
  request ran as `anon`), plus `@supabase/ssr: chunked cookie decoded to invalid JSON`.
- **Root cause (proven):** `authenticated/session.spec.ts` logs out through the UI *as the
  shared test account*. The app's `signOut()` (`apps/web/app/(auth)/actions.ts`) uses Supabase's
  default **global** scope, which revokes every session that user holds -- including the one
  the desktop project's Funding flows were using. Their next server action could no longer
  authenticate, ran anonymously and failed. It was always the same test because it is the
  first mutation scheduled after the logout.
- **Fix (test):** a dedicated `logoutA` fixture identity signs out in its own context.
  Verified: final run #4 ran the whole flow file, Funding round included, with 0 "did not run".
- **Still open (product, P2):** when a user's session is revoked (signed out on another device,
  password reset elsewhere, admin removal), server actions surface the raw Postgres error via
  the generic error boundary instead of "your session ended -- please sign in again"
  (CLAUDE.md rule 5). Recommendation: check `auth.getUser()` at the start of mutating server
  actions (as E2E-DEF-003 did for two routes) and redirect to `/login`.
- **Product decision for the owner:** logging out of one browser logs the user out of
  *every* device (global scope). If that isn't intended, use `signOut({ scope: "local" })`.

### E2E-DEF-012 -- concurrent first visit to CRM Opportunities crashed (P2)
- **Steps:** a business that has never opened CRM Opportunities; open
  `/<slug>/crm/opportunities` in two tabs (or desktop + phone) at the same moment.
- **Expected:** both show the default pipeline. **Actual:** one renders "Something went
  wrong"; server log `23505 duplicate key value violates unique constraint
  "opportunity_stage_business_id_key_key"`. Caught by the full run, where the desktop and
  mobile projects hit the page together.
- **Root cause:** `ensureDefaultStages()` is check-then-insert with no handling for losing the
  race.
- **Fix:** on `23505` the loser reads back the winner's rows; other errors still throw.
- **Regression:** `packages/module-crm/src/lib/opportunities/default-stages.test.ts` (4 tests;
  the race case fails on the old code).

### Environment finding -- latency-driven timeouts (not a product defect)
The cloud sandbox reaches the dev project (ap-south-1) over the public internet; a server
action making several round trips sometimes exceeded the suite's 10 s assertion window
(e.g. a data-room "Mark ready" still showing "Working…"), and page loads exceeded the 30 s
test timeout while the security sweeps loaded the same database. Every such failure passed
on re-run; with `E2E_EXPECT_TIMEOUT=30000` and `--timeout=90000` the full Discovery flow file
(26 tests) passed. These are recorded as environment flakiness, **not** as passes of the
original runs. Recommendation: run CI in (or near) the database's region, and keep the
security sweeps in their own job so they don't compete with UI timing.

### E2E-DEF-013 -- audit-log forgery live on dev despite the fix being on `main` (P0)
- **Steps:** as owner A, `rpc('write_audit_log', { p_business_id: <B>, p_actor_id: <owner B>,
  ... })`. **Actual (before):** the row was written into tenant B's audit log, attributed to
  owner B. Found by the new SEC-RPC sweep (`e2e/security/rpc-abuse.spec.ts`).
- **Root cause:** a parallel session fixed this on `main` (SEC-2,
  `20261001090000_core_audit_log_write_authorization.sql`) but the migration had not been
  applied to the dev project -- the same deploy gap as E2E-DEF-008.
- **Fix:** migration applied to dev verbatim from `main`; SEC-RPC now passes (8/8).
- **Systemic recommendation:** nothing in the pipeline applies migrations or checks that the
  database matches the repo. Two of this pass's defects (008, 013) were "fixed in git, live in
  the database". Add a CI/deploy step that diffs `supabase/migrations/` against
  `supabase_migrations.schema_migrations` (the comparison done by hand for this report) and
  fails on drift -- and check production the same way.

### Observations (P3, not changed)
- **OBS-01** soft 404s: `notFound()` inside streamed pages returns HTTP 200 with the 404 UI.
- **OBS-02** `/service/dashboard` 404s (Service's dashboard is the module root).
- **OBS-03** storage: no size/MIME limits on any bucket (the logo action enforces its own);
  `attachments` read access is any member of the business regardless of module permission.
- **OBS-04** export response codes differ by the *other* business's licence state.
- **OBS-05** non-constant-time secret comparison in cron/inbound-email handlers -- **resolved
  on `main`** by SEC-3 (merged into this branch).

### Test-side defects fixed along the way (not product bugs)
- `branding.spec.ts` visited `/service/dashboard` (never a route) → `/service`.
- `service.spec.ts` assumed the jobs list opens on its table (it opens on the board).
- The pre-existing suite required a hand-made personal account (`E2E_TEST_EMAIL`); it is now
  self-provisioning (`E2E_SELF_PROVISION=1`).
