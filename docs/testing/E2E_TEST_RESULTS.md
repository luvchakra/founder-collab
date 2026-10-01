# E2E Test Results -- 2026-10-01

Branch `ccr-cc5f1ff6-vpv9vq` (based on `main` `bcd3602f`, then merged with `main` `58dcaddf`:
Next.js 16.3.8 and SEC-1..3). Plan: [E2E_TEST_PLAN.md](E2E_TEST_PLAN.md) · Defects:
[E2E_DEFECTS.md](E2E_DEFECTS.md) · Gaps: [E2E_COVERAGE_GAPS.md](E2E_COVERAGE_GAPS.md) ·
Inventory: [E2E_TEST_INVENTORY.md](E2E_TEST_INVENTORY.md).

Environment: cloud sandbox; production build (`next start`) against the **dev** Supabase
project `jazdtomcgqjxjueedmck` (ap-south-1), self-provisioned `e2e-qa` tenants created and
removed per run; Chromium 140 (sandbox build) only; local Postgres 16 for `test:db`.
Runs used `E2E_EXPECT_TIMEOUT=30000 --timeout=90000` (latency from the sandbox to the
database region -- see E2E_DEFECTS.md "Environment finding") and `E2E_IGNORE_CERT_ERRORS=1`
(this sandbox's TLS proxy).

## Executive summary

**Final full E2E run (all five projects, post-merge, after every fix): 330 passed, 1 failed, 49 skipped, 0 did not run (25.3 min). The single failure -- SEC-PLAT "enrolling a second factor…" -- exhausted its own 180 s budget mid-loop under full load; with the budget raised to 480 s both SEC-PLAT tests then passed (4/4 incl. fixtures, re-run shown below). It is reported here as a failure of that run, not converted to a pass.**

| | Count |
|---|---:|
| Total scenarios executed (final run) | 380 |
| Passed | 330 |
| Failed | 1 (timeout budget; passes on re-run with a 480 s budget) |
| Skipped (by design -- see below) | 49 |
| Did not run | 0 |
| Blocked | 0 (blocked areas are listed as gaps, not counted as scenarios) |

| Severity | Found | Fixed | Remaining |
|---|---:|---:|---:|
| P0 | 2 (DEF-002 tenant data leak, DEF-013 audit-log forgery live on dev) | 2 | 0 |
| P1 | 1 (DEF-001 CI/test:db red on main) | 1 | 0 |
| P2 | 7 (DEF-003, 004, 005, 008, 009, 011, 012) | 6 | 1 product-side follow-up of DEF-011 (raw error instead of "sign in again") |
| P3 | 3 defects (DEF-006, 007, 010) + 5 observations | 2 | DEF-010 + OBS-01..04 |

Defects fixed: **11** (with regression tests). Remaining: DEF-010 (P3), DEF-011's product
follow-up (P2), 4 P3 observations.

**Security coverage:** cross-tenant reads swept across *every* PostgREST-exposed relation
(255; 176 tenant-scoped) as 5 identities + anon; object-id substitution for read/update/
delete/insert/re-pointing/filter widening; 8 SECURITY DEFINER / report RPCs attacked as a
foreign tenant; storage (5 buckets) cross-tenant download/sign/list/upload/overwrite/delete;
10 cron + 7 webhook + billing + export + v1 API + portal-token handlers; RBAC per role,
6 privilege-escalation attempts; licence gating and the ADR-9 lifecycle; platform-admin
refusal including a self-enrolled-TOTP (aal2) tenant owner. **Zero cross-tenant leakage
remains** in everything swept.

**Browser coverage:** Chromium only (Desktop Chrome 1280×720 project, Pixel 7 project, plus
1440×900 / 1280×800 / 390×844 sweeps). Firefox and WebKit not run (gap G-01).

**Mobile coverage:** every authenticated smoke spec at Pixel 7 (412×915) -- 74 passed, 45
skipped because those specs are explicitly desktop-only (mutation flows, RBAC admin,
exports); A11Y/RESP sweep at 390×844 (12 screens, no horizontal overflow, 0 browser errors).

## Engineering validation (exact commands, merged branch)

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run lint:boundaries` | exit 0 |
| `npm run lint:migrations` | exit 0 |
| `npm run lint:migration-grants` | exit 0 |
| `npm run lint:gst-no-duplicate-masters` | exit 0 |
| `npm run test` | exit 0 -- vitest 272 + 867 + 233 + 1,187 + 60 + 1,314 + 59 + 9 tests (8 packages), node script tests 49/49 |
| `npm run test:db` (local Postgres 16) | exit 0 -- full chain incl. new `test-views-security-invoker.mjs`, 1,704 `ok:` assertions. **Was red on `main` before this work** (DEF-001). |
| `npm run build` without any Supabase env (as CI) | exit 0 |
| `npm run build` with dev env | exit 0 |
| Playwright full run (command in E2E_TEST_PLAN.md §4) | see summary |

## Run history (nothing hidden)

| Run | Code | Result | Notes |
|---|---|---|---|
| Baseline, pre-existing suite only | `main` + fixture support | 236 passed, 5 failed, 50 skipped, 8 did not run | failures → DEF-006/007 (Service), 2 test bugs, 1 intermittent |
| Full run #1 | after DEF-001..009 fixes | 292 passed, 10 failed | 6 latency timeouts, DEF-012 found (CRM race), cert noise, intermittent Funding |
| Full run #2 | + DEF-012, latency allowances | 313 passed, 1 failed, 50 skipped, 8 DNR | Funding "Open round" (DEF-011) |
| Full run #3 | merged with `main` (Next 16.3.8, SEC-1..3) + SEC-RPC | 322 passed, 1 failed, 49 skipped, 8 DNR | same Funding test → root-caused to the logout spec's global sign-out |
| **Full run #4 (final)** | + dedicated logout identity | 330 passed, 1 failed, 49 skipped, 0 did not run (25.3 min). The single failure -- SEC-PLAT "enrolling a second factor…" -- exhausted its own 180 s budget mid-loop under full load; with the budget raised to 480 s both SEC-PLAT tests then passed (4/4 incl. fixtures, re-run shown below). It is reported here as a failure of that run, not converted to a pass. | |

## Results by module (final run)

| Area | Specs | Result | Notes |
|---|---|---|---|
| Tenant isolation (API) | `security/tenant-isolation.spec.ts` | 13/13 | found DEF-002 (fixed) |
| RBAC / escalation / licensing (API) | `security/rbac-licensing.spec.ts` | 10/10 | ADR-9 grace/expiry/reactivation verified live |
| RPC abuse | `security/rpc-abuse.spec.ts` | 8/8 | found DEF-013 (fixed) |
| Storage | `security/storage.spec.ts` | 5/5 | incl. signed-URL expiry, logo bucket |
| Route handlers | `multi-user/http-routes.spec.ts` | 25/25 | found DEF-003 (fixed) |
| Auth, cross-tenant UI, licence UI, platform admin | `multi-user/cross-tenant-ui.spec.ts` | 11 passed, 1 timed out (budget) → 2/2 SEC-PLAT on re-run | found DEF-004 (fixed) |
| A11y / responsive / hostile input / logo | `multi-user/quality.spec.ts` | 7 passed, 1 fixme (DEF-010) | found DEF-008, DEF-009 (fixed) |
| Authentication & public pages | `unauthenticated/*` (8 files) | 58/58 | account-enumeration check now enabled |
| Discovery (+ Marketing, Funding) | `discovery.spec`, `discovery-flows.spec`, `marketing.spec`, `funding.spec` | discovery 8/8, flows 24/24 (desktop; incl. Funding "Open round" -- DEF-011 root cause confirmed), marketing 24/24, funding 24/24 | flows are desktop-only by design |
| Inventory | `inventory.spec.ts` | 8/8 | smoke only (gap G-08) |
| Service | `service.spec.ts` | 8/8 | DEF-006/007 fixed |
| CRM | `crm.spec.ts` | 16/16 | DEF-012 fixed |
| Finance | `finance.spec.ts` | 14/14 | DEF-001/002 fixed at DB level |
| Billing | `billing.spec.ts` (+ unauth) | 6 + 4 passed, 6 skipped (mobile) | real payment flows: gap G-02 |
| Exports | `exports.spec.ts` (+ unauth, SEC-HTTP-04, INPUT CSV) | 6 + 2 passed, 8 skipped (mobile/desktop-only) | CSV escaping + formula neutralisation verified |
| Users & roles | `rbac.spec.ts` | 6 passed, 6 skipped (mobile) | |
| Shell / nav / branding / help / session | `dashboard-nav`, `branding`, `help`, `session` | 18 + 14 + 4 + 10 | |

### Skipped, by reason (final run)
- **Desktop-only specs on the mobile project** (they `test.skip` themselves on mobile):
  Discovery mutation flows, RBAC admin, exports, billing details.
- **Opt-in tools:** `capture-screenshots.spec.ts` (documentation screenshots, 4).
- **Known defect:** DEF-010 blank-name check (`test.fixme`, 1).
- **Serial dependents:** in a run where a serial step fails, the remaining steps of that
  file are skipped/not run by Playwright.
