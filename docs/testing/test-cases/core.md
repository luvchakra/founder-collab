# Test cases: `core` (Epics 2-3, stories C-1..C-9, D-1..D-10)

Covers cross-module foundations: tenancy, licensing, RBAC, parties, items, documents,
payments, numbering, tags/custom fields/attachments, domain events, audit log,
messaging, API keys. RLS for each table already has a dedicated script under
`scripts/test-core-*-rls.mjs` (see `INDEX.md`) — cases below are the workflow-level
behavior those scripts don't assert.

### TC-CORE-001: License activation unlocks a module end to end
**Feature:** `core.licenses` + `has_module()`/`has_module_write()` + route guard.
**Priority:** P0 · **Story:** C-3, C-5
**Steps:**
1. Attempt to load a module's route before activating its license — confirm what
   the person sees.
2. Activate a license for that module.
3. Load the route again.
4. Attempt a write action inside it.
**Expected result (step 1, before activation):** Not a bare 404 — an informative
page naming the module, stating it isn't licensed yet, and linking to
`/dashboard/settings/licenses` to activate it (see `TC-MENU-LIC-002` for the full
spec of this page; this case is the first place in the funnel it should appear —
a prospective user's very first click into a module they haven't turned on yet).
**Expected result (steps 3-4, after activation):** Route resolves normally, write
succeeds, and `has_module_write()` returns true.
**Update (2026-09-12, PLATFORM-P0-07.2/07.3):** step 1's route guard now checks
`platform.modules.status` *before* the license check even runs — a platform-wide
`disabled`/`maintenance` module redirects to `not-licensed` with
`reason=platform_disabled`, a case this test doesn't yet exercise. Add a step 0: with a
module platform-disabled (as a superadmin), confirm the redirect happens even for a
business with an otherwise-active license — this now blocks BEFORE the business's own
license is even read.
**Covers (new):** `packages/core/src/db/middleware.ts#findPlatformDisabledModuleForRoute`.

