-- Fixes a real, pre-existing correctness bug in the SP-4 compat-view layer, documented
-- in docs/PORT-PROVENANCE.md's `public_api_v1` entry: `sales_orders_instead_of_insert()`
-- and `purchase_orders_instead_of_insert()` never referenced `new.subtotal`/
-- `new.cgst_amount`/`new.sgst_amount`/`new.igst_amount`/`new.total_amount` in their own
-- `INSERT INTO core.documents`, even though both `module-inventory`'s own UI mutations
-- (`lib/{sales-orders,purchase-orders}/mutations.ts`) and the public API
-- (`api-v1/resources/{sales-orders,purchase-orders}.server.ts`) compute and post these
-- exact fields on create. (`tax_amount` itself is a derived view column --
-- `cgst_amount + sgst_amount + igst_amount`, see the `inventory.purchase_orders`/
-- `sales_orders` view definitions -- not a real `core.documents` column, so there is
-- nothing for a trigger to persist for it directly.)
--
-- In the common case (>=1 line item, inserted right after the header in the same
-- request) this silently self-healed: `core.recompute_document_totals()`'s own AFTER
-- trigger on `core.document_lines` recomputes `subtotal`/`cgst`/`sgst`/`igst`/
-- `total_amount` from the lines moments later, overwriting whatever the header insert
-- actually discarded. It did NOT self-heal for a header created with zero line items (a
-- legitimate state -- a draft order with no lines yet) that also carries a nonzero
-- `discount_amount`/`shipping_amount`: no `document_lines` row ever exists to fire the
-- recompute trigger, so `total_amount` stayed silently stuck at `core.documents`' own
-- default (`0`) instead of `shipping_amount - discount_amount`. It also left a
-- transient window where the exact row the insert's own `RETURNING`/`.select()` hands
-- back momentarily showed stale/zeroed totals, before the very next statement (the
-- line-items insert) corrected it server-side.
--
-- Fix: have `..._instead_of_insert()` write whatever the caller posted, same as
-- `discount_amount`/`shipping_amount` already did. `core.recompute_document_totals()`
-- still overwrites these the moment a line item lands, so this changes nothing about
-- the already-correct lines-exist behavior and only fixes the zero-line edge case plus
-- the transient-read window.
--
-- The UPDATE-side triggers (`..._instead_of_update()`) are deliberately left
-- unchanged, on inspection: `core.documents` already carries a second, pre-existing
-- trigger (`documents_recompute_totals_on_discount_shipping_change`, `core_documents`
-- migration) that fires `core.recompute_document_totals()` -- authoritatively, from
-- `core.document_lines` -- on *every* update through either compat view, because both
-- `_instead_of_update()` functions always include `discount_amount`/`shipping_amount`
-- in their own `UPDATE core.documents ... SET` list. That trigger always wins (it fires
-- after `_instead_of_update()`'s own statement completes), so any attempt to also set
-- `subtotal`/`cgst_amount`/etc. directly in `_instead_of_update()` would be silently
-- overwritten immediately -- dead code, not a fix. This is correct existing behavior,
-- not a second instance of the same bug: recompute-from-lines is deliberately the one
-- authoritative source once discount/shipping change, the same way it already is for
-- every other doc_type in `core.documents`.

create or replace function inventory.sales_orders_instead_of_insert()
returns trigger
language plpgsql
as $$
declare
  _doc_id uuid;
begin
  insert into core.documents (
    business_id, doc_type, source_module, source_ref, party_id, number, status,
    doc_date, expected_date, notes, subtotal, discount_amount, cgst_amount, sgst_amount,
    igst_amount, shipping_amount, total_amount, created_by
  ) values (
    new.org_id, 'sales_order', 'inventory', jsonb_build_object('warehouse_id', new.warehouse_id),
    new.customer_id, coalesce(new.so_number, inventory.next_sales_order_number(new.org_id)),
    coalesce(new.status, 'draft'), coalesce(new.order_date, current_date), new.expected_fulfillment_date,
    new.notes, coalesce(new.subtotal, 0), coalesce(new.discount_amount, 0),
    coalesce(new.cgst_amount, 0), coalesce(new.sgst_amount, 0), coalesce(new.igst_amount, 0),
    coalesce(new.shipping_amount, 0), coalesce(new.total_amount, 0),
    coalesce(new.created_by, auth.uid())
  ) returning id into _doc_id;

  new.id := _doc_id;
  return new;
end;
$$;

create or replace function inventory.purchase_orders_instead_of_insert()
returns trigger
language plpgsql
as $$
declare
  _doc_id uuid;
begin
  insert into core.documents (
    business_id, doc_type, source_module, source_ref, party_id, number, status,
    doc_date, expected_date, notes, subtotal, discount_amount, cgst_amount, sgst_amount,
    igst_amount, shipping_amount, total_amount, created_by
  ) values (
    new.org_id, 'purchase_order', 'inventory', jsonb_build_object('warehouse_id', new.warehouse_id),
    new.supplier_id, new.po_number, coalesce(new.status, 'draft'),
    coalesce(new.order_date, current_date), new.expected_delivery_date, new.notes,
    coalesce(new.subtotal, 0), coalesce(new.discount_amount, 0),
    coalesce(new.cgst_amount, 0), coalesce(new.sgst_amount, 0), coalesce(new.igst_amount, 0),
    coalesce(new.shipping_amount, 0), coalesce(new.total_amount, 0),
    coalesce(new.created_by, auth.uid())
  ) returning id into _doc_id;

  new.id := _doc_id;
  return new;
end;
$$;
