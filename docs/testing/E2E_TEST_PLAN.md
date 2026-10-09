# E2E Test Plan

Status: adopted 2026-10-01. Extends, rather than replaces, [TESTING_STRATEGY.md](TESTING_STRATEGY.md)
(DB/RLS scripts, vitest) and [e2e-playwright.md](e2e-playwright.md) (the critical-path smoke
suite). Inventory of what is under test: [E2E_TEST_INVENTORY.md](E2E_TEST_INVENTORY.md).

## 1. Layers, and what each one proves

| Layer | Tool | Runs against | Proves |
|---|---|---|---|
| Unit | vitest (each package) | nothing external | business logic, prompt construction, middleware routing, AI output validation |
| DB / RLS | `npm run test:db` (`scripts/test-*.mjs`) | throwaway local Postgres with every migration applied | tenant AND licence RLS per table, procedural SQL, workflows; `test-views-security-invoker.mjs` guards views |
| API security | Playwright `security` project | **dev** Supabase via PostgREST/Storage with real user JWTs | cross-tenant isolation over *every* exposed relation, RBAC, privilege escalation, licence lifecycle, storage isolation -- with the UI bypassed entirely |
| HTTP routes | Playwright `multi-user` project (`http-routes.spec.ts`) | the running app | cron/webhook/billing/export/v1/portal handlers refuse what they must |
| Browser journeys | Playwright `multi-user`, `desktop`, `mobile`, `unauthenticated` | the running app + dev Supabase | real login per role, URL/ID tampering, licence routing, platform-admin refusal, module smoke + flows, a11y, responsive, hostile input |

Anything a lower layer can prove is proved there; E2E repeats only what needs the whole stack.

## 2. Test data (deterministic, self-cleaning)

`apps/web/e2e/support/tenants.ts`, run by the `tenants` setup project and removed by
`tenants-teardown` after every dependent project, pass or fail:

| Identity | Business | Role |
|---|---|---|
| `ownerA` | Tenant A "Acme Home Security QA" (all 5 modules) and A2 "e2e-qa Discovery Only" (Discovery only) | owner |
| `adminA`, `viewerA`, `invMgrA` | Tenant A | admin, viewer, inventory_manager |
| `ownerB` | Tenant B "e2e-qa Tenant B" (all 5 modules, separate account) | owner |
| `outsider` | none | -- |

- Users are created with the admin API (pre-confirmed, no email sent); businesses, owner
  memberships and tenant B's records are written through each user's **own RLS session** --
  the app's real write path. Extra members are inserted with the service role because RLS
  correctly refuses direct member inserts (asserted separately).
- Every identity is `e2e-qa-*@e2e.wonderark.test`; teardown finds accounts by the `e2e-qa-`
  name prefix and never reads or lists any real user.
- `E2E_ALLOW_FIXTURES=1` is required -- the explicit "this project is safe to seed" switch.
  **Never point the suite at production.**
- Tests do not depend on each other's order except inside files that declare
  `describe.configure({ mode: "serial" })` for state they share on purpose.

## 3. Scenario catalogue (IDs used in results/defects)

