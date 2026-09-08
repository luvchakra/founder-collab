# Test cases: `gst` (stories: GST profile/e-Way Bill/e-Invoicing split-off, S-2 filing)

Covers `packages/module-gst/src/**`. Split out from `inventory` (`1bd4b2d`) so other
modules' documents (FSM invoices, inventory sales invoices) can call into GST
features without `inventory` owning GST logic directly — the cross-module contract
boundary is the main thing worth testing here, on top of GST correctness itself.

### TC-GST-001: e-Way Bill and e-Invoicing credentials are encrypted and business-scoped
**Feature:** `b857eb3` — credential settings forms, `test-gst-credentials-rls.mjs` covers RLS.
**Priority:** P0 · **Story:** post-split settings
**Steps:**
1. Save e-Way Bill/e-Invoicing credentials for Business A.
2. Inspect the stored value directly in the database.
**Expected result:** Encrypted at rest (same standard as BYOK keys in `core.crypto`,
TC-BYOK-style expectation carried over from discovery) — not plaintext.

### TC-GST-002: GST Filing generation history records every generation attempt
**Feature:** `b2a6f6d` — generation-history tables + `document.issued` consumer.
**Priority:** P0 · **Story:** S-2
**Steps:**
1. Trigger GST filing generation for an issued document.
2. Check the generation-history table.
**Expected result:** A history row exists with the correct status (success/failure)
and links back to the source document — including for a deliberately-failed
generation (e.g. malformed GSTIN), which should still be recorded, not silently dropped.

### TC-GST-003: Manual generate/cancel UI matches the recorded history state
**Feature:** S-2's manual generate/cancel actions.
**Priority:** P1 · **Story:** S-2
**Steps:**
1. Manually cancel a previously generated filing.
**Expected result:** Generation-history reflects the cancellation; re-generating
afterward creates a new history entry rather than mutating the cancelled one
(audit-trail preservation, same principle as TC-FSM-006's void behavior).

### TC-GST-004: Inventory sales invoices call GST via contract, not direct import
**Feature:** Cross-module boundary enforcement (ADR non-negotiable #3), specifically
for the inventory→gst path noted in `inventory.md` TC-INVENTORY-010.
**Priority:** P0 · **Story:** post-split
**Steps:**
1. Search `module-inventory`'s source for any import reaching into
   `module-gst/src/lib/**` or `src/db/**` directly (not `src/contract`).
**Expected result:** None found — `lint:boundaries` should already catch this in CI;
this case is the manual spot-check to run if that lint rule itself is ever suspected
of a gap.

### TC-GST-005: GST module degrades gracefully when not licensed
**Feature:** ADR-10, applied to the FSM/inventory→GST handoffs.
**Priority:** P0 · **Story:** ongoing
**Steps:**
1. With `gst` not licensed, issue an invoice from `fsm` or `inventory` that would
   normally trigger GST filing.
**Expected result:** Invoice issues normally; the GST contract call returns
`MODULE_NOT_LICENSED` and the caller proceeds without error — no filing attempted,
no crash.

### TC-GST-006: e-Way Bill/e-Invoicing route completes the module's sidebar scope
**Feature:** `af7a35b` — "completes the GST module's 4 sidebar menu items."
**Priority:** P2 · **Story:** af7a35b
**Steps:**
1. Confirm all 4 documented sidebar menu items for `gst` are reachable and none 404.
**Expected result:** All 4 present and functional — a regression guard for this
specific "completes the scope" commit, so a future refactor doesn't quietly drop one.
