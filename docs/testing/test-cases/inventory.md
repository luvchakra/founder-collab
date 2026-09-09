# Test cases: `inventory` (ported from stockpilot-ai-ops, stories SP-3..SP-9)

Covers `packages/module-inventory/src/**`. Unlike `discovery`, this module's tenant is
`business_id` (ADR-4) — one inventory per business regardless of product count.
Compatibility views + `INSTEAD OF` triggers (ADR-11) let ported StockPilot code keep
querying by original table names while `core` owns the canonical data — several
cases below exist specifically to catch drift between the compat layer and `core`.

### TC-INVENTORY-001: Compat views read/write through to `core` correctly
**Feature:** SP-4's `INSTEAD OF` triggers.
**Priority:** P0 · **Story:** SP-4
**Steps:**
1. Insert a row via the legacy-named compat view (e.g. `products`).
2. Query the canonical `core`/`inventory` table it should have written to.
3. Update via the compat view; query canonical again.
**Expected result:** Both directions stay in sync — a write through the compat view
is indistinguishable from a write through the canonical table (`test-inventory-compat-views.mjs`
covers the RLS angle; this covers actual data-consistency).

### TC-INVENTORY-002: Procedural layer (stock adjustments, reservations) leaves no negative stock
**Feature:** SP-3b's procedural layer.
**Priority:** P0 · **Story:** SP-3b
**Steps:**
1. Reserve more stock than is available for an item (e.g. confirm a sales order whose
   lines exceed available quantity).
