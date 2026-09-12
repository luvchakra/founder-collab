# Test cases: `platform` (WonderArc Platform Administration Portal)

Covers `apps/web/app/platform/**` + `packages/core/src/admin/**` (control-plane code
under `packages/core`, not the `gst` module despite the similar name). New file — this
work shipped 2026-09-11/12 (`docs/design/platform-admin-portal-audit.md`, 8 of 9 P0
sections done) with substantial DB-level RLS coverage (16 dedicated
`scripts/test-platform-*.mjs`/`test-core-*.mjs` scripts, all wired into `test:db`) but
zero manual test-case documentation until now.

**Architecturally distinct from every other file in this directory**: per CLAUDE.md's
own carve-out, `platform` "is the one exception to 'module schema' — it holds the
WonderArc Platform Administration Portal's own control-plane data — not a licensable
customer module, not tenant data, never gated by `core.licenses`." So the RLS framing
here is **admin-role gating** (does a superadmin get through; does a business admin/
member get zero rows or a permission-denied), never the `tenant AND licensed` framing
every module doc in this directory uses. Four of the tables/functions this file
documents (`core.business_settings.plan`, `core.usage_counters`,
`try_consume_usage_counter()`, `requireModule()`'s platform pre-check) are `core`-owned
instead and are documented in `core.md` (TC-CORE-017..020) — not duplicated here.

Numbering is sequential and never reused.

## SUPERADMIN, MFA, Least Privilege

### TC-PLATFORM-001: A non-superadmin visiting any `/platform/*` route is redirected, not shown a 404
**Priority:** P0 · **Story:** PLATFORM-P0-01
**Steps:**
1. As a business owner/member with no `platform.admins` row, navigate directly to
   `/platform` and to a deep `/platform/(protected)/*` route.
**Expected result:** Redirected to `/dashboard`, never a 404 (which would leak that the
route exists at all).

### TC-PLATFORM-002: `/platform/(protected)/*` requires AAL2 (MFA); AAL1 redirects to `/platform/mfa`
**Priority:** P0 · **Story:** PLATFORM-P0-18.1
**Steps:**
1. As a real superadmin authenticated at AAL1 (no MFA completed this session),
   navigate to any protected platform route.
**Expected result:** Redirected to `/platform/mfa`, never straight through to the
dashboard or the requested page.

### TC-PLATFORM-003: The `PLATFORM_ADMIN_EMAILS` bootstrap escape hatch still works
**Priority:** P0 (the "first superadmin can always get in" guarantee) · **Story:**
PLATFORM-P0-01
**Steps:**
1. With zero rows in `platform.admins`, sign in as an email listed in
   `PLATFORM_ADMIN_EMAILS`.
**Expected result:** Recognized as a superadmin without a pre-existing `platform.admins`
row — the pre-existing bootstrap path, reused not replaced.

### TC-PLATFORM-004: `platform.admins.role`'s check constraint can admit a new role value without a table restructure
**Priority:** P2 · **Story:** PLATFORM-P0-18.3

## Platform Dashboard

### TC-PLATFORM-005: Configuration Health widget reports `configured: false` honestly, never a fabricated `true`
**Priority:** P1 · **Story:** PLATFORM-P0-02
**Expected result:** Every platform-wide surface not yet actually wired up reports
`false` — never claims readiness it doesn't have.

### TC-PLATFORM-006: MRR/ARR renders as `--`, never a fabricated number, until a real billing entity exists
**Priority:** P2 · **Story:** PLATFORM-P0-02

## Branding & Look and Feel

### TC-PLATFORM-007: A business admin gets zero rows/a silent no-op on `platform.branding`/`platform.admins`; a superadmin can read and write both
**Priority:** P0 · **Story:** PLATFORM-P0-03.1/03.3
**Covers:** `scripts/test-platform-branding-rls.mjs` (10 assertions — includes a real
schema-grant bug this story found and fixed: `grant usage on schema platform` was
missing).

### TC-PLATFORM-008: Publishing a branding draft copies it to the live columns atomically; editing a draft never touches production until Publish
**Priority:** P0 · **Story:** PLATFORM-P0-03.4
**Steps:**
1. Edit a branding draft (logo/background/legal links).
2. Visit the public `/login` page in another session.
3. Click Publish.
**Expected result:** (2) shows exactly today's look, unaffected by the unsaved draft.
(3) atomically copies draft → live; `/login` now reflects it.

### TC-PLATFORM-009: Public auth pages render superadmin-configured branding when set, and today's hardcoded look when unset
**Priority:** P1 · **Story:** PLATFORM-P0-03.5

## Subscription/Pricing Plans

### TC-PLATFORM-010: A superadmin can create/update a plan but never delete one — no delete grant exists at any layer
**Priority:** P0 · **Story:** PLATFORM-P0-04.1
**Covers:** `scripts/test-platform-plans-rls.mjs` (11 assertions).

### TC-PLATFORM-011: A new plan auto-seeds with every module `enabled=true`
**Priority:** P0 (so existing behavior is unchanged the moment the table exists) ·
**Story:** PLATFORM-P0-04.3
**Covers:** `scripts/test-platform-plan-modules-rls.mjs` (11 assertions).

### TC-PLATFORM-012: Deleting a `platform.features` catalog entry cascade-deletes its `plan_features` rows
**Priority:** P0 · **Story:** PLATFORM-P0-04.6
**Covers:** `scripts/test-platform-plan-features-rls.mjs` (13 assertions).

### TC-PLATFORM-013: A `plan_limits` row's tri-state (`limited`/`unlimited`/`disabled`) CHECK constraint rejects every mismatched pairing, even for a superadmin
**Priority:** P1 · **Story:** PLATFORM-P0-04.5
**Covers:** `scripts/test-platform-plan-limits-rls.mjs` (15 assertions, extended for
soft/hard `limit_type`).

## Usage & Limits (platform-facing pieces — counters/enforcement themselves are TC-CORE-017/018)

### TC-PLATFORM-014: Usage Dashboard's projected-usage figure is a real linear projection, never an LLM guess or fabricated trend
**Priority:** P1 · **Story:** PLATFORM-P0-06.2

### TC-PLATFORM-015: A limit-warning/limit-reached notice renders the documented worked-example copy, and omits a button entirely rather than linking nowhere
**Priority:** P2 · **Story:** PLATFORM-P0-06.4
**Covers:** `packages/core/src/components/limits/limit-warning-notice.tsx`.

### TC-PLATFORM-016: A soft limit's copy says "over your plan's guideline," never falsely claims "within the limit"
**Priority:** P1 · **Story:** PLATFORM-P0-06.5

## Module Administration

### TC-PLATFORM-017: `platform.modules.enabled` is structurally impossible to desynchronize from `status`
**Priority:** P0 · **Story:** PLATFORM-P0-07.1
**Steps:**
1. Attempt to write `platform.modules.enabled` directly, as any role.
**Expected result:** Rejected — it's a `GENERATED ALWAYS` column derived from `status`,
not merely kept in sync by application code.
**Covers:** `scripts/test-platform-modules-rls.mjs` (15 assertions).

### TC-PLATFORM-018: Disabling/entering-maintenance a module requires a non-empty reason and writes exactly one atomic audit row
**Priority:** P0 · **Story:** PLATFORM-P0-07.2
**Steps:**
1. Attempt to disable a module with an empty/whitespace-only reason, even as a
   superadmin.
2. Disable it with a real reason.
**Expected result:** (1) rejected. (2) exactly one `platform.module_status_events` row,
atomically.
**Covers:** `scripts/test-platform-module-kill-switch-rls.mjs` (18 assertions, boolean-
wrapper compat), `scripts/test-platform-module-status-rls.mjs` (24 assertions, full
four-status reconciliation + concurrency).

### TC-PLATFORM-019: `read_only` status blocks writes but not route loads; `maintenance`/`disabled` are identical full blocks, differing only in copy
**Priority:** P0 · **Story:** PLATFORM-P0-07.3
**Expected result:** `read_only` mirrors a license's own grace-period shape exactly
(read allowed, write denied); `maintenance` and `disabled` both fully block the route,
distinguished only in the customer-facing message.

### TC-PLATFORM-020: The Module Registry's derived `minimumPlan`/`licensed` fields are computed at read time, never a second independently-writable column
**Priority:** P1 · **Story:** PLATFORM-P0-07.1

## Feature Flags

### TC-PLATFORM-021: Every flag mutation requires a non-empty reason and writes one atomic before/after JSONB audit snapshot
**Priority:** P0 · **Story:** PLATFORM-P0-08.1
**Steps:**
1. Create/update/delete a feature flag with no reason.
2. Repeat with a real reason.
**Expected result:** (1) rejected for every mutation type, even for a superadmin — no
direct table write exists for any role. (2) one atomic audit snapshot each.
**Covers:** `scripts/test-platform-feature-flags-rls.mjs` (35 assertions).

### TC-PLATFORM-022: The scope CHECK constraint rejects a `global` flag with a stray scope value, and a scoped flag missing its own required value
**Priority:** P0 · **Story:** PLATFORM-P0-08.2

### TC-PLATFORM-023: `isFeatureFlagActive()`'s Active/Scheduled/Expired/Disabled derivation is correct for every combination of `enabled`/`effective_from`/`effective_to`
**Priority:** P2 · **Story:** PLATFORM-P0-08.4

## Internal AI Provider & Keys

### TC-PLATFORM-024: Nobody — including a genuine superadmin — can ever `SELECT platform.ai_provider_keys` directly
**Priority:** P0 · **Story:** PLATFORM-P0-09.1
**Steps:**
1. As a superadmin, attempt a raw `SELECT * FROM platform.ai_provider_keys`.
2. Call `ai_provider_key_status()`, the only real read path.
**Expected result:** (1) no SELECT grant exists at any layer. (2) never selects the
ciphertext column — status only.
**Covers:** `scripts/test-platform-ai-providers-rls.mjs` (40 assertions).

### TC-PLATFORM-025: A key rotation's audit trail never contains ciphertext, even in its JSONB snapshot
**Priority:** P0 · **Story:** PLATFORM-P0-09.1
**Expected result:** Only key fingerprints appear in `platform.ai_provider_events`.

### TC-PLATFORM-026: AI Provider Routing / AI Feature Policies are config-only — no runtime code path reads either table yet
**Priority:** P1 (confirm by grep, not just by reading the docstring) · **Story:**
PLATFORM-P0-09.2/09.4
**Covers:** `scripts/test-platform-ai-provider-routing-rls.mjs` (30 assertions),
`scripts/test-platform-ai-feature-policies-rls.mjs` (24 assertions).

### TC-PLATFORM-027: AI Usage merges `core.ai_runs` and `discovery.ai_runs` correctly, resolving a discovery run's business via workspace→product→business
**Priority:** P2 · **Story:** PLATFORM-P0-09.5
**Expected result:** Never resolves via `account_id` directly — an account can own more
than one business.

## Deliberately not built yet — no test cases until real behavior exists

PLATFORM-P0-09.3's runtime-wiring half (BYOK-precedence/failover/granularity questions
remain open), PLATFORM-P0-16 (Platform Audit), §14 AI Safety/Cost Controls
(PLATFORM-P0-10), §15/17/19, and all of P1. Listed here (mirroring `core.md`'s own
forward-looking notes) so this doc stays honest about what's real vs. configured-but-
inert, rather than silently omitted.
