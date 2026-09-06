# StockPilot → CoFounderAI migration plan

> **Revision 1.1 — read `05-SP0-AUDIT-AND-GREENFIELD-REVISION.md` first.** The StockPilot audit is complete and the programme is now greenfield (new repo + new Supabase project); Part C of that document lists the corrections to this file.

**Objective:** the `inventory` module runs inside the CoFounderAI platform with (a) minimum code changes to the copied StockPilot source, (b) zero data loss, (c) no duplicated entities against `core`.

**Verified starting point** (read live from Supabase project `atdmyqahetqkbnrszega`, PG 17.6, ap-northeast-1):

40 tables, all with RLS enabled, all scoped by `org_id`:

```
profiles(237) organizations(5) organization_members(6)
warehouses(10) categories(8) suppliers(15) products(36)
stock_levels(19) stock_movements(25) stock_transfers(1) stock_transfer_items(1) alerts(4)
purchase_orders(12) purchase_order_items(21)
customers(9) sales_orders(3) sales_order_items(3) sales_order_counters
sales_invoices(1) sales_invoice_items(1) sales_invoice_counters
sales_returns(1) sales_return_items(1) sales_return_counters
credit_notes credit_note_counters debit_notes proforma_invoices
eway_bill_credentials eway_bills einvoice_credentials einvoices
permissions(36) role_permissions(196) audit_log(3)
api_keys api_key_secrets api_rate_limit_counters
demo_seed_batches(1) demo_seed_records(35)
```

Row counts are small — this is a young product with demo data. **That is good news: the migration risk is schema/code risk, not data-volume risk.**

---

## 1. Two collisions that force the design

**Collision A — `products`.** CoFounderAI's `public.products` is a *tenancy tier* (a product a founder markets, parent of a workspace). StockPilot's `products` is a *SKU*. Same name, same database, unrelated meanings. CoFounderAI's cannot be renamed — it is live and referenced by `workspaces.product_id` and every RLS helper.

**Collision B — `customers` / `suppliers` vs `prospects`.** StockPilot's `customers` and CoFounderAI's `prospects` are the same real-world noun at different lifecycle stages. Copying StockPilot's `customers` in as-is would permanently duplicate every account that discovery already knows about, and would guarantee that FSM later adds a third copy.

**Resolution:** dedicated `inventory` schema + canonical `core` tables + **updatable compatibility views that preserve StockPilot's exact table and column names.** The copied code keeps writing `from('products')` and `from('customers')`; PostgREST resolves those inside the `inventory` schema; the views map to `core.items` and `core.parties`.

---

## 2. Table-by-table disposition