| ID | File | Scenario |
|---|---|---|
| SEC-TI-01 | `security/tenant-isolation.spec.ts` | 5 users × every business/workspace-scoped relation PostgREST exposes: no foreign tenant id visible |
| SEC-TI-02 | same | anon role reads nothing tenant-scoped |
| SEC-TI-03 | same | object-id substitution against B's party/item/document/offering/prospect/job: read, update, delete, forged insert, re-pointing A's row, `or`/`in`/`ilike` filter widening |
| SEC-TI-04 | same | tenant RPCs (`has_permission`, `effective_permissions`, `my_business_access`, `next_number`) refuse B |
| SEC-RBAC | `security/rbac-licensing.spec.ts` | viewer read-only; inventory manager outside its modules; admin positive control |
| SEC-ESC | same | self-promotion, granting permissions, minting roles, adding members, self-licensing, self-made platform admin |
| SEC-LIC | same | full-permission owner refused an unlicensed module; ADR-9 grace (read-only) → expired (denied, rows kept) → reactivated |
| SEC-STO | `security/storage.spec.ts` | cross-tenant download / signed URL / list / upload / overwrite / delete; signed-URL binding and expiry; logo bucket |
| SEC-HTTP-01..05 | `multi-user/http-routes.spec.ts` | 10 cron routes; 7 webhooks (unsigned/forged/replayed); billing (anon, forged client "success"); exports (anon, slug substitution, viewer, unlicensed, unknown job); v1 API keys; guessed portal tokens |
| AUTH-01..04 | `multi-user/cross-tenant-ui.spec.ts` | wrong password; session persistence + logout; tampered cookie; anonymous deep links |
| SEC-UI-01..04 | same | B's URLs and B's ids under A's slug show nothing of B; switcher; no-business user |
| SEC-LIC-UI, SEC-RBAC-UI | same | not-licensed page for A2's other modules; viewer has no invite/role controls |
| SEC-PLAT | same | non-admin redirected from all 23 platform pages; aal2 (self-enrolled TOTP) non-admin still sees no platform data |
| A11Y/RESP | `multi-user/quality.spec.ts` | 12 screens × 1440×900, 1280×800, 390×844: one h1, labelled controls, named buttons/links, img alt, no horizontal scroll, no console errors / page errors / 5xx |
| INPUT | same | script/SQL/emoji/Unicode/formula/multiline names render as text; CSV export escaping + formula neutralisation; blank names (fixme, DEF-010) |
| LOGO | same | upload; wrong type and >2MB refused by the server |
| (existing) | `authenticated/*`, `unauthenticated/*` | module smoke on desktop + Pixel 7, Discovery/Marketing/Funding mutation flows, exports, RBAC, billing, branding, help |

## 4. Running it

```bash
# once: apps/web/.env.local holds the DEV project's URL, publishable key, service-role key
npm run build                 # repo root (or use `next dev` instead of a build)
cd apps/web && npx next start -p 3100 &
E2E_ALLOW_FIXTURES=1 E2E_SELF_PROVISION=1 E2E_TEST_BUSINESS_SLUG=acme-home-security-qa \
E2E_ALLOW_MUTATIONS=1 PLAYWRIGHT_BASE_URL=http://localhost:3100 \
npx playwright test --project=security --project=multi-user \
  --project=unauthenticated --project=desktop --project=mobile
```

- `E2E_KEEP_FIXTURES=1` skips teardown when debugging by hand.
- `E2E_BROWSERS=firefox,webkit` adds the unauthenticated smoke on those engines (needs
  `npx playwright install firefox webkit`).
- `PLAYWRIGHT_CHROMIUM_PATH` points at a pre-installed Chromium when the pinned revision
  can't be downloaded (as in the cloud sandbox this suite was built in).

CI: the `e2e` job in `.github/workflows/nightly.yml` runs the same command nightly (and on
manual dispatch) after a full CI run, never per pull request, only when the `E2E_SUPABASE_*` secrets and the `E2E_ALLOW_FIXTURES=1` repository variable are
set (dev project only), one run at a time (`concurrency: e2e-fixtures`), uploading traces,
screenshots and videos on failure.

## 5. Evidence and flake policy

- `trace: retain-on-failure`, `screenshot: only-on-failure`, `video: retain-on-failure` --
  nothing is kept for passing tests.
- `watchForErrors()` fails a browser test on uncaught exceptions, console errors (other than
  the 4xx a test provokes on purpose) and any 5xx response -- a page that renders while
  throwing underneath is not a pass.
- No fixed sleeps for synchronisation: waits are on URL, element state, load state or the
  server's own response. The two deliberate waits are a signed URL's own 2 s lifetime and
  nothing else.
- A test that cannot honestly pass yet is `test.fixme` with a defect id -- reported as
  skipped, never as passed.
