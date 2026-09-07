-- Epic 4, SP-7d: sales-returns approval workflow -- the piece the SP-3b procedural-layer
-- migration explicitly deferred ("Deliberately NOT built here: sales_returns' full
-- approval workflow... a future story extends it to sales_returns the same way SP-3b did
-- for sales_orders/purchase_orders/stock_transfers"). That future story is this one, now
-- that SP-7's Sales Returns route needs it.
--
-- Ported from stockpilot-ai-ops's real, later migrations (read live, not from the plan
-- docs, per this repo's "live source wins" rule) -- `create_credit_note()` from
-- 20260905000000_sales_invoicing_gstr1.sql (SP-5) and `approve_sales_return()` +
-- `enforce_sales_return_creation()` + `enforce_sales_return_status_transition()` +
-- the sales_returns.* permission catalog from 20260913000000_sales_returns.sql (SP-11),
-- with its 20260913000100_sales_returns_fix.sql correction folded in directly (the fix
-- capped each line's return quantity against what was actually sold, not just what's on
-- the order -- ported already-fixed, no separate follow-up migration needed here).
--
-- Schema adaptations, consistent with every other SP-3b/SP-4 RPC: org_id -> business_id,
-- product_id -> item_id (core.items), sales_orders/sales_invoices/credit_notes ->
-- core.documents (doc_type-discriminated), sales_order_items/sales_return_items ->
-- core.document_lines, restock/is_damaged/reason -> inventory.sales_return_lines_stock
-- (SP-3a's own satellite table for exactly this, already built). The live source's
-- counter tables (sales_invoice_counters/credit_note_counters) aren't ported --
-- next_sales_invoice_number()/next_credit_note_number() already exist (SP-4) as thin
-- wrappers over core.next_number(), so create_credit_note() below just calls the wrapper
-- that's already there instead of reintroducing a second numbering mechanism.
--
-- Permission-model difference from the live source: approve_sales_return() there is
-- SECURITY DEFINER specifically because issuing a credit note is gated by invoices.cancel
-- at the RLS layer there, and sales_manager (who holds sales_returns.approve) deliberately
-- doesn't hold invoices.cancel. This platform's core.documents RLS is the uniform
-- "tenant AND licensed" pattern (ADR-8) for every module member regardless of role --
-- SP-3b's own scope-boundary comment spells this out -- so no such gap exists here:
-- create_credit_note() and approve_sales_return() are both plain functions (not SECURITY
-- DEFINER), matching every other workflow RPC in the procedural layer (confirm_sales_
-- order, ship_stock_transfer, etc.), relying on the permission-transition trigger below
-- (extended, not duplicated) for enforcement.

-- ---------------------------------------------------------------------------
-- 1. Permission catalog for the sales-returns workflow.
-- ---------------------------------------------------------------------------

insert into core.permissions (key, module, description) values
  ('sales_returns.create', 'inventory', 'Create/update draft sales returns (RMAs)'),
  ('sales_returns.approve', 'inventory', 'Approve a sales return: post its restock/damaged stock movement and issue its credit note'),
  ('sales_returns.cancel', 'inventory', 'Cancel a draft sales return'),
  ('sales_returns.delete', 'inventory', 'Delete a draft sales return')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'sales_returns.create'), ('owner', 'sales_returns.approve'),
  ('owner', 'sales_returns.cancel'), ('owner', 'sales_returns.delete'),
  ('admin', 'sales_returns.create'), ('admin', 'sales_returns.approve'),
  ('admin', 'sales_returns.cancel'), ('admin', 'sales_returns.delete'),
  ('sales_manager', 'sales_returns.create'), ('sales_manager', 'sales_returns.approve'),
  ('sales_manager', 'sales_returns.cancel'), ('sales_manager', 'sales_returns.delete'),
  ('accountant', 'sales_returns.approve')
on conflict (role, permission_key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Resolve sales_invoice_id server-side on creation (never trusted from the client --
-- a return can be drafted before an invoice exists for its order, so this stays null
-- until one does) and validate the linked sales order's state, matching the live
-- source's enforce_sales_return_creation() trigger. CREATE OR REPLACE over SP-4's
-- original insert trigger function, keeping everything else about it unchanged.
-- ---------------------------------------------------------------------------

create or replace function inventory.sales_returns_instead_of_insert()
returns trigger
language plpgsql
as $$
declare
  _doc_id uuid;
  _party_id uuid;
  _so core.documents%rowtype;
  _invoice_id uuid;
begin
  select * into _so from core.documents where id = new.sales_order_id and doc_type = 'sales_order';
  if not found then
    raise exception 'Sales order not found';
  end if;
  if _so.business_id <> new.org_id then
    raise exception 'Sales order does not belong to this business';
  end if;
  if _so.status not in ('shipped', 'delivered') then
    raise exception 'A return can only be created against a shipped or delivered sales order';
  end if;
  _party_id := _so.party_id;

  select id into _invoice_id from core.documents
  where doc_type = 'invoice' and source_module = 'inventory' and source_ref->>'sales_order_id' = new.sales_order_id::text;

  insert into core.documents (business_id, doc_type, source_module, source_ref, party_id, number, status, doc_date, notes, created_by)
  values (
    new.org_id, 'sales_return', 'inventory',
    jsonb_build_object(
      'sales_order_id', new.sales_order_id, 'sales_invoice_id', _invoice_id,
      'requested_by', coalesce(new.requested_by, auth.uid())
    ),
    _party_id, coalesce(new.return_number, inventory.next_sales_return_number(new.org_id)),
    coalesce(new.status, 'draft'), coalesce(new.return_date, current_date), new.notes,
    coalesce(new.requested_by, auth.uid())
  ) returning id into _doc_id;

  new.id := _doc_id;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Status-transition permission enforcement for sales_return, extending the same
-- core.documents trigger SP-3b built for purchase_order/sales_order (its own docstring
-- already scoped it to "anything else passes through untouched, leaving other modules
-- free to enforce their own transitions however they need to once they exist" -- this is
-- exactly that). CREATE OR REPLACE with the two existing branches copied verbatim plus
-- the new one; the trigger created by SP-3b's own migration keeps pointing at this same
-- function name, so it needs no separate CREATE TRIGGER here.
-- ---------------------------------------------------------------------------

create or replace function core.enforce_inventory_document_status_transition()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if current_user = 'service_role'
    or new.status is not distinct from old.status
    or new.source_module <> 'inventory'
  then
    return new;
  end if;

  if new.doc_type = 'purchase_order' then
    case new.status
      when 'approved', 'sent' then
        if not core.has_permission(new.business_id, 'purchase_orders.approve') then
          raise exception 'Missing purchase_orders.approve permission for this transition';
        end if;
      when 'received', 'partially_received' then
        if not core.has_permission(new.business_id, 'purchase_orders.receive') then
          raise exception 'Missing purchase_orders.receive permission for this transition';
        end if;
      when 'closed' then
        if not (core.has_permission(new.business_id, 'purchase_orders.approve')
                or core.has_permission(new.business_id, 'purchase_orders.receive')) then
          raise exception 'Missing permission to close this purchase order';
        end if;
      else
        if not (core.has_permission(new.business_id, 'purchase_orders.edit')
                or core.has_permission(new.business_id, 'purchase_orders.approve')) then
          raise exception 'Missing permission for this purchase order status transition';
        end if;
    end case;
  elsif new.doc_type = 'sales_order' then
    case new.status
      when 'confirmed' then
        if not core.has_permission(new.business_id, 'sales_orders.confirm') then
          raise exception 'Missing sales_orders.confirm permission for this transition';
        end if;
      when 'processing', 'packed', 'shipped', 'delivered' then
        if not core.has_permission(new.business_id, 'sales_orders.ship') then
          raise exception 'Missing sales_orders.ship permission for this transition';
        end if;
      when 'cancelled', 'returned' then
        if not core.has_permission(new.business_id, 'sales_orders.cancel') then
          raise exception 'Missing sales_orders.cancel permission for this transition';
        end if;
      else
        if not core.has_permission(new.business_id, 'sales_orders.edit') then
          raise exception 'Missing sales_orders.edit permission for this status transition';
        end if;
    end case;
  elsif new.doc_type = 'sales_return' then
    case new.status
      when 'approved' then
        if old.status <> 'draft' then
          raise exception 'Only a draft return can be approved';
        end if;
        if not core.has_permission(new.business_id, 'sales_returns.approve') then
          raise exception 'Missing sales_returns.approve permission for this transition';
        end if;
      when 'completed' then
        if old.status <> 'approved' then
          raise exception 'Only an approved return can be completed';
        end if;
        if not core.has_permission(new.business_id, 'sales_returns.approve') then
          raise exception 'Missing sales_returns.approve permission for this transition';
        end if;
      when 'cancelled' then
        if old.status <> 'draft' then
          raise exception 'Only a draft return can be cancelled';
        end if;
        if not core.has_permission(new.business_id, 'sales_returns.cancel') then
          raise exception 'Missing sales_returns.cancel permission for this transition';
        end if;
      else
        if not core.has_permission(new.business_id, 'sales_returns.create') then
          raise exception 'Missing sales_returns.create permission for this status transition';
        end if;
    end case;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. create_credit_note(): full or partial, against an invoice's own remaining taxable
-- value/tax. A full note reverses exactly whatever remains uncredited; a partial one
-- takes an explicit taxable value and derives its CGST/SGST/IGST as that value's
-- proportional share of the invoice's own tax -- never a caller-supplied rate -- so a run
-- of partial credits can never leave a later full credit needing to reverse more tax
-- than the invoice ever charged. `_sales_return_id` is optional and only ever passed by
-- approve_sales_return() below; the Sales Invoices screen's own "Record credit note"
-- action omits it.
-- ---------------------------------------------------------------------------

create function inventory.create_credit_note(
  _invoice_id uuid,
  _is_full boolean,
  _subtotal numeric default null,
  _reason text default null,
  _sales_return_id uuid default null
)
returns uuid
language plpgsql
set search_path = inventory, core
as $$
declare
  _invoice core.documents%rowtype;
  _credited_subtotal numeric;
  _credited_cgst numeric;
  _credited_sgst numeric;
  _credited_igst numeric;
  _remaining_subtotal numeric;
  _ratio numeric;
  _cn_subtotal numeric;
  _cn_cgst numeric := 0;
  _cn_sgst numeric := 0;
  _cn_igst numeric := 0;
  _cn_id uuid;
  _cn_number text;
begin
  select * into _invoice from core.documents where id = _invoice_id and doc_type = 'invoice';
  if not found then
    raise exception 'Invoice not found';
  end if;

  select coalesce(sum(subtotal), 0), coalesce(sum(cgst_amount), 0),
         coalesce(sum(sgst_amount), 0), coalesce(sum(igst_amount), 0)
  into _credited_subtotal, _credited_cgst, _credited_sgst, _credited_igst
  from core.documents where doc_type = 'credit_note' and source_ref->>'sales_invoice_id' = _invoice_id::text;

  _remaining_subtotal := _invoice.subtotal - _credited_subtotal;
  if _remaining_subtotal <= 0 then
    raise exception 'This invoice has already been fully credited';
  end if;

  if _is_full then
    _cn_subtotal := _remaining_subtotal;
    _cn_cgst := _invoice.cgst_amount - _credited_cgst;
    _cn_sgst := _invoice.sgst_amount - _credited_sgst;
    _cn_igst := _invoice.igst_amount - _credited_igst;
  else
    if _subtotal is null or _subtotal <= 0 then
      raise exception 'Enter a credit amount greater than zero';
    end if;
    if _subtotal > _remaining_subtotal then
      raise exception 'Cannot credit more than the remaining invoice value (%)', _remaining_subtotal;
    end if;

    _cn_subtotal := _subtotal;
    _ratio := case when _invoice.subtotal > 0 then _subtotal / _invoice.subtotal else 0 end;
    _cn_cgst := round(_invoice.cgst_amount * _ratio, 2);
    _cn_sgst := round(_invoice.sgst_amount * _ratio, 2);
    _cn_igst := round(_invoice.igst_amount * _ratio, 2);
  end if;

  _cn_number := inventory.next_credit_note_number(_invoice.business_id);

  insert into core.documents (
    business_id, doc_type, source_module, source_ref, party_id, number, doc_date, reason,
    subtotal, cgst_amount, sgst_amount, igst_amount, total_amount, created_by
  ) values (
    _invoice.business_id, 'credit_note', 'inventory',
    jsonb_build_object('sales_invoice_id', _invoice_id, 'is_full', _is_full, 'sales_return_id', _sales_return_id),
    _invoice.party_id, _cn_number, current_date, _reason,
    _cn_subtotal, _cn_cgst, _cn_sgst, _cn_igst, _cn_subtotal + _cn_cgst + _cn_sgst + _cn_igst, auth.uid()
  ) returning id into _cn_id;

  return _cn_id;
end;
$$;

revoke execute on function inventory.create_credit_note(uuid, boolean, numeric, text, uuid) from public;
grant execute on function inventory.create_credit_note(uuid, boolean, numeric, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. approve_sales_return(): caps each line against what's actually left returnable for
-- that item on the order (already-approved/completed returns for the same order+item
-- count against the cap -- the live source's own 20260913000100 fix, ported
-- already-applied), posts the restock/damage stock movement per restock line
-- (credit-only lines post nothing), and issues one credit note for the return's total
-- value against the invoice generated for its sales order -- reusing create_credit_note
-- above rather than re-deriving its tax-split logic.
-- ---------------------------------------------------------------------------

create function inventory.approve_sales_return(_document_id uuid)
returns void
language plpgsql
set search_path = inventory, core
as $$
declare
  _return core.documents%rowtype;
  _so core.documents%rowtype;
  _warehouse_id uuid;
  _invoice_id uuid;
  _line record;
  _so_qty numeric;
  _already_returned numeric;
  _return_total numeric := 0;
  _invoice core.documents%rowtype;
  _credited_subtotal numeric;
  _invoice_remaining numeric;
  _is_full boolean;
  _cn_id uuid;
begin
  select * into _return from core.documents where id = _document_id and doc_type = 'sales_return';
  if not found then
    raise exception 'Sales return not found';
  end if;
  if _return.status <> 'draft' then
    raise exception 'Only a draft return can be approved';
  end if;

  _invoice_id := (_return.source_ref->>'sales_invoice_id')::uuid;
  if _invoice_id is null then
    raise exception 'Generate the sales invoice for this order before approving a return against it';
  end if;

  if not exists (select 1 from core.document_lines where document_id = _document_id) then
    raise exception 'Add at least one line item before approving this return';
  end if;

  select * into _so from core.documents where id = (_return.source_ref->>'sales_order_id')::uuid;
  _warehouse_id := (_so.source_ref->>'warehouse_id')::uuid;

  for _line in
    select dl.id, dl.item_id, dl.quantity, dl.unit_price,
           coalesce(srls.restock, true) as restock, coalesce(srls.is_damaged, false) as is_damaged,
           i.name, i.sku
    from core.document_lines dl
    join core.items i on i.id = dl.item_id
    left join inventory.sales_return_lines_stock srls on srls.document_line_id = dl.id
    where dl.document_id = _document_id
  loop
    select coalesce(sum(dl2.quantity), 0) into _so_qty
    from core.document_lines dl2
    where dl2.document_id = _so.id and dl2.item_id = _line.item_id;

    select coalesce(sum(dl2.quantity), 0) into _already_returned
    from core.document_lines dl2
    join core.documents r2 on r2.id = dl2.document_id
    where r2.doc_type = 'sales_return' and r2.source_ref->>'sales_order_id' = _so.id::text
      and r2.status in ('approved', 'completed') and r2.id <> _document_id
      and dl2.item_id = _line.item_id;

    if _already_returned + _line.quantity > _so_qty then
      raise exception 'Cannot return more than was sold for % (%): sold %, already returned %',
        _line.name, coalesce(_line.sku, 'no SKU'), _so_qty, _already_returned;
    end if;

    if _line.restock then
      insert into inventory.stock_movements (business_id, item_id, warehouse_id, type, quantity, reference, notes, created_by)
      values (
        _return.business_id, _line.item_id, _warehouse_id,
        (case when _line.is_damaged then 'damage' else 'return' end)::inventory.movement_type,
        _line.quantity, _return.number,
        case when _line.is_damaged then 'Returned damaged against sales return' else 'Restocked against sales return' end,
        auth.uid()
      );
    end if;

    _return_total := _return_total + _line.quantity * _line.unit_price;
  end loop;

  select * into _invoice from core.documents where id = _invoice_id and doc_type = 'invoice';
  select coalesce(sum(subtotal), 0) into _credited_subtotal
  from core.documents where doc_type = 'credit_note' and source_ref->>'sales_invoice_id' = _invoice_id::text;
  _invoice_remaining := _invoice.subtotal - _credited_subtotal;

  _is_full := _return_total >= _invoice_remaining;

  _cn_id := inventory.create_credit_note(
    _invoice_id, _is_full, case when _is_full then null else _return_total end,
    'Sales return ' || _return.number, _document_id
  );

  update core.documents
  set status = 'approved',
      source_ref = source_ref || jsonb_build_object('approved_by', auth.uid(), 'approved_at', now(), 'credit_note_id', _cn_id)
  where id = _document_id;
end;
$$;

revoke execute on function inventory.approve_sales_return(uuid) from public;
grant execute on function inventory.approve_sales_return(uuid) to authenticated;
