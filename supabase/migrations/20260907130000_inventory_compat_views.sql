-- Epic 4, story SP-4: compatibility views + INSTEAD OF triggers for every StockPilot
-- table that MERGES into core (00-MASTER-PLAN.md §2, 03-STOCKPILOT-MIGRATION.md §2-3).
-- SP-7 (the future code port) keeps StockPilot's copied source writing
-- `.from('customers')`/`.from('sales_orders')`/etc against the `inventory` schema
-- unchanged; these views resolve those calls onto `core`'s merged tables, and the
-- INSTEAD OF triggers fan writes back out to core.parties/items/documents/etc.
--
-- Exact live shapes below were read from stockpilot-ai-ops's full migration history
-- (27 files, 2026-09-07) -- not just each table's base CREATE TABLE -- per this repo's
-- own "live source wins, read the full history" lesson from SP-3b's corrections.
--
-- Scope note (org_id vs business_id): 06-DECISIONS-LOCKED.md's own SP-3 description says
-- "org_id kept as the column name" for the tables that move into `inventory` as-is
-- (warehouses, stock_levels, stock_movements, stock_transfers, stock_transfer_items,
-- alerts) -- SP-3a's own shipped migration deliberately renamed that column to
-- business_id instead (see its docstring), which this story does NOT reconcile: those
-- six tables are not "merge" targets by the plan's own table (§2), so they are out of
-- SP-4's scope by definition, and a compat view can't share a name with the real table
-- it would sit next to anyway. SP-7 (whichever handful of call sites it ports that touch
-- those six tables directly) renames org_id -> business_id in those specific queries as
-- part of its own M2 org-resolution-helper edit -- flagged here, not solved here.
--
-- Type-fidelity note: StockPilot's status columns (so_status/po_status/invoice_payment_
-- status/sales_return_status) are real Postgres enums there. A view column doesn't need
-- to be a matching enum type to be wire-compatible -- PostgREST serializes both a text
-- column and an enum column as the same JSON string, and ported TypeScript's generated
-- types are string unions regardless. Every status column below is `text`, validated by
-- the same CHECK-shaped guard the enum gave it (a WHEN ... ELSE raise inside the INSTEAD
-- OF trigger), not a real Postgres enum type -- avoiding the cost of standing up
-- inventory-schema enum types with zero behavioral difference over the wire.
--
-- Deliberately NOT built here: sales_returns' full approval workflow
-- (approve_sales_return() -- restock movements + credit-note generation) and its
-- status-transition permission trigger (matching confirm_sales_order()'s own pattern).
-- That is workflow/procedural logic, not a compat-view concern -- SP-3b's own scope
-- boundary comment draws exactly this line for status-transition enforcement; a future
-- story extends it to sales_returns the same way SP-3b did for sales_orders/purchase_
-- orders/stock_transfers. This story's sales_returns/sales_return_items views support
-- plain CRUD only.
--
-- Every view is `security_invoker = true` (PG17) so the viewer's own RLS grants on the
-- underlying core/inventory tables apply -- matching core.document_balances/document_
-- aging's own precedent (D-7). INSTEAD OF trigger functions are deliberately NOT
-- SECURITY DEFINER (same reasoning as SP-3b's workflow RPCs): they run as the calling
-- user, so every underlying table's own RLS policy and enforce_*_business_id trigger
-- still gates the write -- a compat view is a shape adapter, not a privilege escalation.

-- ---------------------------------------------------------------------------
-- 1. organizations -- over core.businesses + core.business_settings.
-- No INSTEAD OF INSERT/DELETE: org creation/deletion is not ported (the platform owns
-- onboarding), matching 03-STOCKPILOT-MIGRATION.md §3's own note that org-creation
-- screens are deleted, not carried over, in SP-7.
-- ---------------------------------------------------------------------------

create view inventory.organizations
with (security_invoker = true) as
select
  b.id,
  b.name,
  coalesce(s.slug, b.id::text) as slug,
  b.industry,
  coalesce(s.currency, 'INR') as currency,
  coalesce(s.timezone, 'Asia/Kolkata') as timezone,
  coalesce(s.plan, 'starter') as plan,
  -- core.businesses never tracks a creator; best-effort reconstruction from the
  -- earliest owner of the account that owns this business. Read-only (see the
  -- UPDATE trigger below, which never writes this column).
  (
    select am.user_id from core.account_members am
    where am.account_id = b.account_id and am.role = 'owner'
    order by am.created_at asc limit 1
  ) as created_by,
  b.created_at,
  b.updated_at,
  s.gstin,
  s.state,
  coalesce(s.gst_registration_type, 'regular') as gst_registration_type
from core.businesses b
left join core.business_settings s on s.business_id = b.id;

create function inventory.organizations_instead_of_update()
returns trigger
language plpgsql
as $$
begin
  update core.businesses
  set name = new.name, industry = new.industry
  where id = old.id;

  insert into core.business_settings (business_id, slug, plan, currency, timezone, gstin, state, gst_registration_type)
  values (old.id, new.slug, new.plan, new.currency, new.timezone, new.gstin, new.state, new.gst_registration_type)
  on conflict (business_id) do update set
    slug = excluded.slug, plan = excluded.plan, currency = excluded.currency,
    timezone = excluded.timezone, gstin = excluded.gstin, state = excluded.state,
    gst_registration_type = excluded.gst_registration_type;

  return new;
end;
$$;

create trigger organizations_instead_of_update
  instead of update on inventory.organizations
  for each row execute function inventory.organizations_instead_of_update();

-- ---------------------------------------------------------------------------
-- 2/3/4. organization_members, profiles, categories -- plain single-table column
-- renames, no join. Postgres auto-updates a "simple" view like this natively (one base
-- table, no aggregates/DISTINCT) -- no INSTEAD OF triggers needed for INSERT/UPDATE/
-- DELETE; core's own RLS and CHECK constraints on the base table still apply.
-- ---------------------------------------------------------------------------

create view inventory.organization_members
with (security_invoker = true) as
select id, business_id as org_id, user_id, role, created_at
from core.business_members;

create view inventory.profiles
with (security_invoker = true) as
select id, full_name, email, phone, avatar_url, created_at, updated_at
from core.user_profiles;

create view inventory.categories
with (security_invoker = true) as
select id, business_id as org_id, name, description, parent_id, created_at, updated_at
from core.item_categories;

-- ---------------------------------------------------------------------------
-- 5. customers -- over core.parties (role='customer') + core.tax_identities +
-- core.addresses (kind='billing'/'shipping', is_primary). INSERT/UPDATE/DELETE fan out;
-- DELETE only drops the 'customer' role (and the party itself if that was its only
-- role) -- a party can hold other roles (e.g. also 'supplier') that a delete through
-- this one view must not destroy.
-- ---------------------------------------------------------------------------

create view inventory.customers
with (security_invoker = true) as
select
  p.id,
  p.business_id as org_id,
  p.name,
  ti.gstin,
  p.phone, p.email,
  ba.formatted as billing_address,
  sa.formatted as shipping_address,
  coalesce(ti.state, ba.state) as state,
  p.is_active,
  p.created_at, p.updated_at
from core.parties p
join core.party_roles r on r.party_id = p.id and r.role = 'customer'
left join core.tax_identities ti on ti.party_id = p.id
left join core.addresses ba on ba.party_id = p.id and ba.kind = 'billing' and ba.is_primary
left join core.addresses sa on sa.party_id = p.id and sa.kind = 'shipping' and sa.is_primary;

create function inventory.customers_instead_of_insert()
returns trigger
language plpgsql
as $$
declare
  _party_id uuid;
begin
  insert into core.parties (business_id, kind, name, email, phone, is_active)
  values (new.org_id, 'company', new.name, new.email, new.phone, coalesce(new.is_active, true))
  returning id into _party_id;

  insert into core.party_roles (business_id, party_id, role)
  values (new.org_id, _party_id, 'customer');

  if new.gstin is not null or new.state is not null then
    insert into core.tax_identities (party_id, business_id, gstin, state)
    values (_party_id, new.org_id, new.gstin, new.state);
  end if;
  if new.billing_address is not null then
    insert into core.addresses (business_id, party_id, kind, is_primary, formatted, state)
    values (new.org_id, _party_id, 'billing', true, new.billing_address, new.state);
  end if;
  if new.shipping_address is not null then
    insert into core.addresses (business_id, party_id, kind, is_primary, formatted)
    values (new.org_id, _party_id, 'shipping', true, new.shipping_address);
  end if;

  new.id := _party_id;
  return new;
end;
$$;

create trigger customers_instead_of_insert
  instead of insert on inventory.customers
  for each row execute function inventory.customers_instead_of_insert();

create function inventory.customers_instead_of_update()
returns trigger
language plpgsql
as $$
begin
  update core.parties
  set name = new.name, email = new.email, phone = new.phone, is_active = new.is_active
  where id = old.id;

  if new.gstin is not null or new.state is not null then
    insert into core.tax_identities (party_id, business_id, gstin, state)
    values (old.id, old.org_id, new.gstin, new.state)
    on conflict (party_id) do update set gstin = excluded.gstin, state = excluded.state;
  end if;
  if new.billing_address is not null then
    insert into core.addresses (business_id, party_id, kind, is_primary, formatted, state)
    values (old.org_id, old.id, 'billing', true, new.billing_address, new.state)
    on conflict (party_id, kind) where is_primary
      do update set formatted = excluded.formatted, state = excluded.state;
  end if;
  if new.shipping_address is not null then
    insert into core.addresses (business_id, party_id, kind, is_primary, formatted)
    values (old.org_id, old.id, 'shipping', true, new.shipping_address)
    on conflict (party_id, kind) where is_primary
      do update set formatted = excluded.formatted;
  end if;

  return new;
end;
$$;

create trigger customers_instead_of_update
  instead of update on inventory.customers
  for each row execute function inventory.customers_instead_of_update();

create function inventory.customers_instead_of_delete()
returns trigger
language plpgsql
as $$
begin
  delete from core.party_roles where party_id = old.id and role = 'customer';
  if not exists (select 1 from core.party_roles where party_id = old.id) then
    delete from core.parties where id = old.id;
  end if;
  return old;
end;
$$;

create trigger customers_instead_of_delete
  instead of delete on inventory.customers
  for each row execute function inventory.customers_instead_of_delete();

-- ---------------------------------------------------------------------------
-- 6. suppliers -- over core.parties (role='supplier') + core.party_supplier_attrs +
-- core.tax_identities (gst_number) + core.addresses (kind='billing', StockPilot's own
-- flat single address). contact_person has no structured equivalent (core.party_contacts
-- is a list of named contacts, not one text field) -- approximated as the primary
-- contact's full name, split crudely on the first space when written back.
-- ---------------------------------------------------------------------------

create view inventory.suppliers
with (security_invoker = true) as
select
  p.id,
  p.business_id as org_id,
  p.name,
  attrs.code,
  (
    select trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))
    from core.party_contacts c
    where c.party_id = p.id and c.is_primary
    limit 1
  ) as contact_person,
  p.email, p.phone,
  ti.gstin as gst_number,
  a.formatted as address, a.city, a.state,
  attrs.payment_terms, attrs.lead_time_days, attrs.rating,
  p.is_active,
  p.created_at, p.updated_at,
  attrs.min_order_quantity
