-- Epic 3, story D-6: core.documents + core.document_lines (00-MASTER-PLAN.md §5) --
-- "kills the invoice triplication": StockPilot's sales_orders/sales_invoices/
-- purchase_orders/credit_notes/debit_notes/proforma_invoices/sales_returns (each with
-- its own *_items child table, read live) and FSM's future estimates/invoices/credit
-- notes all become rows here, discriminated by `doc_type` + `source_module`.
--
-- What stays module-specific lives in `source_ref jsonb`, not as a first-class column --
-- StockPilot's sales_orders.warehouse_id or sales_invoices.sales_order_id, for example,
-- only make sense for inventory's own doc_types and would otherwise leak
-- inventory-specific columns onto a table FSM/GST equally own. `source_ref` is where
-- SP-3b (inventory's own procedural layer) puts those; this story only builds the
-- shared shape.
--
-- `status` intentionally has no check constraint: StockPilot alone has three different
-- status vocabularies across doc_types (so_status's draft..delivered/cancelled/returned,
-- po_status, invoice_payment_status), and FSM's estimate/invoice lifecycle will be a
-- fourth. Enforcing a valid state machine per doc_type is each module's own procedural
-- layer's job (SP-3b for inventory), not something core can validate centrally without
-- re-coupling every module's workflow into one shared constraint.
--
-- Per 03-STOCKPILOT-MIGRATION.md's own "known risks" section: "products.tax_rate and
-- hsn_code are per-item; FSM needs per-line overrides -- core.document_lines carries its
-- own tax_rate, hsn_code, taxable copied at line creation. Never resolve tax by joining
-- live to the item -- historical documents must not change when a price or rate
-- changes." That's why document_lines has its own hsn_code/tax_rate/taxable columns
-- (a snapshot, not a join) rather than reading core.items live.
--
-- Totals recomputation: core.recompute_document_totals() sums document_lines into the
-- document's subtotal/cgst/sgst/igst_amount and total_amount
-- (= subtotal - discount_amount + tax + shipping_amount) -- wired as an AFTER trigger on
-- document_lines (any insert/update/delete) and on core.documents itself when
-- discount_amount/shipping_amount change, so totals self-heal rather than relying on
-- every caller remembering to recompute.

create table core.documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  doc_type text not null check (doc_type in (
    'estimate', 'sales_order', 'invoice', 'credit_note', 'debit_note',
    'proforma_invoice', 'purchase_order', 'sales_return'
  )),
  source_module text not null,
  source_ref jsonb not null default '{}'::jsonb,
  party_id uuid not null references core.parties (id) on delete restrict,
  number text,
  status text not null default 'draft',
  payment_status text,
  doc_date date not null default current_date,
  due_date date,
  expected_date date,
  reason text,
  notes text,
  subtotal numeric(14, 2) not null default 0,
  discount_amount numeric(14, 2) not null default 0,
  cgst_amount numeric(14, 2) not null default 0,
  sgst_amount numeric(14, 2) not null default 0,
  igst_amount numeric(14, 2) not null default 0,
  shipping_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null default 0,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_business_id_idx on core.documents (business_id);
create index documents_party_id_idx on core.documents (party_id);

-- Numbers are minted via core.next_number() (D-5) and may be null only transiently
-- (a draft not yet numbered) -- unique once assigned, scoped per business+doc_type.
create unique index documents_business_id_doc_type_number_key
  on core.documents (business_id, doc_type, number)
  where number is not null;

-- Per-type partial indexes (explicitly required by this story): the common query is
-- "recent documents of one doc_type for this business" (a sales-orders list, an
-- invoices list, ...), and core.documents mixes every type in one table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'estimate', 'sales_order', 'invoice', 'credit_note', 'debit_note',
    'proforma_invoice', 'purchase_order', 'sales_return'
  ]
  loop
    execute format(
      'create index documents_%s_idx on core.documents (business_id, doc_date desc) where doc_type = %L',
      t, t
    );
  end loop;
end $$;

create trigger documents_set_updated_at
  before update on core.documents
  for each row execute function core.set_updated_at();

create function core.enforce_document_party_business_id()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  actual_business_id uuid;
begin
  select business_id into actual_business_id from core.parties where id = new.party_id;
  if actual_business_id is null or actual_business_id <> new.business_id then
    raise exception 'party_id % does not belong to business_id %', new.party_id, new.business_id;
  end if;
  return new;
end;
$$;

create trigger documents_enforce_party_business_id
  before insert or update on core.documents
  for each row execute function core.enforce_document_party_business_id();