| StockPilot table | Disposition | Target |
|---|---|---|
| `organizations` | **merge** | `core.businesses` + `core.business_settings` (gstin, state, gst_registration_type, currency, timezone, plan, slug, industry). Compat: updatable view `inventory.organizations` |
| `organization_members` | **merge** | `core.account_members` (account role) + `core.business_members` (business role). Compat view `inventory.organization_members` |
| `profiles` | **merge** | `core.user_profiles`. Compat view |
| `customers` | **merge** | `core.parties` (role `customer`) + `core.addresses` (billing/shipping) + `core.tax_identities` (gstin). Compat: updatable view `inventory.customers` with `INSTEAD OF` triggers |
| `suppliers` | **merge** | `core.parties` (role `supplier`) + `core.addresses` + supplier attrs (`code`, `payment_terms`, `lead_time_days`, `rating`, `min_order_quantity`) in `core.party_supplier_attrs`. Compat view |
| `products` | **merge** | `core.items` (kind `good`) + `core.item_inventory_attrs` (reorder_point, reorder_quantity, barcode). Compat: updatable view `inventory.products` |
| `categories` | **merge** | `core.item_categories`. Compat view |
| `sales_orders`, `sales_order_items` | **merge** | `core.documents` (`doc_type='sales_order'`, `source_module='inventory'`) + `core.document_lines`. Compat views |
| `sales_invoices`, `sales_invoice_items` | **merge** | `core.documents` (`doc_type='invoice'`) + lines. Compat views |
| `purchase_orders`, `purchase_order_items` | **merge** | `core.documents` (`doc_type='purchase_order'`) + lines. Compat views |
| `credit_notes`, `debit_notes`, `proforma_invoices`, `sales_returns`, `sales_return_items` | **merge** | `core.documents` with respective `doc_type` (+ `inventory.sales_return_lines_stock` for the stock-effect fields, if any) |
| `*_counters` (4 tables) | **replace** | `core.number_sequences` (business_id, scope, prefix, fiscal_year, next_value). Compat views returning the same shape |
| `warehouses` | **move as-is** | `inventory.warehouses` (org_id → business_id FK, column name kept) |
| `stock_levels`, `stock_movements`, `stock_transfers`, `stock_transfer_items`, `alerts` | **move as-is** | `inventory.*` — genuinely inventory-owned, no merge |
| `permissions`, `role_permissions` | **promote** | `core.permissions`, `core.role_permissions`. StockPilot's `module` column already anticipates multi-module; seed `discovery`/`fsm`/`crm`/`gst` keys alongside |
| `audit_log` | **promote** | `core.audit_log` |
| `api_keys`, `api_key_secrets`, `api_rate_limit_counters` | **promote** | `core.api_keys` etc.; `permissions` array gains module-qualified keys |
| `eway_bills`, `eway_bill_credentials`, `einvoices`, `einvoice_credentials` | **move to gst module** | `gst.*` — these are the seed of the GST module, not inventory. All four are currently empty, so this is a free win |
| `demo_seed_batches`, `demo_seed_records` | **move as-is** | `inventory.*` (dev tooling; keep, it's useful) |

**Net effect:** inventory ends up owning ~10 tables instead of 40, `core` gains the shared ones, `gst` starts with real e-invoicing scaffolding, and no concept exists twice.

---

## 3. Keeping the code changes minimal — the four mechanisms

### M1. Schema targeting (one file changed)
StockPilot's Supabase client factory gets `.schema('inventory')` (or `db: { schema: 'inventory' }` in `createClient` options). Every `from('products')` call in the copied code then resolves to `inventory.products`. Add `inventory` to the project's PostgREST *Exposed schemas*.
`[ASSUMPTION]` — this holds only if the client is created in a small number of places. **Story `SP-0` verifies it.**

### M2. `org_id` is kept as a column name
Every migrated table keeps the literal column `org_id`. Its FK changes from `organizations(id)` to `core.businesses(id)`, and since `core.businesses.id` is populated with **the original organization UUIDs**, existing data needs no rewrite and existing queries need no edit. Only the *resolution* changes: whatever helper returns "the current org id" now returns the active `business_id`.

### M3. Compatibility views with the original shapes
Example — `inventory.customers` keeps StockPilot's exact 12 columns:

```sql
create view inventory.customers as
select p.id,
       p.business_id            as org_id,
       p.name,
       ti.gstin,
       p.phone, p.email,
       ba.formatted             as billing_address,
       sa.formatted             as shipping_address,
       coalesce(ti.state_code, ba.state) as state,
       p.is_active,
       p.created_at, p.updated_at
from core.parties p
join core.party_roles r on r.party_id = p.id and r.role = 'customer'
left join core.tax_identities ti on ti.party_id = p.id
left join core.addresses ba on ba.party_id = p.id and ba.kind = 'billing'  and ba.is_primary
left join core.addresses sa on sa.party_id = p.id and sa.kind = 'shipping' and sa.is_primary;
```
Joined views are not auto-updatable, so each write-target view gets `INSTEAD OF INSERT/UPDATE/DELETE` triggers that fan out to `core.parties` / `party_roles` / `addresses` / `tax_identities`. Single-table views (`inventory.products` over `core.items` + attrs) are simpler but still need triggers because of the attrs join.

**Rule:** a compat view must never change a column's name, type, or nullability versus the source system. If StockPilot returned `numeric`, the view returns `numeric`.

### M4. RLS rewritten once, centrally
Drop StockPilot's `organization_members`-based policies. Every migrated table gets the platform's standard pair:
```sql
using (org_id in (select core.user_business_ids())
       and core.has_module(org_id, 'inventory'))
```
Views inherit the security of their base tables when created with `security_invoker = true` (PG 15+; the project is PG 17 — set it explicitly). Base-table RLS in `core` therefore still applies through the views. **This is the single most security-critical line of the migration — it gets its own test story.**

**Expected code diff in the copied StockPilot source:** the Supabase client file (M1), the org-resolution helper (M2), the auth/session bootstrap (platform session replaces StockPilot's own), plus deleting StockPilot's login/signup pages and its org-creation flow (the platform owns both). Everything else — queries, components, server actions, types — should compile unchanged. **If that turns out to be false, stop and replan rather than hand-editing dozens of files.**

---

## 4. Execution sequence

### `SP-0` — Source audit (blocking, read-only)
Get access to the private repo. Record: framework + versions, Supabase client instantiation sites, org-id resolution, auth flow, route structure, server actions vs API routes, generated DB types location, test setup, env vars, any Edge Functions, any storage buckets, any cron/webhooks. **Output:** a one-page findings note that either confirms M1–M4 or triggers a replan. Nothing else starts until this exists.

### `SP-1` — Identity decision
Both projects are Supabase PG 17.6, so migrating `auth.users` with preserved UUIDs is viable. Decide between:
- **(A) Preserve UUIDs** — copy the relevant `auth.users` rows (only those referenced by the 5 real orgs, not all 237 profiles) into the platform project, keeping ids, emails, encrypted passwords, confirmed_at. All `created_by` / `actor_id` / `user_id` FKs then load untouched. Preferred.
- **(B) Remap** — create `core.user_id_map(old_id, new_id)`, invite users fresh, rewrite every user FK during load. Safer legally/operationally if password hashes shouldn't move, costs a rewrite pass.
Whichever is chosen, the 232 orphan/demo profiles are *not* migrated.

### `SP-2` — Core schema DDL
`core.parties`, `party_roles`, `party_contacts`, `party_supplier_attrs`, `addresses`, `tax_identities`, `items`, `item_categories`, `item_inventory_attrs`, `documents`, `document_lines`, `payments`, `payment_allocations`, `number_sequences`, `businesses`/`business_settings` extension, `user_profiles`, `employees`, `permissions`, `role_permissions`, `audit_log`, `api_keys*`. Full RLS. Migration files live in the single platform timeline.

### `SP-3` — Inventory schema DDL
`inventory.warehouses`, `stock_levels`, `stock_movements`, `stock_transfers`, `stock_transfer_items`, `alerts`, `demo_seed_*` — column-identical to StockPilot including `org_id`, plus platform RLS. `gst.eway_bills`, `gst.eway_bill_credentials`, `gst.einvoices`, `gst.einvoice_credentials` (empty tables, structure preserved).

### `SP-4` — Compatibility views + `INSTEAD OF` triggers
One view per merged table (§2). Each view ships with a test that inserts, updates, selects and deletes through the view and asserts the effect on the underlying `core` tables. Any view that can't round-trip is a blocker.

### `SP-5` — Data migration
1. `pg_dump --data-only --table=public.<t>` from source per table (or `COPY ... TO` via the MCP/psql), into a staging schema `sp_import` in the platform project.
2. Transform + load in dependency order: users → businesses/settings → profiles/employees → parties (customers, then suppliers) → addresses → tax identities → item_categories → items + attrs → warehouses → stock_levels → stock_movements → documents (POs, SOs, invoices, returns) → document_lines → payments → number_sequences (seeded from the `*_counters` current values, **plus a safety margin so no number is ever reissued**) → permissions/role_permissions → audit_log.
3. Every insert carries `legacy_id` in a `source_ref jsonb` column so the mapping is auditable and re-runnable.
4. The whole load is one idempotent, re-runnable SQL script (upsert on `legacy_id`), not a one-shot.

### `SP-6` — Verification
- **Row parity:** count per source table vs count reachable through the corresponding compat view. Must match exactly.
- **Value parity:** checksum a canonical projection of each table (ordered, cast to text, `md5(string_agg(...))`) source vs target.
- **Financial parity:** sum of `total_amount`, tax components, and per-warehouse `quantity/reserved/incoming` must match to the cent/unit.
- **Referential parity:** zero orphan FKs.
- **Numbering:** next generated SO/invoice number > max existing number.
- **App parity:** a manual checklist walking StockPilot's main flows in the migrated app (create product, receive PO, transfer stock, raise SO, invoice it, return it) and comparing against the old app side by side.

### `SP-7` — Code port
Copy source into `packages/module-inventory/`, apply the three/four changes from §3, delete auth/org-creation screens, wire `manifest.ts` (nav, routes, permissions, license key `inventory`), publish/consume events (`stock.low`, `job.completed` handler), export `contract/index.ts` with at minimum: `reserveStock`, `releaseStock`, `consumeStock`, `getAvailability`, `listWarehouses`, `upsertItem` — every one returning a typed `MODULE_NOT_LICENSED` variant.

### `SP-8` — Cutover
Freeze writes on the old project → final delta load → verification → point users at the platform → keep the old Supabase project read-only for 30 days as rollback (do not delete). Rollback plan: the platform's inventory data is additive and namespaced, so rollback is "send users back to the old URL", not a data restore.

---

## 5. Things that will bite, and the answer to each

| Issue | Answer |
|---|---|
| `USER-DEFINED` column types (`organization_members.role`, `purchase_orders.status`, `sales_orders.status`, `sales_invoices.payment_status`) are Postgres **enums** | Dump the enum definitions first (`pg_type`/`pg_enum`) and recreate them in the target *before* the tables. Enum values must match exactly or the load fails silently on cast. Prefer keeping them as enums in `inventory`, but `core.documents.status` should be `text + check` so FSM/GST can extend it without an `ALTER TYPE` |
| `core.documents` must satisfy SO, invoice, PO, credit note, debit note, proforma, return, *and* FSM estimates | Superset columns + `doc_type` check + per-type partial unique indexes on `(business_id, doc_type, number)` + per-type views (`inventory.sales_orders` etc.). Keep `cgst_amount`/`sgst_amount`/`igst_amount` as first-class columns — they're on every StockPilot money table already |
| `sales_order_items` has `org_id` **and** `sales_order_id` | Keep the denormalised `org_id` on `core.document_lines` too — it makes RLS one hop instead of two, and matches what StockPilot already relies on |
| `products.tax_rate` and `hsn_code` are per-item; FSM needs per-line overrides | `core.document_lines` carries its own `tax_rate`, `hsn_code`, `taxable` copied at line creation. Never resolve tax by joining live to the item — historical documents must not change when a price or rate changes |
| 237 `profiles` vs 6 `organization_members` | Migrate only real users (§`SP-1`). Everything else is demo residue |
| StockPilot storage buckets (product images: `products.image_url`) | Enumerate buckets in `SP-0`; copy objects to the platform project and rewrite URLs during `SP-5`. If images are external URLs, nothing to do |
| Demo-seed tooling references table names directly | It moves to `inventory` unchanged and keeps working through the views; add a platform guard so it can never run against a business with real data |
| Two apps writing the same numbering sequence during a dual-run | Don't dual-run. Freeze-and-cut (`SP-8`) |
