-- Epic 3, story D-4: core.item_categories/items/item_inventory_attrs + core.tax_rates
-- (00-MASTER-PLAN.md §5). "Item" is anything sellable/stockable -- StockPilot's
-- `products` (36 rows, read live) and Kickserv's Items/Services/charge items are the
-- same noun with a `kind` discriminator, never duplicated per module.
--
-- Columns on core.items are StockPilot's own public.products columns (read live,
-- 2026-09-06), minus `barcode` (03-STOCKPILOT-MIGRATION.md explicitly places that on
-- item_inventory_attrs, not items) and with `supplier_id` renamed/repointed to
-- `supplier_party_id -> core.parties(id)` (D-1 already replaced "supplier" as its own
-- table with "party holding the supplier role"). `sku` is nullable here (unlike the
-- live table's NOT NULL) because a `kind='service'`/'labour' item from FSM has no SKU
-- concept at all -- the future StockPilot compat view (SP-4) is exactly where a
-- kind='good'-only NOT NULL constraint belongs, since it's StockPilot's own invariant,
-- not every module's.
--
-- core.tax_rates is a platform-wide (not tenant-scoped) catalog of the standard GST
-- slabs, not core.items' own tax_rate column -- 03-STOCKPILOT-MIGRATION.md §"known
-- risks" confirms items keep their own tax_rate/hsn_code (FSM's document_lines will
-- later copy these per-line so historical documents don't drift if a rate changes).
-- This table exists so inventory/fsm/gst all validate against or offer the same set of
-- valid rates instead of each hardcoding its own list -- same "readable by everyone,
-- writable by nobody from the client" shape as core.modules/core.permissions.

create table core.item_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  name text not null,
  description text,
  parent_id uuid references core.item_categories (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index item_categories_business_id_idx on core.item_categories (business_id);

create trigger item_categories_set_updated_at
  before update on core.item_categories
  for each row execute function core.set_updated_at();

create table core.items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  kind text not null default 'good' check (kind in ('good', 'service', 'labour', 'part', 'expense')),
  sku text,
  name text not null,
  description text,
  category_id uuid references core.item_categories (id) on delete set null,
  supplier_party_id uuid references core.parties (id) on delete set null,
  unit text not null default 'pcs',
  hsn_code text,
  tax_rate numeric(5, 2) not null default 18,
  cost_price numeric(14, 2) not null default 0,
  selling_price numeric(14, 2) not null default 0,
  image_url text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_business_id_idx on core.items (business_id);
create index items_category_id_idx on core.items (category_id);
create index items_supplier_party_id_idx on core.items (supplier_party_id);

-- Matches the live table's `UNIQUE (org_id, sku)` -- partial because sku is nullable
-- here (service/labour items have none) and a unique index treats every null as
-- distinct anyway, but being explicit says what's actually enforced.
create unique index items_business_id_sku_key
  on core.items (business_id, sku)
  where sku is not null;

create trigger items_set_updated_at
  before update on core.items
  for each row execute function core.set_updated_at();

-- Same "confused deputy" gap D-1/D-2 closed for party_id columns, applied to this
-- optional one: nothing but this trigger stops a member of business B from setting
-- supplier_party_id to a party that actually belongs to business A while business_id
-- correctly says B (which alone satisfies RLS's with-check, since that only looks at
-- the row's own business_id column).
create function core.enforce_item_supplier_party_business_id()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  actual_business_id uuid;
begin
  if new.supplier_party_id is null then
    return new;
  end if;
  select business_id into actual_business_id from core.parties where id = new.supplier_party_id;
  if actual_business_id is null or actual_business_id <> new.business_id then
    raise exception 'supplier_party_id % does not belong to business_id %', new.supplier_party_id, new.business_id;
  end if;
  return new;
end;
$$;

create trigger items_enforce_supplier_party_business_id
  before insert or update on core.items
  for each row execute function core.enforce_item_supplier_party_business_id();

create table core.item_inventory_attrs (
  item_id uuid primary key references core.items (id) on delete cascade,
  business_id uuid not null references core.businesses (id) on delete cascade,
  reorder_point numeric(14, 2) not null default 0,
  reorder_quantity numeric(14, 2) not null default 0,
  barcode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index item_inventory_attrs_business_id_idx on core.item_inventory_attrs (business_id);

create trigger item_inventory_attrs_set_updated_at
  before update on core.item_inventory_attrs
  for each row execute function core.set_updated_at();

-- item_inventory_attrs.item_id isn't a "party_id" column, but the same cross-tenant risk
-- shape applies to any (business_id, <fk to another core table>) pair -- reuse the
-- pattern with an items-specific check.
create function core.enforce_item_inventory_attrs_business_id()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  actual_business_id uuid;
begin
  select business_id into actual_business_id from core.items where id = new.item_id;
  if actual_business_id is null or actual_business_id <> new.business_id then
    raise exception 'item_id % does not belong to business_id %', new.item_id, new.business_id;
  end if;
  return new;
end;
$$;

create trigger item_inventory_attrs_enforce_business_id
  before insert or update on core.item_inventory_attrs
  for each row execute function core.enforce_item_inventory_attrs_business_id();

create table core.tax_rates (
  id uuid primary key default gen_random_uuid(),
  rate numeric(5, 2) not null unique,
  label text not null,
  created_at timestamptz not null default now()
);

insert into core.tax_rates (rate, label) values
  (0, 'GST 0%'),
  (5, 'GST 5%'),
  (12, 'GST 12%'),
  (18, 'GST 18%'),
  (28, 'GST 28%');

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table core.item_categories enable row level security;
alter table core.items enable row level security;
alter table core.item_inventory_attrs enable row level security;
alter table core.tax_rates enable row level security;

create policy "members can view item categories in their businesses"
  on core.item_categories for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create item categories in their businesses"
  on core.item_categories for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update item categories in their businesses"
  on core.item_categories for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete item categories in their businesses"
  on core.item_categories for delete
  using (business_id in (select core.user_business_ids()));

create policy "members can view items in their businesses"
  on core.items for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create items in their businesses"
  on core.items for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update items in their businesses"
  on core.items for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete items in their businesses"
  on core.items for delete
  using (business_id in (select core.user_business_ids()));

create policy "members can view item inventory attrs in their businesses"
  on core.item_inventory_attrs for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create item inventory attrs in their businesses"
  on core.item_inventory_attrs for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update item inventory attrs in their businesses"
  on core.item_inventory_attrs for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete item inventory attrs in their businesses"
  on core.item_inventory_attrs for delete
  using (business_id in (select core.user_business_ids()));

-- Catalogue, not tenant data -- every authenticated user can read it, nobody writes it
-- from the client (service-role/migration only), same shape as core.modules/permissions.
create policy "authenticated users can view the tax rate catalogue"
  on core.tax_rates for select
  to authenticated
  using (true);
