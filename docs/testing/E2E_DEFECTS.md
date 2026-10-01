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
| E2E-DEF-011 | P2 | Discovery / Funding | "Open round" once rendered the error boundary during the full parallel run | **Open -- not reproduced** |
| E2E-OBS-01 | P3 | All | Not-found pages are served with HTTP 200 (soft 404) | Open (observation) |
| E2E-OBS-02 | P3 | Service | `/service/dashboard` 404s; every other module has `/<module>/dashboard` | Open (observation) |
| E2E-OBS-03 | P3 | Storage | No bucket sets a size limit or MIME allow-list; attachment reads are membership-scoped, not module/permission-scoped | Open (observation) |
| E2E-OBS-04 | P3 | Exports | A foreign business slug answers 403 `MODULE_NOT_LICENSED` vs 403 `forbidden` depending on the *other* tenant's licence -- a 1-bit oracle about another business | Open (observation) |
| E2E-OBS-05 | P3 | Cron / webhooks | Shared secrets compared with `!==` (not constant-time) | Open (observation) |

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
- **Fix:** `supabase/migrations/20261001090000_gst_tax_rules_unique_nulls_not_distinct.sql`
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
- **Fix:** `20261001091000_gst_account_balances_security_invoker.sql`
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

### E2E-DEF-011 -- Funding "Open round" crash, once (P2, open)
- **Steps:** full parallel run (desktop + mobile, 6 workers) → `discovery-flows.spec.ts`
  "round: amounts need a currency; opening sets the round live".
- **Actual (once):** after "Open round", `h1` read "Something went wrong".
- **Investigation:** not reproduced in two reruns (the single test; its whole serial file of
  26 tests, all green). The production server log held no matching error. Suspected
  contention/transient upstream error rather than a deterministic bug, **but unproven** --
  left open, not counted as fixed. Next step: re-run under load with server-side logging of
  the action's error digest.

### Observations (P3, not changed)
- **OBS-01** soft 404s: `notFound()` inside streamed pages returns HTTP 200 with the 404 UI.
- **OBS-02** `/service/dashboard` 404s (Service's dashboard is the module root).
- **OBS-03** storage: no size/MIME limits on any bucket (the logo action enforces its own);
  `attachments` read access is any member of the business regardless of module permission.
- **OBS-04** export response codes differ by the *other* business's licence state.
- **OBS-05** non-constant-time secret comparison in cron/inbound-email handlers.

### Test-side defects fixed along the way (not product bugs)
- `branding.spec.ts` visited `/service/dashboard` (never a route) → `/service`.
- `service.spec.ts` assumed the jobs list opens on its table (it opens on the board).
- The pre-existing suite required a hand-made personal account (`E2E_TEST_EMAIL`); it is now
  self-provisioning (`E2E_SELF_PROVISION=1`).
