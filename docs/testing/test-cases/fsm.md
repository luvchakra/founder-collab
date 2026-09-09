# Test cases: `fsm` (Field Service, stories F-1..F-15, built fresh)

Covers `packages/module-fsm/src/**`. Tenant is `business_id`. Includes public,
token-based customer-facing pages (`apps/web/app/p/**`) — those get their own
security-focused cases since they're the only routes in the platform meant to be
reachable without a login.

### TC-FSM-001: Opportunity → estimate → job pipeline stays linked
**Feature:** F-2 (opportunities) → F-3 (estimates) → F-5 (jobs).
**Priority:** P0 · **Story:** F-2, F-3, F-5
**Steps:**
1. Create an opportunity, generate an estimate from it, approve the estimate, convert to a job.
**Expected result:** Each stage references the one before it; the job carries forward
the estimate's line items, not a blank slate.

### TC-FSM-002: Public estimate page — approve/decline works without a login
**Feature:** F-4, the `/p/e/[token]` route.
**Priority:** P0 · **Story:** F-4
**Steps:**
1. Send an estimate; open its public link in a fresh, unauthenticated browser.
2. Approve it. In a second run, decline it.
**Expected result:** Both actions succeed without any auth; the token can't be reused
to view/act on a different business's estimate (token scoping, not sequential IDs).

### TC-FSM-003: Public estimate token can't be brute-forced or reused for another estimate
**Feature:** `lib/portal-tokens` security.
**Priority:** P0 · **Story:** F-4
**Steps:**
1. Take a valid token for Estimate A.
2. Attempt to use it (or a minimally modified version of it) to access Estimate B.
**Expected result:** Fails — tokens are unguessable and scoped to exactly one document.

### TC-FSM-004: Scheduling avoids double-booking a technician
**Feature:** F-6 (scheduling), including the deployment-fix commits around it.
**Priority:** P0 · **Story:** F-6
**Steps:**
1. Schedule a technician for a job in a given time slot.
2. Attempt to schedule the same technician for an overlapping slot.
**Expected result:** Blocked or explicitly warned — never silently double-booked.

### TC-FSM-005: Field execution captures time entries, signatures, attachments correctly
**Feature:** F-7.
**Priority:** P0 · **Story:** F-7
**Steps:**
1. Complete a job from the field view: log time, capture a signature, attach a photo.
**Expected result:** All three persist against the correct job and are visible from
the office-side job view afterward.