from core.parties p
join core.party_roles r on r.party_id = p.id and r.role = 'supplier'
left join core.party_supplier_attrs attrs on attrs.party_id = p.id
left join core.tax_identities ti on ti.party_id = p.id
left join core.addresses a on a.party_id = p.id and a.kind = 'billing' and a.is_primary;

create function inventory.suppliers_instead_of_insert()
returns trigger
language plpgsql
as $$
declare
  _party_id uuid;
  _first_name text;
  _last_name text;
begin
  insert into core.parties (business_id, kind, name, email, phone, is_active)
  values (new.org_id, 'company', new.name, new.email, new.phone, coalesce(new.is_active, true))
  returning id into _party_id;

  insert into core.party_roles (business_id, party_id, role)
  values (new.org_id, _party_id, 'supplier');

  insert into core.party_supplier_attrs (party_id, business_id, code, payment_terms, lead_time_days, rating, min_order_quantity)
  values (_party_id, new.org_id, new.code, new.payment_terms, coalesce(new.lead_time_days, 7), coalesce(new.rating, 0), new.min_order_quantity);

  if new.gst_number is not null then
    insert into core.tax_identities (party_id, business_id, gstin, state)
    values (_party_id, new.org_id, new.gst_number, new.state);
  end if;
  if new.address is not null or new.city is not null or new.state is not null then
    insert into core.addresses (business_id, party_id, kind, is_primary, formatted, city, state)
    values (new.org_id, _party_id, 'billing', true, new.address, new.city, new.state);
  end if;
  if new.contact_person is not null and trim(new.contact_person) <> '' then
    _first_name := split_part(new.contact_person, ' ', 1);
    _last_name := nullif(trim(substring(new.contact_person from length(_first_name) + 1)), '');
    insert into core.party_contacts (business_id, party_id, first_name, last_name, is_primary)
    values (new.org_id, _party_id, _first_name, _last_name, true);
  end if;

  new.id := _party_id;
  return new;