### TC-CORE-002: Cancelling a license starts the 30-day read-only grace, not immediate denial
**Feature:** ADR-9's core guarantee.
**Priority:** P0 · **Story:** C-4
**Steps:**
1. Cancel an active license.
2. Immediately attempt a read, then a write, in that module.
**Expected result:** Read succeeds; write is denied. `core.license_events` records the
cancellation with a timestamp the 30-day window is computed from.
**Correction — two distinct messages exist, not one, and only one carries a date:**
this case previously described a single message ("...grace period until [date];
reactivate to resume editing") without distinguishing where it comes from. In practice:
- **Loading a route** for a module past its route guard's own check hits
  `not-licensed/page.tsx`, which *does* format the exact date (`graceEndsAt` passed
  through as a search param, rendered via `formatDate()`) — this is the message the
  quoted wording actually describes, and it's accurate for this path.
- **A write attempted from inside an already-loaded page** (the license lapsed into
  grace mid-session, after the route guard's own check already passed) instead hits
  `requireModule()`'s own thrown error, which has no date in it at all — it's a
  same-request check with no reason to fetch `grace_ends_at`. Before this pass its
  message also used the internal module *key* ("fsm," "gst") rather than a name a
  business owner has ever seen in the UI; fixed this session to use the module
  registry's display name (`packages/core/src/licensing/queries.ts#requireModule`) so
  a toast surfacing it at least reads consistently with the route-guard page's tone,
  even without a specific date.
**Automated coverage:** none yet for the display-name fix specifically — this repo's
DB-only harness can't reach a TypeScript-level thrown-error string; would need a mocked-
Supabase-client unit test (no precedent yet in `packages/core`, unlike `module-gst`'s new
mocked-`fetch` precedent for `callGsp` — worth building next if this message keeps
changing) or a live-Supabase manual check.
**Update (2026-09-12, PLATFORM-P0-07.2/07.3):** `requireModule()` now checks THREE
things in order, most-specific-reason-wins, not just the business's own license: (1)
platform `disabled`/`maintenance` → throws immediately, before the business's own
license is even read, with copy explicitly saying "not your licensing problem"
(`defaultPlatformBlockedMessage`); (2) the business's own license/grace exactly as
documented above; (3) only if the business's own license would otherwise permit the
write, platform `read_only` → throws `defaultPlatformReadOnlyMessage` (mirroring
grace's own "read allowed, write denied" shape, platform-wide instead of per-business).
Add steps confirming this ordering — e.g. a platform-`read_only` module with a business
whose own license is in grace should surface the grace message, not the platform one,
since grace is the MORE specific reason for that particular business.
**Covers (new):** `packages/core/src/licensing/queries.ts#requireModule`,
`getPlatformModuleStatus`.

### TC-CORE-003: Grace period expiry moves to full denial without deleting data
**Feature:** ADR-9, second half.
**Priority:** P0 · **Story:** C-4
**Steps:**
1. Advance a cancelled license past its 30-day grace window (via a backdated
   `license_events` row in a test environment, not a real 30-day wait).
2. Attempt a read.
3. Query the module's tables directly at the database level.
**Expected result:** Read is denied (RLS, not just UI hiding). Rows still physically
exist, untouched. The denial itself is an informative page, not a bare 404/403 —
naming the module, stating the grace period has ended, confirming the data is
retained (not deleted), and linking to `/dashboard/settings/licenses` to reactivate.

### TC-CORE-004: Reactivation restores access and replays parked events
**Feature:** ADR-9's reactivation guarantee, `core.domain_events` interaction.
**Priority:** P0 · **Story:** C-4, D-9
**Preconditions:** A license was denied (past grace), with domain events that would
normally have fired during the denial window.
**Steps:**
1. Reactivate the license.
2. Check access, then check whether parked events drain.
**Expected result:** Full access restored immediately; any events that should have
fired during the denied window are replayed, not silently dropped.

### TC-CORE-005: `requirePermission()` blocks a server action, not just the UI
**Feature:** RBAC defense-in-depth (`has_permission()`/`requirePermission()`).
**Priority:** P0 · **Story:** C-7
**Steps:**
1. As a user without a specific permission, call the corresponding server action
   directly (bypassing the UI element that would normally be hidden).
**Expected result:** Rejected server-side — hiding the button is not the only guard.

### TC-CORE-006: `core.parties` + `party_roles` model one entity, many roles correctly
**Feature:** The prospect/customer/supplier unification (D-1, D-3).
**Priority:** P0 · **Story:** D-1, D-3
**Steps:**
1. Take a `discovery` prospect that converted to a customer.
2. Check `core.parties`/`party_roles` for that entity.
**Expected result:** One `parties` row, with both a `prospect`-history role and a
`customer` role — not two separate party rows for the same real-world company.

### TC-CORE-007: `core.next_number()` never issues a duplicate under concurrency
**Feature:** D-5's whole point — the async psql harness exists specifically for this.
**Priority:** P0 · **Story:** D-5
**Steps:**
1. Issue 20 concurrent calls to `next_number(business_id, scope)` for the same scope.
**Expected result:** 20 distinct, sequential numbers — no duplicates, no gaps beyond
what's expected from normal sequence behavior.

### TC-CORE-008: Document + document_lines totals reconcile
**Feature:** `core.documents`/`document_lines` (D-6), used by invoices/orders across modules.
**Priority:** P0 · **Story:** D-6
**Steps:**
1. Create a document with several lines, including a discount and tax line.
2. Read back the document total.
**Expected result:** Total matches the sum of lines exactly (no floating-point drift
across currency-precision fields).

### TC-CORE-009: Payment allocation and balance/aging views stay consistent
**Feature:** `core.payments`/`payment_allocations` + balance/aging views (D-7).
**Priority:** P0 · **Story:** D-7
**Steps:**
1. Create a document with a balance due.
2. Record a partial payment, then a second payment that fully settles it.
3. Check the aging view.
**Expected result:** Balance decrements correctly after each payment; the aging view
drops the document once fully paid, not before.

### TC-CORE-010: Custom fields and tags don't leak across businesses
**Feature:** `core.tags/taggings/custom_field_defs/custom_field_values` (D-8) —
distinct from the RLS script, this checks the *definition* layer (field defs scoped
per business, not global).
**Priority:** P1 · **Story:** D-8
**Steps:**
1. Business A defines a custom field "Warranty Expiry" on items.
2. Check whether Business B sees that field definition as an option.
**Expected result:** Business B does not see A's custom field definitions.

### TC-CORE-011: Domain events drain reliably and exactly once
**Feature:** `core.domain_events` publisher + drain loop (D-9), the platform's only
event mechanism (ADR-5 — "a table plus a cron").
**Priority:** P0 · **Story:** D-9
**Steps:**
1. Publish an event.
2. Run the drain loop (`api/cron/drain-events`) twice in a row.
**Expected result:** The event's consumer runs exactly once — the second drain run
doesn't reprocess an already-drained event.

### TC-CORE-012: Audit log captures who/what/when for a sensitive action
**Feature:** `core.audit_log` + write helper (D-10).
**Priority:** P1 · **Story:** D-10
**Steps:**
1. Perform an action the audit log is meant to capture (e.g. a license change, a
   permission grant).
**Expected result:** A row exists with the correct actor, action, target, and
timestamp — queryable from the audit-log UI (`components/audit-log`), not just the DB.

### TC-CORE-013: API keys scope correctly to their business and permissions, and now cover fsm/crm/gst resources too
**Feature:** `core.api-v1/keys` (ported SP-7, `test-core-api-keys.mjs` covers RLS —
this covers the actual request-scoping behavior).
**Priority:** P0 · **Story:** SP-7 (promoted to core)
**Update (this pass — item #7 of a UX pass):** the API-keys feature moved out of
`inventory`'s own settings and into a business-wide admin route
(`/dashboard/businesses/{id}/admin/api-keys`, `packages/core/src/components/api-keys/
api-keys-panel.tsx`) — it was never actually inventory-specific (`core.api_keys` is a
core table), and one key now scopes across every licensed module's own read-only API
v1 resources, not just inventory's. `apps/web/app/api/v1/dispatch.ts`'s composite
dispatcher resolves which of inventory/fsm/crm/gst owns a requested resource name
(each module exports its own `RESOURCES` map: `fsm.jobs`, `crm.tickets`, `gst.einvoices`,
built with `packages/core/src/api-v1/crud.server.ts#createCrudHandler`, all read-only —
no `writePermission` configured) and merges each module's OpenAPI fragment into one
spec at `GET /api/v1/openapi.json`.
**Steps:**
1. Create an API key scoped to Business A.
2. Call `/api/v1/[resource]` with that key, requesting a resource under Business B.
3. With the same key, call `/api/v1/jobs`, `/api/v1/tickets`, and `/api/v1/einvoices`
   (fsm/crm/gst's own new resources) against a business licensed for all three, then
   one licensed for none of them.
4. `GET /api/v1/openapi.json` and confirm every licensed module's own resources appear
   in one merged spec.
5. Attempt a `POST`/`PATCH` against `jobs`/`tickets`/`einvoices`.
**Expected result:** Step 2 is rejected regardless of which resource ID is requested
(unchanged from before this pass). Step 3 returns each module's own data only when
that specific module is licensed for the key's business — `MODULE_NOT_LICENSED`-shaped
behavior at the API layer too, not just the UI (ADR-10). Step 5 is rejected with 405,
since none of these three resources declared a `writePermission`.
**Automated coverage:** none yet — this repo's harness is DB/RLS-only and can't drive
an actual HTTP request through the dispatcher or `createCrudHandler`; a real gap for a
feature that's otherwise fully built.

### TC-CORE-014: Messaging threads/templates render correctly across modules
**Feature:** `core.threads/messages/message_templates` (S-3), used by discovery
(email threads), FSM (job messages, F-11), and — as of this pass — CRM.
**Priority:** P1 · **Story:** S-3
**Update (this pass):** `core.messages.channel`'s check constraint only allowed
`'email'`/`'sms'` until `20260909080000_crm_channel_accounts.sql` extended it to
`'whatsapp'`/`'instagram'`/`'facebook_messenger'`/`'google_business_messages'` — the
four channels CRM's own inbound webhooks (`docs/design/crm-module-design.md` Part A)
normalize into this same shared table via `entity_type: 'crm_ticket'`, the same
polymorphic-thread pattern FSM's job messages already used with `'fsm_job'`.
**Steps:**
1. Send a message using a template with merge fields (e.g. customer name).
2. View the resulting thread from both a discovery context and an FSM job context (if
   the same underlying `core.messages` row is reachable from both).
3. Ingest a CRM inbound webhook message and confirm its `channel` value (e.g.
   `'whatsapp'`) is accepted by the constraint and the thread is reachable via
   `entity_type='crm_ticket'`, `entity_id=<ticket id>`.
**Expected result:** Merge fields render correctly; module-specific view of a shared
thread shows consistent content; a CRM channel value that predates this migration
(anything outside the five now-allowed values) is rejected at the database level, not
just silently miscategorized.

### TC-CORE-015: `createParty()`'s admin-client override bypasses RLS — only a no-session caller may use it
**Feature:** `packages/core/src/parties/mutations.ts#createParty` — extended this pass
(docs/design/crm-module-design.md Part A, A2) to accept an optional service-role
`client` override, the same shape `resolveAiModel()`/`getAccountIdForWorkspace()`
already use for their own webhook/no-session callers.
**Priority:** P0 · **Story:** security (this pass)
**Steps:**
1. Call `createParty(input)` with no `client` argument (every pre-existing caller) as
   a signed-in user who is *not* a member of `input.businessId`.
2. Call `createParty(input, adminClient)` (the only current caller: CRM's inbound
   webhook, `lib/tickets/ingest-inbound-message.ts`) for a business the *ingesting
   webhook request* has no session/membership in at all.
**Expected result:** Step 1 is rejected by `core.parties`' own `insert` RLS policy
(`business_id in (select core.user_account_ids())`-shaped) — the default parameter
never weakens the normal path. Step 2 succeeds precisely because the caller is a
webhook with no session to check membership for in the first place, same reasoning
`db/admin.ts`'s own docstring already gives for every other admin-client use in this
codebase — but this makes `createParty` the first core party-mutation with two
different security postures depending on which client a caller happens to pass, worth
watching if a future caller passes the admin client somewhere a real RLS check was
actually wanted.
**Automated coverage:** none yet — same DB/RLS-harness-can't-drive-TypeScript gap as
several other cases in this file.

### TC-CORE-016: Disabling a business hides it from the navbar without touching any of its data
**Feature:** `core.businesses.disabled_at` (item #17 of a UX pass, module-level Admin
> Business) — deliberately not a licensing concept (no grace period, no ADR-9
mechanics): a business is either shown in the switcher or not, and every product,
prospect, job, ticket, and document under it is completely untouched either way.
**Priority:** P1 · **Story:** this pass
**Steps:**
1. Disable a business from `/dashboard/settings` (`BusinessStatusButton`'s confirmation
   dialog).
2. Check the sidebar/topbar business switcher and the account-wide Executive Dashboard.
3. Navigate directly to `/dashboard/businesses/{disabledId}` by URL.
4. Query the business's own products/prospects/jobs/tickets/documents directly.
5. Re-enable the business.
**Expected result:** Step 2 no longer lists the disabled business anywhere
(`getAccountWorkspaceEntries()`'s own `.is("disabled_at", null)` filter feeds both the
nav and the account-wide dashboard). Step 3 still loads normally — disabling only
removes it from the nav-derived lists, it's not access-denied like a lapsed license.
Step 4 shows every row exactly as before, no cascade, no soft-delete flag flipped
anywhere else. Step 5 immediately restores it to the switcher.
**Automated coverage:** none yet — needs a live Postgres query plus a rendered nav
list; a real gap for a feature that's otherwise fully built and live-verified via
Supabase MCP during development.

## New this pass (2026-09-11/12) — Platform Admin Portal work reaching into `core`

The Platform Admin Portal (`docs/design/platform-admin-portal-audit.md`) is itself
architecturally distinct — `platform.*` tables are gated on `platform.is_superadmin()`,
never `tenant AND licensed` (CLAUDE.md's own carve-out) — and gets its own
`platform-admin.md`. The four cases below are the places that work reached into
`core`-schema/tenant-scoped territory instead, which DO belong here.

### TC-CORE-017: Every business is assigned a default plan at creation; existing businesses are backfilled, never left unassigned
**Feature:** `core.business_settings.plan` — now a real FK into `platform.plans.key`
(was free-text, defaulting `'starter'`, matching no real plan) + `core.
handle_new_business()` trigger.
**Priority:** P0 · **Story:** PLATFORM-P0-05.2
**Steps:**
1. Create a new business and check `core.business_settings.plan` immediately.
2. Check an existing business/settings row with a stale or missing plan value.
**Expected result:** (1) `plan='free'` immediately, not lazily on first module write.
(2) backfilled to `'free'` by the same migration, never left unassigned.
**Covers:** `scripts/test-core-business-settings-plan-fk.mjs` (13 assertions).

### TC-CORE-018: `core.usage_counters` + atomic consume never overshoots a configured limit under concurrency
**Feature:** `core.usage_counters` (new, business-scoped `core`-schema table — real
tenant data, not `platform.*`), `core.increment_usage_counter()`,
`core.try_consume_usage_counter()` (row-locked, atomic grant/deny+increment in one
transaction).
**Priority:** P0 · **Story:** PLATFORM-P0-06.1/06.3
**Steps:**
1. Attempt any direct client write to `core.usage_counters`.
2. Fire 10 concurrent `try_consume_usage_counter()` calls against an already-exhausted
   limit of 2.
3. Fire 10 concurrent callers racing for the last 3 of a limit of 3.
4. Attempt to decrement a counter below zero.
**Expected result:** (1) no write path exists — only the two named functions may write
a row. (2) all 10 denied, counter never overshoots. (3) exactly 3 granted. (4) clamps
at zero, never negative.
**Covers:** `scripts/test-core-usage-counters-rls.mjs`,
`scripts/test-core-try-consume-usage-counter-rls.mjs`.

### TC-CORE-019: The entitlement engine composes license + plan + platform-global layers, never fabricating a number
**Feature:** `packages/core/src/entitlements/` — `hasModule()`, `hasFeature()`,
`getLimit()`, `canConsume()`, each backed by a pure decision-builder, plus soft/hard
limit semantics and the platform-wide kill-switch/maintenance short-circuit.
**Priority:** P0 · **Story:** PLATFORM-P0-05.1–05.4, 06.1, 06.3, 06.5
**Steps:**
1. Check `getLimit()` for a denied module (platform-disabled, or unlicensed).
2. Check a `soft`-typed limit past its own guideline, and a `hard`-typed limit exactly
   at capacity.
3. Check `canConsume()` for a feature with no `plan_limits` row configured at all.
**Expected result:** (1) `limit`/`usage`/`remaining` are always `null`, never a
fabricated `0`. (2) soft grants with no ceiling; hard denies exactly at capacity. (3)
unconfigured means unrestricted (`allowed: true`), never silently denied.
**Covers:** `module-entitlement.test.ts`, `feature-entitlement.test.ts`,
`limit-entitlement.test.ts`, `scripts/test-core-plan-entitlement-lookup.mjs`.

### TC-CORE-020: Platform-wide kill switch and maintenance mode pre-empt a business's own license state
**Feature:** `packages/core/src/licensing/queries.ts#requireModule`/
`getPlatformModuleStatus`, `packages/core/src/db/middleware.ts#findPlatformDisabledModuleForRoute`.
**Priority:** P0 · **Story:** PLATFORM-P0-07.2/07.3
**Steps:**
1. Platform-disable/maintenance a module as a superadmin; load its route as a business
   with an active license.
2. Set the module `read_only` platform-wide; load the route, then attempt a write —
   unless the business's own license would already deny the write for its own reason.
3. Attempt to set `platform.modules.enabled` directly, as any role including
   `service_role`.
**Expected result:** (1) blocked, distinct copy ("not your licensing problem," no
"Go to Settings → Licenses" CTA). (2) route loads (unlike `disabled`/`maintenance`);
write throws `defaultPlatformReadOnlyMessage()` unless the business's own reason is
more specific. (3) impossible — `enabled` is `GENERATED ALWAYS` derived from `status`.
**Covers:** `scripts/test-platform-module-kill-switch-rls.mjs`,
`scripts/test-platform-module-status-rls.mjs`.
**Open gap:** no automated coverage yet for `requireModule()`'s actual TS-level throw/
ordering behavior — same DB-only-harness gap TC-CORE-002/013/015 already flag.
