# Test cases: `crm` (skeleton, stories S-1..S-3)

Covers `packages/module-crm/src/**`. Newest module — still described as a
"skeleton" in `CLAUDE.md`, so this file is deliberately short. Extend it story by
story as `crm` grows past S-3, per `TESTING_STRATEGY.md`'s policy — don't let it sit
at three cases while the module grows past skeleton status.

### TC-CRM-001: Tickets route correctly via routing rules
**Feature:** S-1 (channels, tickets, routing rules).
**Priority:** P0 · **Story:** S-1
**Steps:**
1. Configure a routing rule (e.g. by channel or keyword).
2. Create a ticket matching that rule.
**Expected result:** Ticket assigns/routes per the rule, not to a default/unassigned
bucket.

### TC-CRM-002: Multiple channels feed into one ticket queue without cross-talk
**Feature:** S-1's channel model.
**Priority:** P1 · **Story:** S-1
**Steps:**
1. Create tickets from two different channels for the same business.
**Expected result:** Both appear in the business's ticket queue, correctly tagged
with their originating channel; no channel-specific data leaks into the other's ticket view.

### TC-CRM-003: `core.threads/messages` reused correctly for ticket conversations
**Feature:** S-3, shared messaging layer (same table as discovery/FSM).
**Priority:** P0 · **Story:** S-3
**Steps:**
1. Exchange several messages on a ticket.
**Expected result:** Thread persists and displays correctly via the shared
`core.threads/messages`, consistent with TC-FSM-014's and TC-CORE-014's expectations
for the same underlying tables.

### TC-CRM-004: `crm` RLS holds even at skeleton stage
**Feature:** Sanity check that `test-crm-rls.mjs` (already in `test:db`) stays
green as CRM grows — not a new case so much as a standing reminder.
**Priority:** P0 · **Story:** ongoing
**Steps:**
1. Run `node scripts/test-crm-rls.mjs` after any CRM schema change.
**Expected result:** Passes; if it doesn't, that's a release blocker regardless of
which other CRM feature was being worked on.