end;
$$;

create trigger suppliers_instead_of_insert
  instead of insert on inventory.suppliers
  for each row execute function inventory.suppliers_instead_of_insert();

create function inventory.suppliers_instead_of_update()
returns trigger
language plpgsql
as $$
declare
  _first_name text;
  _last_name text;
begin
  update core.parties
  set name = new.name, email = new.email, phone = new.phone, is_active = new.is_active
  where id = old.id;

  insert into core.party_supplier_attrs (party_id, business_id, code, payment_terms, lead_time_days, rating, min_order_quantity)
  values (old.id, old.org_id, new.code, new.payment_terms, coalesce(new.lead_time_days, 7), coalesce(new.rating, 0), new.min_order_quantity)
  on conflict (party_id) do update set
    code = excluded.code, payment_terms = excluded.payment_terms,
    lead_time_days = excluded.lead_time_days, rating = excluded.rating,
    min_order_quantity = excluded.min_order_quantity;

  if new.gst_number is not null or new.state is not null then
    insert into core.tax_identities (party_id, business_id, gstin, state)
    values (old.id, old.org_id, new.gst_number, new.state)
    on conflict (party_id) do update set gstin = excluded.gstin, state = excluded.state;
  end if;
  if new.address is not null or new.city is not null or new.state is not null then
    insert into core.addresses (business_id, party_id, kind, is_primary, formatted, city, state)
    values (old.org_id, old.id, 'billing', true, new.address, new.city, new.state)
    on conflict (party_id, kind) where is_primary
      do update set formatted = excluded.formatted, city = excluded.city, state = excluded.state;
  end if;
  if new.contact_person is not null and trim(new.contact_person) <> '' then
    _first_name := split_part(new.contact_person, ' ', 1);
    _last_name := nullif(trim(substring(new.contact_person from length(_first_name) + 1)), '');
    update core.party_contacts set first_name = _first_name, last_name = _last_name
    where party_id = old.id and is_primary;
    if not found then
      insert into core.party_contacts (business_id, party_id, first_name, last_name, is_primary)
      values (old.org_id, old.id, _first_name, _last_name, true);
    end if;
  end if;

  return new;
end;
$$;

create trigger suppliers_instead_of_update
  instead of update on inventory.suppliers
  for each row execute function inventory.suppliers_instead_of_update();

create function inventory.suppliers_instead_of_delete()
returns trigger
language plpgsql
as $$
begin
  delete from core.party_roles where party_id = old.id and role = 'supplier';
  if not exists (select 1 from core.party_roles where party_id = old.id) then
    delete from core.parties where id = old.id;
  end if;
  return old;
end;
$$;

create trigger suppliers_instead_of_delete
  instead of delete on inventory.suppliers
  for each row execute function inventory.suppliers_instead_of_delete();

-- ---------------------------------------------------------------------------
-- 7. products -- over core.items (kind='good') + core.item_inventory_attrs.
-- ---------------------------------------------------------------------------

create view inventory.products
with (security_invoker = true) as
select
  i.id,
  i.business_id as org_id,
  i.sku, i.name, i.description,
  i.category_id,
  i.supplier_party_id as supplier_id,
  i.unit, i.hsn_code, i.tax_rate, i.cost_price, i.selling_price,
  coalesce(attrs.reorder_point, 0) as reorder_point,
  coalesce(attrs.reorder_quantity, 0) as reorder_quantity,
  attrs.barcode,
  i.image_url, i.status,
  i.created_at, i.updated_at,
  i.brand
from core.items i
left join core.item_inventory_attrs attrs on attrs.item_id = i.id
where i.kind = 'good';

create function inventory.products_instead_of_insert()
returns trigger
language plpgsql
as $$
declare
  _item_id uuid;
begin
  insert into core.items (
    business_id, kind, sku, name, description, category_id, supplier_party_id,
    unit, hsn_code, tax_rate, cost_price, selling_price, image_url, status, brand
  ) values (
    new.org_id, 'good', new.sku, new.name, new.description, new.category_id, new.supplier_id,
    coalesce(new.unit, 'pcs'), new.hsn_code, coalesce(new.tax_rate, 18),
    coalesce(new.cost_price, 0), coalesce(new.selling_price, 0), new.image_url,
    coalesce(new.status, 'active'), new.brand
  ) returning id into _item_id;

  insert into core.item_inventory_attrs (item_id, business_id, reorder_point, reorder_quantity, barcode)
  values (_item_id, new.org_id, coalesce(new.reorder_point, 0), coalesce(new.reorder_quantity, 0), new.barcode);

  new.id := _item_id;
  return new;
end;
$$;

create trigger products_instead_of_insert
  instead of insert on inventory.products
  for each row execute function inventory.products_instead_of_insert();

create function inventory.products_instead_of_update()
returns trigger
language plpgsql
as $$
begin
  update core.items
  set sku = new.sku, name = new.name, description = new.description,
      category_id = new.category_id, supplier_party_id = new.supplier_id,
      unit = new.unit, hsn_code = new.hsn_code, tax_rate = new.tax_rate,
      cost_price = new.cost_price, selling_price = new.selling_price,
      image_url = new.image_url, status = new.status, brand = new.brand
  where id = old.id;

  insert into core.item_inventory_attrs (item_id, business_id, reorder_point, reorder_quantity, barcode)
  values (old.id, old.org_id, coalesce(new.reorder_point, 0), coalesce(new.reorder_quantity, 0), new.barcode)
  on conflict (item_id) do update set
    reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity,
    barcode = excluded.barcode;

  return new;
end;
$$;

create trigger products_instead_of_update
  instead of update on inventory.products
  for each row execute function inventory.products_instead_of_update();

create function inventory.products_instead_of_delete()
returns trigger
language plpgsql
as $$
begin
  delete from core.items where id = old.id;
  return old;
end;
$$;

create trigger products_instead_of_delete
  instead of delete on inventory.products
  for each row execute function inventory.products_instead_of_delete();