### TC-FSM-006: Invoicing — generate, send, pay, and void
**Feature:** F-8, all four verbs explicitly.
**Priority:** P0 · **Story:** F-8
**Steps:**
1. Generate an invoice from a completed job.
2. Send it.
3. Record a payment.
4. On a separate invoice, void it before payment.
**Expected result:** Generate/send/pay reconcile per TC-CORE-009; voiding removes it
from outstanding balances without deleting the record (audit trail preserved, echoing
ADR-9's "never delete" spirit even outside licensing).

### TC-FSM-007: Reminders fire on schedule, both internal and customer-facing
**Feature:** F-9.
**Priority:** P1 · **Story:** F-9
**Steps:**
1. Configure a reminder rule (e.g. "1 day before scheduled job").
2. Advance time to the trigger point (or run `api/cron/send-reminders` directly in test).
**Expected result:** Internal reminder appears for staff; customer reminder email
sends via the same Resend path discovery uses (`core.email`).

### TC-FSM-008: Customer center shows only that customer's own data
**Feature:** F-10, the `/p/center/[token]` public route.
**Priority:** P0 · **Story:** F-10
**Steps:**
1. Open a customer's center link.
2. Attempt to see another customer's jobs/invoices from within it.
**Expected result:** Strictly scoped to the one customer the token represents — same
token-isolation guarantee as TC-FSM-003.

### TC-FSM-009: Customer center contact form reaches the right business
**Feature:** F-10's contact form.
**Priority:** P1 · **Story:** F-10
**Steps:**
1. Submit the contact form from a customer center page.
**Expected result:** Message routes to the correct business (via `core.threads`/messages,
S-3), visible in that business's message view — not lost or misrouted to another tenant.

### TC-FSM-010: The nine MUST-scope reports return correct numbers
**Feature:** F-12.
**Priority:** P1 · **Story:** F-12
**Steps:**
1. Run each of the nine reports against known seed data with a hand-calculated
   expected result for at least one metric per report.
**Expected result:** Each report's numbers match the hand-calculation — this is the
one case in this file worth eventually promoting to an automated script, since
"reports lie" is a silent, hard-to-notice failure mode.

### TC-FSM-011: FSM ↔ inventory integration reserves and consumes parts correctly
**Feature:** F-14.
**Priority:** P0 · **Story:** F-14
**Preconditions:** Both `inventory` and `fsm` licensed.
**Steps:**
1. Add a part to a job (reserves stock in inventory).
2. Complete the job (should consume the reserved stock).
**Expected result:** Stock reserved on add, decremented on completion — not double-counted,
not left reserved-forever if the job is cancelled instead of completed (check that path too).

### TC-FSM-012: Low-stock banner degrades gracefully without inventory licensed
**Feature:** F-14's other half, ADR-10 applied to FSM's dependency on inventory.
**Priority:** P0 · **Story:** F-14
**Steps:**
1. With `inventory` not licensed for the business, view a job that would normally
   show a low-stock banner.
**Expected result:** No banner, no error — FSM's job view works normally without inventory.

### TC-FSM-013: Settings screens (service types, charge types, numbering) apply platform-wide within the business
**Feature:** F-15.
**Priority:** P1 · **Story:** F-15
**Steps:**
1. Add a custom service type and charge type.
2. Use them when creating a new job/invoice.
**Expected result:** Available immediately in the relevant dropdowns; numbering
settings (via `core.next_number`, D-5) apply to new documents from that point forward
without renumbering existing ones.

### TC-FSM-014: Messages tab on jobs uses the shared core messaging layer correctly
**Feature:** F-11.
**Priority:** P1 · **Story:** F-11
**Steps:**
1. Send a message from a job's Messages tab.
**Expected result:** Uses `core.threads/messages` (S-3) — confirm it's genuinely
shared with discovery's conversation system, not a parallel FSM-only messages table.

### TC-FSM-015: A viewer cannot create, edit, lose, or reopen an opportunity
**Feature:** F-2's `opportunities.edit` permission.
**Priority:** P0 · **Story:** F-2
**Background:** `core.permissions`/`core.role_permissions` (F-2's migration) declared
`opportunities.edit` as owner/admin-only from the start, but nothing ever called
`core.has_permission()` for it — fsm's own RLS is only the platform's uniform
"tenant AND licensed" policy, with no per-permission trigger the way e.g. inventory's
`sales_returns` has. In practice this meant any business member with the `viewer` role
could freely create, edit, lose, or reopen opportunities. Fixed this session by adding
`requirePermission(businessId, "opportunities.edit")` to `createOpportunity`,
`updateOpportunity`, `markOpportunityLost`, and `reopenLostOpportunity` in
`packages/module-fsm/src/lib/opportunities/mutations.ts`.
**Steps:**
1. As a business member with role `viewer`, attempt to create an opportunity.
2. As the same viewer, attempt to update an existing opportunity's description.
3. As the same viewer, attempt to mark an opportunity lost.
4. As the same viewer, attempt to reopen a lost opportunity.
5. Repeat all four as `owner`/`admin`.
**Expected result:** All four calls throw a clean, actionable error for the viewer
("You don't have permission to do this (opportunities.edit).") — never a raw Postgres
error, never a silent no-op success. Owner/admin succeed on all four.
**Automated coverage:** `scripts/test-fsm-workflow.mjs` verifies the underlying
`core.has_permission()` data (owner has the key, viewer doesn't) at the DB level; see
that script's own header comment for why the actual `requirePermission()` call site in
TypeScript is not yet exercised by an automated test (this repo's test harness is
raw-SQL-only — there's no TS-level harness yet that calls `createOpportunity()` etc.
directly as different roles).

### TC-FSM-016: A viewer cannot edit, send, approve, or decline an estimate (internal side)
**Feature:** F-3's `estimates.edit` permission.
**Priority:** P0 · **Story:** F-3
**Background:** Same gap and same fix pattern as TC-FSM-015, applied to
`packages/module-fsm/src/lib/estimates/mutations.ts`'s `getOrCreateEstimate`,
`sendEstimate`, `approveEstimateInternal`, and `declineEstimateInternal`.
**Steps:**
1. As a `viewer`, attempt to generate/get an estimate for an opportunity.
2. As the same viewer, attempt to send an existing draft estimate.
3. As the same viewer, attempt to internally approve/decline an estimate (the
   staff-side action, not the customer's public-token one — see TC-FSM-002).
4. Repeat as `owner`/`admin`.
**Expected result:** Viewer is denied on all four with the actionable permission
message; owner/admin succeed. The customer-facing, token-secured
`markEstimateViewed`/`approveEstimateByToken`/`declineEstimateByToken` functions are
deliberately NOT permission-gated (they're public/unauthenticated by design, secured by
an unguessable token instead — see TC-FSM-003) and must keep working for an
unauthenticated customer regardless of this fix.
**Known gap, intentionally not fixed here:** `addChargeLine`/`updateChargeLine`/
`deleteChargeLine`/`reorderChargeLines`/`recomputeAndPersistTotals` in the same file are
generic over any `core.documents` id and are reused as-is by invoices (no separate
`invoices.edit` permission key has ever been declared by a migration). Per CLAUDE.md's
"never implement speculative functionality," this session did not invent one — these
remain gated on module license only, not on a permission check. Flagging so a future
story that adds real invoice-side RBAC doesn't miss it.

### TC-FSM-017: A viewer cannot create or transition a job; only owner/admin can reopen a completed one
**Feature:** F-5's `jobs.edit` and `jobs.reopen` permissions.
**Priority:** P0 · **Story:** F-5
**Background:** Same gap as TC-FSM-015/016, applied to
`packages/module-fsm/src/lib/jobs/mutations.ts`. Every status-transition function
(`createJob`, `updateJob`, `markJobScheduled`, `startJob`, `holdJob`, `resumeJob`,
`completeJob`, `cancelJob`, `duplicateJob`, `convertJobToOpportunity`) now calls
`requirePermission(businessId, "jobs.edit")`. `reopenJob` specifically is gated on the
distinct `jobs.reopen` key instead (admin-only per the PRD §4) — its doc comment
previously *claimed* this was enforced when nothing actually checked it, so before this
fix any business member, including a `viewer`, could reopen a completed job.
**Steps:**
1. As a `viewer`, attempt each of: create a job, update a job, mark it scheduled, start
   it, hold it, resume it, complete it, cancel it, duplicate it, convert it back to an
   opportunity.
2. As an `admin` (not owner), complete a job, then attempt to reopen it.
3. As a `viewer`, attempt to reopen a completed job.
4. As `owner`, repeat step 3.
**Expected result:** Step 1's viewer is denied on every listed action with the
actionable permission message. Step 2's admin succeeds at reopening (`jobs.reopen` is
granted to owner AND admin, not owner-only — confirm against the actual
`role_permissions` seed rather than assuming). Step 3's viewer is denied even though a
`jobs.edit`-only role would not otherwise be blocked from every other job action —
`jobs.reopen` is checked separately from `jobs.edit`. Step 4 succeeds.
**Automated coverage:** `scripts/test-fsm-workflow.mjs` (DB-level `core.has_permission()`
check for all four keys including `jobs.reopen`) plus the full chain-linkage and
tenant-isolation assertions described in TC-FSM-001's automated equivalent. As with
TC-FSM-015, the actual application-layer `requirePermission()` call sites in
`jobs/mutations.ts` are not yet exercised by a TypeScript-level test — see the workflow
script's header comment for the honest scope statement.

### TC-FSM-018: Cross-tenant reference-smuggling is blocked even with a permission-fixed pipeline
**Feature:** Combines F-2/F-5's tenant-isolation trigger enforcement with the
permission fix above — regression coverage to confirm adding `requirePermission()`
calls didn't accidentally change tenant-isolation behavior.
**Priority:** P0 · **Story:** F-2, F-5
**Steps:**
1. As the owner of Business B (unlicensed relationship to Business A), attempt to
   insert a job in Business B that references a party or opportunity belonging to
   Business A.
**Expected result:** Blocked by the cross-tenant enforcement trigger
(`fsm.enforce_job_business_id`/`enforce_job_refs` per the schema migration), independent
of role/permission — this is a lower, DB-enforced layer that a permission grant can
never bypass.
**Automated coverage:** `scripts/test-fsm-workflow.mjs`, section 3 ("Bob cannot wire a
job in his own business to Alice's party").
