# Test cases: `crm` (skeleton, stories S-1..S-3)

Covers `packages/module-crm/src/**`. Newest module — still described as a
"skeleton" in `CLAUDE.md`, so this file is deliberately short. Extend it story by
story as `crm` grows past S-3, per `TESTING_STRATEGY.md`'s policy — don't let it sit
at three cases while the module grows past skeleton status.

**Deliberate scope, confirmed against the actual schema migration
(`20260908130000_crm_schema.sql`'s own docstring):** `crm` today is structure only —
`channels`/`tickets`/`routing_rules` tables, tenant+license RLS, and cross-tenant
reference-smuggling triggers, same as every other module's schema-first story. There is
no fine-grained permission model yet (unlike `fsm`'s `opportunities.edit` etc. — that
arrives with whichever future story builds the real feature) and, importantly for
TC-CRM-001 below, **no routing engine yet either**: `routing_rules` rows can be created
and toggled, but nothing in `packages/module-crm/src/lib/tickets/mutations.ts#createTicket`
reads them or auto-assigns a new ticket. `channelId` is an optional, caller-supplied
field on ticket creation, not something derived by matching a rule.

### TC-CRM-001: Routing rules are stored and toggleable, but do not yet route anything automatically
**Feature:** S-1 (channels, tickets, routing rules).
**Priority:** P1 · **Story:** S-1
**Correction:** this case previously described `crm` as if it already had a working
auto-routing engine ("ticket assigns/routes per the rule"). It does not — verified by
reading `createTicket()` and confirming no code path anywhere in `module-crm` ever
selects from `routing_rules` and applies a match. Re-scoped to what the skeleton
actually does, with the missing behavior called out explicitly rather than silently
dropped, since "the test case describes something unbuilt" is exactly the kind of
plan/reality mismatch this doc is supposed to catch.
**Steps:**
1. Create a routing rule (`createRoutingRule`) scoping it to a channel and an employee.
2. Create a new ticket against that same channel, without specifying `assigned_to`.
3. Toggle the rule inactive (`setRoutingRuleActive(id, false)`) and inactive again.
**Expected result (current, accurate):** The rule persists and its `is_active` flag
toggles correctly; the ticket from step 2 is created unassigned (`assigned_to` is
`null`) regardless of the rule — nothing auto-assigns it. **Expected result once a real
routing story lands:** step 2's ticket should come back pre-assigned to the rule's
`assign_to_employee_id`; when that story ships, update this case's "current, accurate"
half rather than leaving it stale.
**Automated coverage:** `scripts/test-crm-rls.mjs` creates and reads back a routing
rule's `is_active` default; it does not (and, per the above, should not yet) assert any
auto-assignment behavior.

### TC-CRM-002: Multiple channels feed into one ticket queue without cross-talk
**Feature:** S-1's channel model.
**Priority:** P1 · **Story:** S-1
**Steps:**
1. Create tickets from two different channels for the same business.
**Expected result:** Both appear in the business's ticket queue, correctly tagged
with their originating channel; no channel-specific data leaks into the other's ticket view.
**Automated coverage:** `scripts/test-crm-rls.mjs` (tenant-isolation section) — creates
Alice's and Bob's tickets against their own separate channels and confirms neither
business's query surfaces the other's rows.

### TC-CRM-003: Ticket conversations do not yet use the shared `core.threads/messages` layer
**Feature:** S-1's inbox screen.
**Priority:** P2 · **Story:** S-1 (S-3's own message-ingestion consumer not yet built for `crm`)
**Correction:** this case previously claimed tickets already round-trip through
`core.threads/messages` the same way `fsm`'s job Messages tab does (TC-FSM-014). They
don't yet — confirmed by reading `components/tickets/inbox-view.tsx`'s own doc comment:
"no message thread view, no automatic ticket-from-message ingestion... a later story's
own scope, per `00-MASTER-PLAN.md` §5's `message.received | core | crm (triage)` event
row." `crm`'s current inbox is a manually-created ticket list only.
**Steps:**
1. Create a ticket manually via `createTicket`.
2. Confirm there is no UI or backend path on this ticket that reads/writes
   `core.threads`/`core.messages`.
**Expected result (current, accurate):** No message thread exists for a ticket; the
inbox shows ticket metadata (subject, status, assignment) only. **Expected result once
the real triage/ingestion story lands:** re-test against TC-FSM-014's own expectations
(shared table, not a parallel CRM-only messages table) and promote this case's priority
back to P0.

### TC-CRM-004: `crm` RLS holds even at skeleton stage, including the grace-period read/write split (ADR-9)
**Feature:** Sanity check that `test-crm-rls.mjs` (already in `test:db`) stays
green as CRM grows, extended this pass to explicitly cover ADR-9's licensing
lifecycle for CRM's own tables specifically (previously only exercised generically via
`fsm` data in `test-core-license-lifecycle.mjs`).
**Priority:** P0 · **Story:** ongoing
**Steps:**
1. With no `crm` license at all, confirm both read and write are denied.
2. With a `grace`-status license (not yet expired), confirm reads of existing
   channels/tickets/routing rules still succeed, but both new inserts and updates to
   existing rows are denied.
3. Reactivate the license and confirm writes succeed again.
4. Run `node scripts/test-crm-rls.mjs` after any CRM schema change.
**Expected result:** All of the above hold — a lapsed license degrades to read-only
per ADR-9's "cancelling a license never deletes data" guarantee, it doesn't either wipe
data or keep write access; reactivating restores full read/write immediately. Passes;
if it doesn't, that's a release blocker regardless of which other CRM feature was being
worked on.
**Automated coverage:** `scripts/test-crm-rls.mjs`, "Cancelling back into grace" section.

### TC-CRM-005: An update denied by a lapsed license fails with a real, actionable error — not a silent no-op
**Feature:** `updateTicketStatus`/`assignTicket`/`setChannelActive`/`setRoutingRuleActive`
in `packages/module-crm/src/lib/{tickets,channels,routing-rules}/mutations.ts`.
**Priority:** P0 · **Story:** error-message audit (this pass)
**Background — a real bug found and fixed this session:** Postgres RLS's `using`
clause on an `UPDATE` silently excludes non-matching rows from the affected set rather
than raising an error (unlike an `INSERT`'s `with check`, which does throw). Before this
fix, all four of the functions above did a plain `.update(...).eq("id", ...)` with no
`.select()` and only checked `error` — so if the target row's RLS check failed (most
realistically: the business's `crm` license had lapsed into its read-only grace period
between page load and the button click), the call would return successfully having
changed nothing, with no error, no thrown exception, and no way for the caller to tell
the user why their click did nothing. Fixed by adding `.select("id")` and throwing an
actionable `Error` when the returned array is empty, mirroring the same
zero-rows-means-denied pattern `fsm`'s `jobs/mutations.ts#transition()` already used for
its own status-transition guards (see TC-FSM-017).
**Steps:**
1. License a business for `crm`, create a ticket.
2. Let (or force, for the test) the license lapse into `grace`.
3. Call `updateTicketStatus` on the existing ticket.
4. Repeat for `assignTicket`, `setChannelActive` (on an existing channel), and
   `setRoutingRuleActive` (on an existing routing rule).
**Expected result:** All four throw `"This <ticket/channel/routing rule> could not be
updated -- it may have been removed, or your access to it may have changed."` — a
clean, actionable message a UI can toast directly — instead of silently succeeding with
zero rows changed.
**Automated coverage:** `scripts/test-crm-rls.mjs` proves the underlying DB-level fact
(a grace-period `UPDATE` returns zero rows via `returning id`, not an error) that this
fix's `.select("id")` + length check now correctly surfaces as a thrown error at the
application layer. As with `fsm`'s permission checks (TC-FSM-015..017), this repo's
harness is raw-SQL only, so the actual TypeScript `throw new Error(...)` call sites in
`mutations.ts` are not independently exercised by an automated test yet — this is the
same structural testing-boundary gap noted throughout this pass, not unique to CRM.