-- ---------------------------------------------------------------------------
-- 8. Numbering compat functions -- thin wrappers over core.next_number() (D-5),
-- schema-qualified to `inventory` so a schema-targeted `.rpc('next_sales_order_number',
-- ...)` call resolves. Same format as the live source (`<PREFIX>/<FY>/<0000>`) by
-- construction -- core.next_number() was built to match this exact pattern (D-5).
-- ---------------------------------------------------------------------------

create function inventory.next_sales_order_number(_org_id uuid)
returns text
language sql
as $$
  select core.next_number(_org_id, 'sales_order', 'SO');
$$;

create function inventory.next_sales_invoice_number(_org_id uuid)
returns text
language sql
as $$
  select core.next_number(_org_id, 'invoice', 'INV');
$$;

create function inventory.next_credit_note_number(_org_id uuid)
returns text
language sql
as $$
  select core.next_number(_org_id, 'credit_note', 'CN');
$$;

create function inventory.next_sales_return_number(_org_id uuid)
returns text
language sql
as $$
  select core.next_number(_org_id, 'sales_return', 'RMA');
$$;

revoke execute on function inventory.next_sales_order_number(uuid) from public;
revoke execute on function inventory.next_sales_invoice_number(uuid) from public;
revoke execute on function inventory.next_credit_note_number(uuid) from public;
revoke execute on function inventory.next_sales_return_number(uuid) from public;
grant execute on function inventory.next_sales_order_number(uuid) to authenticated;
grant execute on function inventory.next_sales_invoice_number(uuid) to authenticated;
grant execute on function inventory.next_credit_note_number(uuid) to authenticated;
grant execute on function inventory.next_sales_return_number(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. sales_orders / sales_order_items -- over core.documents(doc_type='sales_order') +
-- core.document_lines. warehouse_id lives in source_ref (D-6/SP-3b's own convention).
-- ---------------------------------------------------------------------------

create view inventory.sales_orders
with (security_invoker = true) as
select
  d.id,
  d.business_id as org_id,
  d.party_id as customer_id,
  (d.source_ref->>'warehouse_id')::uuid as warehouse_id,
  d.number as so_number,
  d.status,
  d.doc_date as order_date,
  d.expected_date as expected_fulfillment_date,
  d.notes,
  d.subtotal, d.discount_amount, d.cgst_amount, d.sgst_amount, d.igst_amount,
  d.shipping_amount, d.total_amount,
  d.created_by, d.created_at, d.updated_at
from core.documents d
where d.doc_type = 'sales_order' and d.source_module = 'inventory';

create function inventory.sales_orders_instead_of_insert()
returns trigger
language plpgsql
as $$
declare
  _doc_id uuid;
begin
  insert into core.documents (
    business_id, doc_type, source_module, source_ref, party_id, number, status,
    doc_date, expected_date, notes, discount_amount, shipping_amount, created_by
  ) values (
    new.org_id, 'sales_order', 'inventory', jsonb_build_object('warehouse_id', new.warehouse_id),
    new.customer_id, coalesce(new.so_number, inventory.next_sales_order_number(new.org_id)),
    coalesce(new.status, 'draft'), coalesce(new.order_date, current_date), new.expected_fulfillment_date,
    new.notes, coalesce(new.discount_amount, 0), coalesce(new.shipping_amount, 0),
    coalesce(new.created_by, auth.uid())
  ) returning id into _doc_id;

  new.id := _doc_id;
  return new;
end;
$$;

create trigger sales_orders_instead_of_insert
  instead of insert on inventory.sales_orders
  for each row execute function inventory.sales_orders_instead_of_insert();

create function inventory.sales_orders_instead_of_update()
returns trigger
language plpgsql
as $$
begin
  update core.documents
  set party_id = new.customer_id,
      source_ref = jsonb_set(coalesce(source_ref, '{}'::jsonb), '{warehouse_id}', to_jsonb(new.warehouse_id::text)),
      number = new.so_number, status = new.status, doc_date = new.order_date,
      expected_date = new.expected_fulfillment_date, notes = new.notes,
      discount_amount = new.discount_amount, shipping_amount = new.shipping_amount
  where id = old.id;
  return new;
end;
$$;

create trigger sales_orders_instead_of_update
  instead of update on inventory.sales_orders
  for each row execute function inventory.sales_orders_instead_of_update();

create function inventory.sales_orders_instead_of_delete()
returns trigger
language plpgsql
as $$
begin
  delete from core.documents where id = old.id;
  return old;
end;
$$;

create trigger sales_orders_instead_of_delete
  instead of delete on inventory.sales_orders
  for each row execute function inventory.sales_orders_instead_of_delete();

create view inventory.sales_order_items
with (security_invoker = true) as
select
  dl.id,
  dl.business_id as org_id,
  dl.document_id as sales_order_id,
  dl.item_id as product_id,
  dl.quantity, dl.unit_price, dl.tax_rate,
  dl.cgst_amount, dl.sgst_amount, dl.igst_amount,
  dl.created_at
from core.document_lines dl
join core.documents d on d.id = dl.document_id and d.doc_type = 'sales_order';

create function inventory.sales_order_items_instead_of_insert()
returns trigger
language plpgsql
as $$
declare
  _line_id uuid;
  _tax_rate numeric;
  _hsn text;
begin
  select tax_rate, hsn_code into _tax_rate, _hsn from core.items where id = new.product_id;

  insert into core.document_lines (
    business_id, document_id, item_id, quantity, unit_price, hsn_code, tax_rate,
    cgst_amount, sgst_amount, igst_amount
  ) values (
    new.org_id, new.sales_order_id, new.product_id, new.quantity, coalesce(new.unit_price, 0),
    _hsn, coalesce(new.tax_rate, _tax_rate, 0),
    coalesce(new.cgst_amount, 0), coalesce(new.sgst_amount, 0), coalesce(new.igst_amount, 0)
  ) returning id into _line_id;

  new.id := _line_id;
  return new;
end;
$$;

create trigger sales_order_items_instead_of_insert
  instead of insert on inventory.sales_order_items
  for each row execute function inventory.sales_order_items_instead_of_insert();

create function inventory.sales_order_items_instead_of_update()
returns trigger
language plpgsql
as $$
begin
  update core.document_lines
  set item_id = new.product_id, quantity = new.quantity, unit_price = new.unit_price,
      tax_rate = new.tax_rate, cgst_amount = new.cgst_amount, sgst_amount = new.sgst_amount,
      igst_amount = new.igst_amount
  where id = old.id;
  return new;
end;
$$;

create trigger sales_order_items_instead_of_update
  instead of update on inventory.sales_order_items
  for each row execute function inventory.sales_order_items_instead_of_update();

create function inventory.sales_order_items_instead_of_delete()
returns trigger
language plpgsql
as $$
begin
  delete from core.document_lines where id = old.id;
  return old;
end;
$$;

create trigger sales_order_items_instead_of_delete
  instead of delete on inventory.sales_order_items
  for each row execute function inventory.sales_order_items_instead_of_delete();

-- ---------------------------------------------------------------------------
-- 10. sales_invoices / sales_invoice_items -- over core.documents(doc_type='invoice').
-- customer_gstin/billing_address/shipping_address are resolved live from the party's
-- current tax identity/addresses (SP-3b's own generate_sales_invoice() already made this
-- exact call: "core.documents.party_id already reaches the same data... copying it again
-- would just be a second, driftable copy") -- read-only in this view, never written back.
-- ---------------------------------------------------------------------------

create view inventory.sales_invoices
with (security_invoker = true) as
select
  d.id,
  d.business_id as org_id,
  (d.source_ref->>'sales_order_id')::uuid as sales_order_id,
  d.party_id as customer_id,
  d.number as invoice_number,
  d.doc_date as invoice_date,
  ti.gstin as customer_gstin,
  ba.formatted as billing_address,
  sa.formatted as shipping_address,
  d.subtotal, d.discount_amount, d.cgst_amount, d.sgst_amount, d.igst_amount,
  d.shipping_amount, d.total_amount,
  coalesce(d.payment_status, 'unpaid') as payment_status,
  d.created_by, d.created_at, d.updated_at
from core.documents d
left join core.tax_identities ti on ti.party_id = d.party_id
left join core.addresses ba on ba.party_id = d.party_id and ba.kind = 'billing' and ba.is_primary
left join core.addresses sa on sa.party_id = d.party_id and sa.kind = 'shipping' and sa.is_primary
where d.doc_type = 'invoice' and d.source_module = 'inventory';

create function inventory.sales_invoices_instead_of_insert()
returns trigger
language plpgsql
as $$
declare
  _doc_id uuid;
  _warehouse_id text;
begin
  select source_ref->>'warehouse_id' into _warehouse_id
  from core.documents where id = new.sales_order_id;

  insert into core.documents (
    business_id, doc_type, source_module, source_ref, party_id, number,
    doc_date, discount_amount, shipping_amount, payment_status, created_by
  ) values (
    new.org_id, 'invoice', 'inventory',
    jsonb_build_object('sales_order_id', new.sales_order_id, 'warehouse_id', _warehouse_id),
    new.customer_id, coalesce(new.invoice_number, inventory.next_sales_invoice_number(new.org_id)),
    coalesce(new.invoice_date, current_date), coalesce(new.discount_amount, 0),
    coalesce(new.shipping_amount, 0), coalesce(new.payment_status, 'unpaid'),
    coalesce(new.created_by, auth.uid())
  ) returning id into _doc_id;

  new.id := _doc_id;
  return new;
end;
$$;

create trigger sales_invoices_instead_of_insert
  instead of insert on inventory.sales_invoices
  for each row execute function inventory.sales_invoices_instead_of_insert();

create function inventory.sales_invoices_instead_of_update()
returns trigger
language plpgsql
as $$
begin
  update core.documents
  set number = new.invoice_number, doc_date = new.invoice_date,
      discount_amount = new.discount_amount, shipping_amount = new.shipping_amount,
      payment_status = new.payment_status
  where id = old.id;
  return new;
end;
$$;

create trigger sales_invoices_instead_of_update
  instead of update on inventory.sales_invoices
  for each row execute function inventory.sales_invoices_instead_of_update();

create function inventory.sales_invoices_instead_of_delete()
returns trigger
language plpgsql
as $$
begin
  delete from core.documents where id = old.id;
  return old;
end;
$$;

create trigger sales_invoices_instead_of_delete
  instead of delete on inventory.sales_invoices
  for each row execute function inventory.sales_invoices_instead_of_delete();

create view inventory.sales_invoice_items
with (security_invoker = true) as
select
  dl.id,
  dl.business_id as org_id,
  dl.document_id as invoice_id,
  dl.item_id as product_id,
  dl.hsn_code,
  dl.quantity, dl.unit_price, dl.tax_rate,
  dl.cgst_amount, dl.sgst_amount, dl.igst_amount,
  dl.created_at
from core.document_lines dl
join core.documents d on d.id = dl.document_id and d.doc_type = 'invoice';

create function inventory.sales_invoice_items_instead_of_insert()
returns trigger
language plpgsql
as $$
declare
  _line_id uuid;
  _tax_rate numeric;
  _hsn text;
begin
  select tax_rate, hsn_code into _tax_rate, _hsn from core.items where id = new.product_id;

  insert into core.document_lines (
    business_id, document_id, item_id, quantity, unit_price, hsn_code, tax_rate,
    cgst_amount, sgst_amount, igst_amount
  ) values (
    new.org_id, new.invoice_id, new.product_id, new.quantity, coalesce(new.unit_price, 0),
    coalesce(new.hsn_code, _hsn), coalesce(new.tax_rate, _tax_rate, 0),
    coalesce(new.cgst_amount, 0), coalesce(new.sgst_amount, 0), coalesce(new.igst_amount, 0)
  ) returning id into _line_id;

  new.id := _line_id;
  return new;
end;
$$;

create trigger sales_invoice_items_instead_of_insert
  instead of insert on inventory.sales_invoice_items
  for each row execute function inventory.sales_invoice_items_instead_of_insert();

create function inventory.sales_invoice_items_instead_of_update()
returns trigger
language plpgsql
as $$
begin
  update core.document_lines
  set item_id = new.product_id, hsn_code = new.hsn_code, quantity = new.quantity,
      unit_price = new.unit_price, tax_rate = new.tax_rate, cgst_amount = new.cgst_amount,
      sgst_amount = new.sgst_amount, igst_amount = new.igst_amount
  where id = old.id;
  return new;
end;
$$;

create trigger sales_invoice_items_instead_of_update
  instead of update on inventory.sales_invoice_items
  for each row execute function inventory.sales_invoice_items_instead_of_update();

create function inventory.sales_invoice_items_instead_of_delete()
returns trigger
language plpgsql
as $$
begin
  delete from core.document_lines where id = old.id;
  return old;
end;
$$;

create trigger sales_invoice_items_instead_of_delete
  instead of delete on inventory.sales_invoice_items
  for each row execute function inventory.sales_invoice_items_instead_of_delete();

-- ---------------------------------------------------------------------------
-- 11. purchase_orders / purchase_order_items -- over
-- core.documents(doc_type='purchase_order'). tax_amount has no direct core column (it
-- was StockPilot's own cached cgst+sgst+igst sum) -- computed read-only in the view.
-- ---------------------------------------------------------------------------

create view inventory.purchase_orders
with (security_invoker = true) as
select
  d.id,
  d.business_id as org_id,
  d.party_id as supplier_id,
  (d.source_ref->>'warehouse_id')::uuid as warehouse_id,
  d.number as po_number,
  d.status,
  d.doc_date as order_date,
  d.expected_date as expected_delivery_date,
  d.notes,
  d.subtotal,
  (d.cgst_amount + d.sgst_amount + d.igst_amount) as tax_amount,
  d.discount_amount, d.shipping_amount, d.total_amount,
  d.created_by, d.created_at, d.updated_at,
  d.cgst_amount, d.sgst_amount, d.igst_amount
from core.documents d
where d.doc_type = 'purchase_order' and d.source_module = 'inventory';

create function inventory.purchase_orders_instead_of_insert()
returns trigger
language plpgsql
as $$
declare
  _doc_id uuid;
begin
  insert into core.documents (
    business_id, doc_type, source_module, source_ref, party_id, number, status,
    doc_date, expected_date, notes, discount_amount, shipping_amount, created_by
  ) values (
    new.org_id, 'purchase_order', 'inventory', jsonb_build_object('warehouse_id', new.warehouse_id),
    new.supplier_id, new.po_number, coalesce(new.status, 'draft'),
    coalesce(new.order_date, current_date), new.expected_delivery_date, new.notes,
    coalesce(new.discount_amount, 0), coalesce(new.shipping_amount, 0),
    coalesce(new.created_by, auth.uid())
  ) returning id into _doc_id;

  new.id := _doc_id;
  return new;
end;
$$;

create trigger purchase_orders_instead_of_insert
  instead of insert on inventory.purchase_orders
  for each row execute function inventory.purchase_orders_instead_of_insert();

create function inventory.purchase_orders_instead_of_update()
returns trigger
language plpgsql
as $$
begin
  update core.documents
  set party_id = new.supplier_id,
      source_ref = jsonb_set(coalesce(source_ref, '{}'::jsonb), '{warehouse_id}', to_jsonb(new.warehouse_id::text)),
      number = new.po_number, status = new.status, doc_date = new.order_date,
      expected_date = new.expected_delivery_date, notes = new.notes,
      discount_amount = new.discount_amount, shipping_amount = new.shipping_amount
  where id = old.id;
  return new;
end;
$$;

create trigger purchase_orders_instead_of_update
  instead of update on inventory.purchase_orders
  for each row execute function inventory.purchase_orders_instead_of_update();

create function inventory.purchase_orders_instead_of_delete()
returns trigger
language plpgsql
as $$
begin
  delete from core.documents where id = old.id;
  return old;
end;
$$;

create trigger purchase_orders_instead_of_delete
  instead of delete on inventory.purchase_orders
  for each row execute function inventory.purchase_orders_instead_of_delete();

create view inventory.purchase_order_items
with (security_invoker = true) as
select
  dl.id,
  dl.business_id as org_id,
  dl.document_id as purchase_order_id,
  dl.item_id as product_id,
  dl.quantity,
  dl.received_quantity,
  dl.unit_price as unit_cost,
  dl.created_at,
  dl.tax_rate, dl.cgst_amount, dl.sgst_amount, dl.igst_amount
from core.document_lines dl
join core.documents d on d.id = dl.document_id and d.doc_type = 'purchase_order';

create function inventory.purchase_order_items_instead_of_insert()
returns trigger
language plpgsql
as $$
declare
  _line_id uuid;
  _tax_rate numeric;
  _hsn text;
begin
  select tax_rate, hsn_code into _tax_rate, _hsn from core.items where id = new.product_id;

  insert into core.document_lines (
    business_id, document_id, item_id, quantity, received_quantity, unit_price, hsn_code,
    tax_rate, cgst_amount, sgst_amount, igst_amount
  ) values (
    new.org_id, new.purchase_order_id, new.product_id, new.quantity, coalesce(new.received_quantity, 0),
    coalesce(new.unit_cost, 0), _hsn, coalesce(new.tax_rate, _tax_rate, 0),
    coalesce(new.cgst_amount, 0), coalesce(new.sgst_amount, 0), coalesce(new.igst_amount, 0)
  ) returning id into _line_id;

  new.id := _line_id;
  return new;
end;
$$;

create trigger purchase_order_items_instead_of_insert
  instead of insert on inventory.purchase_order_items
  for each row execute function inventory.purchase_order_items_instead_of_insert();

create function inventory.purchase_order_items_instead_of_update()
returns trigger
language plpgsql
as $$
begin
  update core.document_lines
  set item_id = new.product_id, quantity = new.quantity, received_quantity = new.received_quantity,
      unit_price = new.unit_cost, tax_rate = new.tax_rate, cgst_amount = new.cgst_amount,
      sgst_amount = new.sgst_amount, igst_amount = new.igst_amount
  where id = old.id;
  return new;
end;
$$;

create trigger purchase_order_items_instead_of_update
  instead of update on inventory.purchase_order_items
  for each row execute function inventory.purchase_order_items_instead_of_update();

create function inventory.purchase_order_items_instead_of_delete()
returns trigger
language plpgsql
as $$
begin
  delete from core.document_lines where id = old.id;
  return old;
end;
$$;

create trigger purchase_order_items_instead_of_delete
  instead of delete on inventory.purchase_order_items
  for each row execute function inventory.purchase_order_items_instead_of_delete();

-- ---------------------------------------------------------------------------
-- 12. credit_notes -- over core.documents(doc_type='credit_note'). sales_invoice_id/
-- sales_return_id/is_full live in source_ref (core.documents has no dedicated columns
-- for them -- they are inventory-specific, matching D-6's own source_ref convention).
-- No updated_at in the live source's own shape -- not exposed here either.
-- ---------------------------------------------------------------------------

create view inventory.credit_notes
with (security_invoker = true) as
select
  d.id,
  d.business_id as org_id,
  (d.source_ref->>'sales_invoice_id')::uuid as sales_invoice_id,
  d.number as credit_note_number,
  d.doc_date as credit_note_date,
  d.reason,
  coalesce((d.source_ref->>'is_full')::boolean, false) as is_full,
  d.subtotal, d.cgst_amount, d.sgst_amount, d.igst_amount, d.total_amount,
  d.created_by, d.created_at,
  (d.source_ref->>'sales_return_id')::uuid as sales_return_id
from core.documents d
where d.doc_type = 'credit_note' and d.source_module = 'inventory';

create function inventory.credit_notes_instead_of_insert()
returns trigger
language plpgsql
as $$
declare
  _doc_id uuid;
  _party_id uuid;
begin
  select party_id into _party_id from core.documents where id = new.sales_invoice_id;

  insert into core.documents (
    business_id, doc_type, source_module, source_ref, party_id, number, doc_date, reason, created_by
  ) values (
    new.org_id, 'credit_note', 'inventory',
    jsonb_build_object('sales_invoice_id', new.sales_invoice_id, 'is_full', coalesce(new.is_full, false), 'sales_return_id', new.sales_return_id),
    _party_id, coalesce(new.credit_note_number, inventory.next_credit_note_number(new.org_id)),
    coalesce(new.credit_note_date, current_date), new.reason, coalesce(new.created_by, auth.uid())
  ) returning id into _doc_id;

  new.id := _doc_id;
  return new;
end;
$$;

create trigger credit_notes_instead_of_insert
  instead of insert on inventory.credit_notes
  for each row execute function inventory.credit_notes_instead_of_insert();

create function inventory.credit_notes_instead_of_update()
returns trigger
language plpgsql
as $$
begin
  update core.documents
  set number = new.credit_note_number, doc_date = new.credit_note_date, reason = new.reason,
      source_ref = jsonb_set(coalesce(source_ref, '{}'::jsonb), '{is_full}', to_jsonb(coalesce(new.is_full, false)))
  where id = old.id;
  return new;
end;
$$;

create trigger credit_notes_instead_of_update
  instead of update on inventory.credit_notes
  for each row execute function inventory.credit_notes_instead_of_update();

create function inventory.credit_notes_instead_of_delete()
returns trigger
language plpgsql
as $$
begin
  delete from core.documents where id = old.id;
  return old;
end;
$$;

create trigger credit_notes_instead_of_delete
  instead of delete on inventory.credit_notes
  for each row execute function inventory.credit_notes_instead_of_delete();

-- ---------------------------------------------------------------------------
-- 13/14. debit_notes, proforma_invoices -- schema-ready only in the live source (no
-- RPCs, no numbering function, no UI there either) -- plain CRUD compat views, same
-- shape pattern as credit_notes minus its extra source_ref fields.
-- ---------------------------------------------------------------------------

create view inventory.debit_notes
with (security_invoker = true) as
select
  d.id,
  d.business_id as org_id,
  (d.source_ref->>'sales_invoice_id')::uuid as sales_invoice_id,
  d.number as debit_note_number,
  d.doc_date as debit_note_date,
  d.reason,
  d.subtotal, d.cgst_amount, d.sgst_amount, d.igst_amount, d.total_amount,
  d.created_by, d.created_at
from core.documents d
where d.doc_type = 'debit_note' and d.source_module = 'inventory';

create function inventory.debit_notes_instead_of_insert()
returns trigger
language plpgsql
as $$
declare
  _doc_id uuid;
  _party_id uuid;
begin
  select party_id into _party_id from core.documents where id = new.sales_invoice_id;

  insert into core.documents (business_id, doc_type, source_module, source_ref, party_id, number, doc_date, reason, created_by)
  values (new.org_id, 'debit_note', 'inventory', jsonb_build_object('sales_invoice_id', new.sales_invoice_id),
          _party_id, new.debit_note_number, coalesce(new.debit_note_date, current_date), new.reason, coalesce(new.created_by, auth.uid()))
  returning id into _doc_id;

  new.id := _doc_id;
  return new;
end;
$$;

create trigger debit_notes_instead_of_insert
  instead of insert on inventory.debit_notes
  for each row execute function inventory.debit_notes_instead_of_insert();

create function inventory.debit_notes_instead_of_update()
returns trigger
language plpgsql
as $$
begin
  update core.documents set number = new.debit_note_number, doc_date = new.debit_note_date, reason = new.reason
  where id = old.id;
  return new;
end;
$$;

create trigger debit_notes_instead_of_update
  instead of update on inventory.debit_notes
  for each row execute function inventory.debit_notes_instead_of_update();

create function inventory.debit_notes_instead_of_delete()
returns trigger
language plpgsql
as $$
begin
  delete from core.documents where id = old.id;
  return old;
end;
$$;

create trigger debit_notes_instead_of_delete
  instead of delete on inventory.debit_notes
  for each row execute function inventory.debit_notes_instead_of_delete();

create view inventory.proforma_invoices
with (security_invoker = true) as
select
  d.id,
  d.business_id as org_id,
  (d.source_ref->>'sales_order_id')::uuid as sales_order_id,
  d.party_id as customer_id,
  d.number as proforma_number,
  d.doc_date as proforma_date,
  d.subtotal, d.cgst_amount, d.sgst_amount, d.igst_amount, d.total_amount,
  d.created_by, d.created_at
from core.documents d
where d.doc_type = 'proforma_invoice' and d.source_module = 'inventory';

create function inventory.proforma_invoices_instead_of_insert()
returns trigger
language plpgsql
as $$
declare
  _doc_id uuid;
begin
  insert into core.documents (business_id, doc_type, source_module, source_ref, party_id, number, doc_date, created_by)
  values (new.org_id, 'proforma_invoice', 'inventory', jsonb_build_object('sales_order_id', new.sales_order_id),
          new.customer_id, new.proforma_number, coalesce(new.proforma_date, current_date), coalesce(new.created_by, auth.uid()))
  returning id into _doc_id;

  new.id := _doc_id;
  return new;
end;
$$;

create trigger proforma_invoices_instead_of_insert
  instead of insert on inventory.proforma_invoices
  for each row execute function inventory.proforma_invoices_instead_of_insert();

create function inventory.proforma_invoices_instead_of_update()
returns trigger
language plpgsql
as $$
begin
  update core.documents set party_id = new.customer_id, number = new.proforma_number, doc_date = new.proforma_date
  where id = old.id;
  return new;
end;
$$;

create trigger proforma_invoices_instead_of_update
  instead of update on inventory.proforma_invoices
  for each row execute function inventory.proforma_invoices_instead_of_update();

create function inventory.proforma_invoices_instead_of_delete()
returns trigger
language plpgsql
as $$
begin
  delete from core.documents where id = old.id;
  return old;
end;
$$;

create trigger proforma_invoices_instead_of_delete
  instead of delete on inventory.proforma_invoices
  for each row execute function inventory.proforma_invoices_instead_of_delete();

-- ---------------------------------------------------------------------------
-- 15. sales_returns / sales_return_items -- over core.documents(doc_type='sales_return')
-- + inventory.sales_return_lines_stock (SP-3a's own satellite for restock/is_damaged/
-- reason, already built for exactly this table). Header lifecycle fields
-- (requested_by/approved_by/approved_at/completed_at/cancelled_at/credit_note_id/
-- sales_invoice_id) have no dedicated core.documents columns -- they live in source_ref,
-- same pattern as every other doc_type-specific field in this migration.
-- ---------------------------------------------------------------------------

create view inventory.sales_returns
with (security_invoker = true) as
select
  d.id,
  d.business_id as org_id,
  (d.source_ref->>'sales_order_id')::uuid as sales_order_id,
  (d.source_ref->>'sales_invoice_id')::uuid as sales_invoice_id,
  (d.source_ref->>'credit_note_id')::uuid as credit_note_id,
  d.number as return_number,
  d.status,
  d.doc_date as return_date,
  d.notes,
  coalesce((d.source_ref->>'requested_by')::uuid, d.created_by) as requested_by,
  (d.source_ref->>'approved_by')::uuid as approved_by,
  (d.source_ref->>'approved_at')::timestamptz as approved_at,
  (d.source_ref->>'completed_at')::timestamptz as completed_at,
  (d.source_ref->>'cancelled_at')::timestamptz as cancelled_at,
  d.created_at, d.updated_at
from core.documents d
where d.doc_type = 'sales_return' and d.source_module = 'inventory';

create function inventory.sales_returns_instead_of_insert()
returns trigger
language plpgsql
as $$
declare
  _doc_id uuid;
  _party_id uuid;
begin
  select party_id into _party_id from core.documents where id = new.sales_order_id;

  insert into core.documents (business_id, doc_type, source_module, source_ref, party_id, number, status, doc_date, notes, created_by)
  values (
    new.org_id, 'sales_return', 'inventory',
    jsonb_build_object(
      'sales_order_id', new.sales_order_id, 'sales_invoice_id', new.sales_invoice_id,
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

create trigger sales_returns_instead_of_insert
  instead of insert on inventory.sales_returns
  for each row execute function inventory.sales_returns_instead_of_insert();

create function inventory.sales_returns_instead_of_update()
returns trigger
language plpgsql
as $$
begin
  update core.documents
  set status = new.status, doc_date = new.return_date, notes = new.notes,
      source_ref = source_ref
        || jsonb_build_object('sales_invoice_id', new.sales_invoice_id, 'credit_note_id', new.credit_note_id)
        || case when new.approved_by is not null then jsonb_build_object('approved_by', new.approved_by) else '{}'::jsonb end
        || case when new.approved_at is not null then jsonb_build_object('approved_at', new.approved_at) else '{}'::jsonb end
        || case when new.completed_at is not null then jsonb_build_object('completed_at', new.completed_at) else '{}'::jsonb end
        || case when new.cancelled_at is not null then jsonb_build_object('cancelled_at', new.cancelled_at) else '{}'::jsonb end
  where id = old.id;
  return new;
end;
$$;

create trigger sales_returns_instead_of_update
  instead of update on inventory.sales_returns
  for each row execute function inventory.sales_returns_instead_of_update();

create function inventory.sales_returns_instead_of_delete()
returns trigger
language plpgsql
as $$
begin
  delete from core.documents where id = old.id;
  return old;
end;
$$;

create trigger sales_returns_instead_of_delete
  instead of delete on inventory.sales_returns
  for each row execute function inventory.sales_returns_instead_of_delete();

create view inventory.sales_return_items
with (security_invoker = true) as
select
  dl.id,
  dl.business_id as org_id,
  dl.document_id as sales_return_id,
  dl.item_id as product_id,
  dl.quantity, dl.unit_price,
  coalesce(srls.reason, 'other') as reason,
  coalesce(srls.restock, true) as restock,
  coalesce(srls.is_damaged, false) as is_damaged,
  dl.created_at
from core.document_lines dl
join core.documents d on d.id = dl.document_id and d.doc_type = 'sales_return'
left join inventory.sales_return_lines_stock srls on srls.document_line_id = dl.id;

create function inventory.sales_return_items_instead_of_insert()
returns trigger
language plpgsql
as $$
declare
  _line_id uuid;
begin
  insert into core.document_lines (business_id, document_id, item_id, quantity, unit_price)
  values (new.org_id, new.sales_return_id, new.product_id, new.quantity, coalesce(new.unit_price, 0))
  returning id into _line_id;

  insert into inventory.sales_return_lines_stock (business_id, document_line_id, restock, is_damaged, reason)
  values (new.org_id, _line_id, coalesce(new.restock, true), coalesce(new.is_damaged, false), coalesce(new.reason, 'other'));

  new.id := _line_id;
  return new;
end;
$$;

create trigger sales_return_items_instead_of_insert
  instead of insert on inventory.sales_return_items
  for each row execute function inventory.sales_return_items_instead_of_insert();

create function inventory.sales_return_items_instead_of_update()
returns trigger
language plpgsql
as $$
begin
  update core.document_lines set item_id = new.product_id, quantity = new.quantity, unit_price = new.unit_price
  where id = old.id;

  insert into inventory.sales_return_lines_stock (business_id, document_line_id, restock, is_damaged, reason)
  values (old.org_id, old.id, coalesce(new.restock, true), coalesce(new.is_damaged, false), coalesce(new.reason, 'other'))
  on conflict (document_line_id) do update set
    restock = excluded.restock, is_damaged = excluded.is_damaged, reason = excluded.reason;

  return new;
end;
$$;

create trigger sales_return_items_instead_of_update
  instead of update on inventory.sales_return_items
  for each row execute function inventory.sales_return_items_instead_of_update();

create function inventory.sales_return_items_instead_of_delete()
returns trigger
language plpgsql
as $$
begin
  delete from core.document_lines where id = old.id;
  return old;
end;
$$;

create trigger sales_return_items_instead_of_delete
  instead of delete on inventory.sales_return_items
  for each row execute function inventory.sales_return_items_instead_of_delete();