**Expected result:** Rejected with a clear insufficient-stock error — never allowed to
go negative (`test-inventory-procedural.mjs` covers the DB-constraint angle).
**Confirmed this pass — the UI-facing message is already clear, no fix needed:** the
open question this case used to carry ("confirm the UI-facing error message is equally
clear, not just the DB constraint") is resolved by reading the actual code path.
`confirm_sales_order()`'s own `raise exception 'Not enough available stock for %: need
%, have %', _short.sku, _short.quantity, _short.available` (procedural-layer migration)
names the specific SKU and both quantities. `confirmSalesOrder()`
(`packages/module-inventory/src/lib/sales-orders/mutations.ts`) does a plain
`if (error) throw error;`, and `@supabase/postgrest-js`'s `PostgrestError` genuinely
`extends Error`, so `err instanceof Error ? err.message : ...`-style UI catch blocks
(the same pattern audited in TC-CRM-005/TC-GST-007) correctly surface that exact
sentence rather than falling through to a generic "Something went wrong." — unlike the
callGsp/silent-UPDATE bugs found elsewhere this pass, there was nothing to fix here.

### TC-INVENTORY-003: Warehouses route scopes stock correctly per warehouse
**Feature:** SP-7 slice 1.
**Priority:** P0 · **Story:** SP-7 (slice 1)
**Steps:**
1. Create two warehouses for a business, each with stock for the same item.
2. View stock levels per warehouse.
**Expected result:** Quantities are correctly attributed per warehouse, and a
transfer between them (see TC-INVENTORY-006) is the only way stock moves between them.

### TC-INVENTORY-004: Products page — barcode/QR generation and CSV import
**Feature:** `1ec7e7e`.
**Priority:** P1 · **Story:** post-SP-7 enhancement
**Steps:**
1. Generate a barcode/QR label for a product.
2. Import a CSV of new products, including one row with a duplicate SKU.
**Expected result:** Label encodes the correct product identifier and scans back
correctly; CSV import creates the valid rows and reports the duplicate-SKU row as
skipped, not silently overwritten or erroring the whole batch.

### TC-INVENTORY-005: Suppliers and Customers routes don't cross-contaminate party roles
**Feature:** SP-7 slices 2 & 4, built on `core.parties`/`party_roles` (D-1).
**Priority:** P0 · **Story:** SP-7 (slices 2, 4)
**Steps:**
1. Create a party that is both a supplier and a customer for the same business
   (common for e.g. a distributor who also buys back returns).
**Expected result:** One `core.parties` row, both roles visible in their respective
lists — not two duplicate party records.

### TC-INVENTORY-006: Stock transfer between warehouses is atomic
**Feature:** SP-7d slice 2.
**Priority:** P0 · **Story:** SP-7d (slice 2)
**Steps:**
1. Transfer stock from Warehouse A to Warehouse B.
2. Simulate a failure partway through (e.g. kill the request after decrementing A).
**Expected result:** Either both sides update (A decremented, B incremented) or
neither does — no state where stock vanished from A without appearing in B.

### TC-INVENTORY-007: Purchase order → stock receipt updates inventory correctly
**Feature:** SP-7d slice 3.
**Priority:** P0 · **Story:** SP-7d (slice 3)
**Steps:**
1. Create a purchase order for an item.
2. Mark it received (full or partial).
**Expected result:** Stock increments by exactly the received quantity; a partial
receipt leaves the PO in a correct "partially received" state, not closed.

### TC-INVENTORY-008: Sales order → invoice → payment chain reconciles
**Feature:** SP-7d slices 4-5, `core.documents`/`payments` (D-6/D-7).
**Priority:** P0 · **Story:** SP-7d (slices 4, 5)
**Steps:**
1. Create a sales order, convert to a sales invoice.
2. Record a payment against the invoice.
**Expected result:** Sales order status reflects invoicing; invoice balance reflects
the payment, matching TC-CORE-009's document/payment reconciliation.

### TC-INVENTORY-009: Sales return approval creates a correct credit note
**Feature:** `67c83cb` — "create_credit_note + approve_sales_return," and
`924d16e`/SP-7d slice 6.
**Priority:** P0 · **Story:** SP-7d (slice 6)
**Steps:**
1. Submit a sales return against a paid invoice.
2. Approve it.
**Expected result:** A credit note is created for the correct amount; stock is
restored if the return is marked as restockable
(`test-sales-returns-workflow.mjs` likely covers part of this — confirm it covers
the full approve → credit note → stock path, not just the approval state change).

### TC-INVENTORY-010: GST-related fields split off cleanly to the `gst` module
**Feature:** `1bd4b2d` — "Move GST profile/e-Way Bill/e-Invoicing to their own gst
module."
**Priority:** P1 · **Story:** post-SP-7 restructure
**Steps:**
1. From an inventory sales invoice, trigger GST-related actions (e-Way Bill,
   e-Invoicing).
**Expected result:** These call into `gst`'s `contract/index.ts`, not inventory-local
GST code — confirm no GST logic was left duplicated in `module-inventory` after the move.

### TC-INVENTORY-011: Admin demo-data tool never runs against production
**Feature:** `026ecea` — "Admin section (platform-admin demo-data tool)."
**Priority:** P0 · **Story:** SP-7f
**Steps:**
1. Attempt to run the demo-data tool.
**Expected result:** Either environment-gated to non-production, or requires an
explicit confirmation that makes accidental production data pollution very hard —
confirm which, since CLAUDE.md's environment rules are strict about dev-vs-prod
(§ Environment, "Development must use ... the dev project only — never production").

### TC-INVENTORY-012: Public API (`/api/v1`) respects the same tenancy as the UI
**Feature:** SP-7 promotion of `public_api_v1` to core (SP-7, `5be83bf`).
**Priority:** P0 · **Story:** SP-7
**Steps:**
1. Call `/api/v1/[resource]` for inventory resources using an API key scoped to
   Business A, requesting a resource under Business B.
**Expected result:** Rejected — same guarantee as TC-CORE-013, specifically
exercised through inventory resources.

### TC-INVENTORY-013: module-inventory manifest/contract wired correctly for events
**Feature:** SP-9 — manifest + `contract/index.ts` + event wiring.
**Priority:** P1 · **Story:** SP-9
**Steps:**
1. Trigger an inventory event another module might care about (e.g. low stock).
2. Check `core.domain_events` and any consumer (e.g. FSM's low-stock banner, F-14).
**Expected result:** Event is published in the documented shape; `fsm`'s consumer
(if licensed) reacts correctly, and does nothing (not an error) if `fsm` isn't licensed.