create table core.document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references core.documents (id) on delete cascade,
  business_id uuid not null references core.businesses (id) on delete cascade,
  item_id uuid not null references core.items (id) on delete restrict,
  description text,
  quantity numeric(14, 2) not null check (quantity > 0),
  received_quantity numeric(14, 2) not null default 0 check (received_quantity >= 0),
  unit_price numeric(14, 2) not null default 0,
  -- Tax snapshot -- see the migration-level comment above. Never re-derived from
  -- core.items after line creation.
  hsn_code text,
  tax_rate numeric(5, 2) not null default 0,
  taxable boolean not null default true,
  cgst_amount numeric(14, 2) not null default 0,
  sgst_amount numeric(14, 2) not null default 0,
  igst_amount numeric(14, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index document_lines_document_id_idx on core.document_lines (document_id);
create index document_lines_business_id_idx on core.document_lines (business_id);
create index document_lines_item_id_idx on core.document_lines (item_id);

create function core.enforce_document_line_business_id()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  doc_business_id uuid;
  item_business_id uuid;
begin
  select business_id into doc_business_id from core.documents where id = new.document_id;
  if doc_business_id is null or doc_business_id <> new.business_id then
    raise exception 'document_id % does not belong to business_id %', new.document_id, new.business_id;
  end if;

  select business_id into item_business_id from core.items where id = new.item_id;
  if item_business_id is null or item_business_id <> new.business_id then
    raise exception 'item_id % does not belong to business_id %', new.item_id, new.business_id;
  end if;

  return new;
end;
$$;

create trigger document_lines_enforce_business_id
  before insert or update on core.document_lines
  for each row execute function core.enforce_document_line_business_id();

create function core.recompute_document_totals(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = core
as $$
declare
  v_subtotal numeric(14, 2);
  v_cgst numeric(14, 2);
  v_sgst numeric(14, 2);
  v_igst numeric(14, 2);
  v_discount numeric(14, 2);
  v_shipping numeric(14, 2);
begin
  select
    coalesce(sum(quantity * unit_price), 0),
    coalesce(sum(cgst_amount), 0),
    coalesce(sum(sgst_amount), 0),
    coalesce(sum(igst_amount), 0)
  into v_subtotal, v_cgst, v_sgst, v_igst
  from core.document_lines
  where document_id = p_document_id;

  select discount_amount, shipping_amount into v_discount, v_shipping
  from core.documents where id = p_document_id;

  update core.documents
  set
    subtotal = v_subtotal,
    cgst_amount = v_cgst,
    sgst_amount = v_sgst,
    igst_amount = v_igst,
    total_amount = v_subtotal - coalesce(v_discount, 0) + v_cgst + v_sgst + v_igst + coalesce(v_shipping, 0)
  where id = p_document_id;
end;
$$;

revoke execute on function core.recompute_document_totals(uuid) from public, anon;
grant execute on function core.recompute_document_totals(uuid) to authenticated;

create function core.document_lines_trigger_recompute_totals()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if tg_op = 'DELETE' then
    perform core.recompute_document_totals(old.document_id);
    return old;
  else
    perform core.recompute_document_totals(new.document_id);
    return new;
  end if;
end;
$$;

create trigger document_lines_recompute_totals
  after insert or update or delete on core.document_lines
  for each row execute function core.document_lines_trigger_recompute_totals();

create function core.documents_trigger_recompute_totals()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  perform core.recompute_document_totals(new.id);
  return new;
end;
$$;

-- "of discount_amount, shipping_amount" -- only fires when those specific columns are
-- part of the UPDATE's SET list, so recompute_document_totals()'s own UPDATE (which
-- never touches either) doesn't re-trigger itself.
create trigger documents_recompute_totals_on_discount_shipping_change
  after update of discount_amount, shipping_amount on core.documents
  for each row execute function core.documents_trigger_recompute_totals();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table core.documents enable row level security;
alter table core.document_lines enable row level security;

create policy "members can view documents in their businesses"
  on core.documents for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create documents in their businesses"
  on core.documents for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update documents in their businesses"
  on core.documents for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete documents in their businesses"
  on core.documents for delete
  using (business_id in (select core.user_business_ids()));

create policy "members can view document lines in their businesses"
  on core.document_lines for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create document lines in their businesses"
  on core.document_lines for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update document lines in their businesses"
  on core.document_lines for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete document lines in their businesses"
  on core.document_lines for delete
  using (business_id in (select core.user_business_ids()));
