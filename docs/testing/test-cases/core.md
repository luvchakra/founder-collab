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
1. Activate a license for a module the business doesn't have yet.
2. Load that module's route in `proxy.ts`'s guard.
3. Attempt a write action inside it.
**Expected result:** Route resolves (was previously 404'd per the "don't advertise
unlicensed routes" rule), write succeeds, and `has_module_write()` returns true.

### TC-CORE-002: Cancelling a license starts the 30-day read-only grace, not immediate denial
**Feature:** ADR-9's core guarantee.
**Priority:** P0 · **Story:** C-4
**Steps:**
1. Cancel an active license.
2. Immediately attempt a read, then a write, in that module.
**Expected result:** Read succeeds; write is denied. `core.license_events` records the
cancellation with a timestamp the 30-day window is computed from.

### TC-CORE-003: Grace period expiry moves to full denial without deleting data
**Feature:** ADR-9, second half.
**Priority:** P0 · **Story:** C-4
**Steps:**
1. Advance a cancelled license past its 30-day grace window (via a backdated
   `license_events` row in a test environment, not a real 30-day wait).
2. Attempt a read.
3. Query the module's tables directly at the database level.
**Expected result:** Read is denied (RLS, not just UI hiding). Rows still physically
exist, untouched.

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

### TC-CORE-013: API keys scope correctly to their business and permissions
**Feature:** `core.api-v1/keys` (ported SP-7, `test-core-api-keys.mjs` covers RLS —
this covers the actual request-scoping behavior).
**Priority:** P0 · **Story:** SP-7 (promoted to core)
**Steps:**
1. Create an API key scoped to Business A.
2. Call `/api/v1/[resource]` with that key, requesting a resource under Business B.
**Expected result:** Rejected — a key never reaches across businesses regardless of
which resource ID is requested.

### TC-CORE-014: Messaging threads/templates render correctly across modules
**Feature:** `core.threads/messages/message_templates` (S-3), used by both discovery
(email threads) and FSM (job messages, F-11).
**Priority:** P1 · **Story:** S-3
**Steps:**
1. Send a message using a template with merge fields (e.g. customer name).
2. View the resulting thread from both a discovery context and an FSM job context (if
   the same underlying `core.messages` row is reachable from both).
**Expected result:** Merge fields render correctly; module-specific view of a shared
thread shows consistent content.
