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
