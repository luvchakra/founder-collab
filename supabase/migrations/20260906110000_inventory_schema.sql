-- Epic 4, story SP-3a: `inventory` schema DDL -- the tables StockPilot's own disposition
-- table (03-STOCKPILOT-MIGRATION.md §2) calls "move as-is": genuinely inventory-owned,
-- no merge into `core`. Column-identical to StockPilot's live shape (read 2026-09-06)
-- with two systematic changes: `org_id` -> `business_id` (FK repointed to
-- core.businesses, per this story's own scope) and every `product_id` -> `item_id`
-- (FK repointed to core.items, since D-4 already merged StockPilot's products into
-- core.items -- these tables reference the merged entity, not a table that still exists
-- under its old name).
--
-- Enums stay as real Postgres enum types here, per 03-STOCKPILOT-MIGRATION.md's own
-- "known risks" guidance: "Prefer keeping them as enums in `inventory`, but
-- `core.documents.status` should be text + check so FSM/GST can extend it without an
-- ALTER TYPE" -- that guidance is specifically about the enums that used to live on
-- sales_orders/purchase_orders/sales_invoices, which no longer exist as inventory
-- tables (D-6 merged them into core.documents); the enums below (movement_type,
-- alert_severity/status, stock_transfer_status) belong to tables that stay
-- inventory-owned, so the "keep them as enums" half of that guidance applies to them.
--
-- RLS is `tenant AND licensed` (ADR-4, ADR-8, CLAUDE.md non-negotiable #2) -- these are
-- the first real tenant-facing tables in a module's OWN schema since C-9 built
-- core.licensed_business_ids()/write_licensed_business_ids() specifically for this
-- pattern; core.* tables so far have all been cross-module shared data with tenant-only
-- RLS (D-1 through D-10's own migration comments explain why), not one module's own
-- schema. Read access follows core.licensed_business_ids() (active OR grace); writes
-- follow core.write_licensed_business_ids() (active only) -- same active/grace split
-- has_module()/has_module_write() already established in C-3.
--
-- `inventory.sales_return_lines_stock` is the satellite table 03-STOCKPILOT-MIGRATION.md
-- §2 flags for sales_return_items' stock-effect fields ("+ inventory.sales_return_
-- lines_stock for the stock-effect fields, if any"): confirmed by reading StockPilot's
-- live sales_return_items (restock, is_damaged, reason) -- core.document_lines (D-6) is
-- intentionally generic across every doc_type and every module, so these three
-- inventory/sales-return-specific columns live here instead, one row per
-- core.document_lines row that happens to belong to a doc_type='sales_return' document.
--
-- No procedural layer yet (the inventory-state trigger, stock-transfer RPCs,
-- status-transition permission enforcement, GST engine): that's SP-3b, deliberately
-- scoped out of this DDL-only story.

create schema if not exists inventory;

create type inventory.movement_type as enum (
  'inbound', 'outbound', 'adjustment', 'transfer_in', 'transfer_out', 'return', 'damage'
);
create type inventory.alert_severity as enum ('info', 'warning', 'critical');
create type inventory.alert_status as enum ('open', 'acknowledged', 'resolved', 'dismissed');
create type inventory.stock_transfer_status as enum (
  'draft', 'requested', 'approved', 'in_transit', 'received', 'completed', 'cancelled'
);

create table inventory.warehouses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  name text not null,
  code text not null,
  type text not null default 'warehouse',
  address text,
  city text,
  state text,
  country text not null default 'India',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, code)
);

create index warehouses_business_id_idx on inventory.warehouses (business_id);

create trigger warehouses_set_updated_at
  before update on inventory.warehouses
  for each row execute function core.set_updated_at();

create table inventory.stock_levels (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  item_id uuid not null references core.items (id) on delete cascade,
  warehouse_id uuid not null references inventory.warehouses (id) on delete cascade,
  quantity numeric(14, 2) not null default 0,
  reserved numeric(14, 2) not null default 0,
  incoming numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (item_id, warehouse_id)
);

create index stock_levels_business_id_idx on inventory.stock_levels (business_id);
create index stock_levels_warehouse_id_idx on inventory.stock_levels (warehouse_id);

create trigger stock_levels_set_updated_at
  before update on inventory.stock_levels
  for each row execute function core.set_updated_at();

create table inventory.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  item_id uuid not null references core.items (id) on delete cascade,
  warehouse_id uuid not null references inventory.warehouses (id) on delete cascade,
  type inventory.movement_type not null,
  quantity numeric(14, 2) not null,
  reference text,
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index stock_movements_business_id_idx on inventory.stock_movements (business_id);
create index stock_movements_item_id_idx on inventory.stock_movements (item_id);
create index stock_movements_warehouse_id_idx on inventory.stock_movements (warehouse_id);

create table inventory.alerts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  type text not null,
  severity inventory.alert_severity not null default 'info',
  title text not null,
  description text,
  entity_type text,
  entity_id uuid,
  status inventory.alert_status not null default 'open',
  recommended_action text,
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index alerts_business_id_idx on inventory.alerts (business_id);

create trigger alerts_set_updated_at
  before update on inventory.alerts
  for each row execute function core.set_updated_at();

create table inventory.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  transfer_number text not null,
  source_warehouse_id uuid not null references inventory.warehouses (id),
  destination_warehouse_id uuid not null references inventory.warehouses (id),
  status inventory.stock_transfer_status not null default 'draft',
  notes text,
  requested_by uuid not null default auth.uid(),
  approved_by uuid,
  shipped_at timestamptz,
  received_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, transfer_number),
  check (destination_warehouse_id <> source_warehouse_id)
);

create index stock_transfers_business_id_idx on inventory.stock_transfers (business_id);

create trigger stock_transfers_set_updated_at
  before update on inventory.stock_transfers
  for each row execute function core.set_updated_at();

create table inventory.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  stock_transfer_id uuid not null references inventory.stock_transfers (id) on delete cascade,
  item_id uuid not null references core.items (id),
  quantity numeric(14, 2) not null check (quantity > 0),
  received_quantity numeric(14, 2) not null default 0 check (received_quantity >= 0),
  damaged_quantity numeric(14, 2) not null default 0 check (damaged_quantity >= 0),
  created_at timestamptz not null default now()
);

create index stock_transfer_items_business_id_idx on inventory.stock_transfer_items (business_id);
create index stock_transfer_items_transfer_id_idx on inventory.stock_transfer_items (stock_transfer_id);

create table inventory.sales_return_lines_stock (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  document_line_id uuid not null unique references core.document_lines (id) on delete cascade,
  restock boolean not null default true,
  is_damaged boolean not null default false,
  reason text not null default 'other',
  created_at timestamptz not null default now()
);

create index sales_return_lines_stock_business_id_idx on inventory.sales_return_lines_stock (business_id);

-- Dev tooling (StockPilot's admin seed-data tool, ported alongside it in a future SP-7
-- sub-story) -- service_role only, matching the live source's own
-- "REVOKE ALL ... FROM anon, authenticated" exactly. No update trigger: these are
-- write-once audit rows of what a seed run created, never edited after insert.
create table inventory.demo_seed_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  target_user_id uuid not null,
  requested_by uuid not null,
  record_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index demo_seed_batches_business_id_idx on inventory.demo_seed_batches (business_id);

create table inventory.demo_seed_records (
  id bigint generated always as identity primary key,
  batch_id uuid not null references inventory.demo_seed_batches (id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  created_at timestamptz not null default now()
);

create index demo_seed_records_batch_id_idx on inventory.demo_seed_records (batch_id);
create index demo_seed_records_lookup_idx on inventory.demo_seed_records (table_name, record_id);

-- ---------------------------------------------------------------------------
-- Cross-tenant integrity: the same "confused deputy" gap D-1 through D-8 closed for
-- core's own cross-references applies here too, wherever a row carries both its own
-- business_id and a reference to another business_id-scoped row (inventory's own
-- warehouse_id references, plus the cross-schema item_id/document_line_id references
-- into core).
-- ---------------------------------------------------------------------------

create function inventory.enforce_warehouse_business_id(p_warehouse_id uuid, p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = inventory
as $$
declare
  actual_business_id uuid;
begin
  select business_id into actual_business_id from inventory.warehouses where id = p_warehouse_id;
  if actual_business_id is null or actual_business_id <> p_business_id then
    raise exception 'warehouse_id % does not belong to business_id %', p_warehouse_id, p_business_id;
  end if;
end;
$$;

create function inventory.enforce_item_business_id(p_item_id uuid, p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = core
as $$
declare
  actual_business_id uuid;
begin
  select business_id into actual_business_id from core.items where id = p_item_id;
  if actual_business_id is null or actual_business_id <> p_business_id then
    raise exception 'item_id % does not belong to business_id %', p_item_id, p_business_id;
  end if;
end;
$$;

create function inventory.enforce_stock_levels_business_id()
returns trigger
language plpgsql
security definer
set search_path = inventory
as $$
begin
  perform inventory.enforce_item_business_id(new.item_id, new.business_id);
  perform inventory.enforce_warehouse_business_id(new.warehouse_id, new.business_id);
  return new;
end;
$$;

create trigger stock_levels_enforce_business_id
  before insert or update on inventory.stock_levels
  for each row execute function inventory.enforce_stock_levels_business_id();

create function inventory.enforce_stock_movements_business_id()
returns trigger
language plpgsql
security definer
set search_path = inventory
as $$
begin
  perform inventory.enforce_item_business_id(new.item_id, new.business_id);
  perform inventory.enforce_warehouse_business_id(new.warehouse_id, new.business_id);
  return new;
end;
$$;

create trigger stock_movements_enforce_business_id
  before insert or update on inventory.stock_movements
  for each row execute function inventory.enforce_stock_movements_business_id();

create function inventory.enforce_stock_transfers_business_id()
returns trigger
language plpgsql
security definer
set search_path = inventory
as $$
begin
  perform inventory.enforce_warehouse_business_id(new.source_warehouse_id, new.business_id);
  perform inventory.enforce_warehouse_business_id(new.destination_warehouse_id, new.business_id);
  return new;
end;
$$;

create trigger stock_transfers_enforce_business_id
  before insert or update on inventory.stock_transfers
  for each row execute function inventory.enforce_stock_transfers_business_id();

create function inventory.enforce_stock_transfer_items_business_id()
returns trigger
language plpgsql
security definer
set search_path = inventory
as $$
declare
  transfer_business_id uuid;
begin
  select business_id into transfer_business_id
  from inventory.stock_transfers where id = new.stock_transfer_id;
  if transfer_business_id is null or transfer_business_id <> new.business_id then
    raise exception 'stock_transfer_id % does not belong to business_id %', new.stock_transfer_id, new.business_id;
  end if;
  perform inventory.enforce_item_business_id(new.item_id, new.business_id);
  return new;
end;
$$;

create trigger stock_transfer_items_enforce_business_id
  before insert or update on inventory.stock_transfer_items
  for each row execute function inventory.enforce_stock_transfer_items_business_id();

create function inventory.enforce_sales_return_lines_stock_business_id()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  actual_business_id uuid;
begin
  select business_id into actual_business_id from core.document_lines where id = new.document_line_id;
  if actual_business_id is null or actual_business_id <> new.business_id then
    raise exception 'document_line_id % does not belong to business_id %', new.document_line_id, new.business_id;
  end if;
  return new;
end;
$$;

create trigger sales_return_lines_stock_enforce_business_id
  before insert or update on inventory.sales_return_lines_stock
  for each row execute function inventory.enforce_sales_return_lines_stock_business_id();

-- ---------------------------------------------------------------------------
-- Row Level Security -- `tenant AND licensed`
-- ---------------------------------------------------------------------------

alter table inventory.warehouses enable row level security;
alter table inventory.stock_levels enable row level security;
alter table inventory.stock_movements enable row level security;
alter table inventory.alerts enable row level security;
alter table inventory.stock_transfers enable row level security;
alter table inventory.stock_transfer_items enable row level security;
alter table inventory.sales_return_lines_stock enable row level security;
alter table inventory.demo_seed_batches enable row level security;
alter table inventory.demo_seed_records enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'warehouses', 'stock_levels', 'stock_movements', 'alerts',
    'stock_transfers', 'stock_transfer_items', 'sales_return_lines_stock'
  ]
  loop
    execute format(
      $sql$create policy "members can view %1$s in their licensed businesses"
        on inventory.%1$I for select
        using (
          business_id in (select core.user_business_ids())
          and business_id in (select core.licensed_business_ids('inventory'))
        )$sql$,
      t
    );
    execute format(
      $sql$create policy "members can create %1$s in their licensed businesses"
        on inventory.%1$I for insert
        with check (
          business_id in (select core.user_business_ids())
          and business_id in (select core.write_licensed_business_ids('inventory'))
        )$sql$,
      t
    );
    execute format(
      $sql$create policy "members can update %1$s in their licensed businesses"
        on inventory.%1$I for update
        using (
          business_id in (select core.user_business_ids())
          and business_id in (select core.write_licensed_business_ids('inventory'))
        )$sql$,
      t
    );
    execute format(
      $sql$create policy "members can delete %1$s in their licensed businesses"
        on inventory.%1$I for delete
        using (
          business_id in (select core.user_business_ids())
          and business_id in (select core.write_licensed_business_ids('inventory'))
        )$sql$,
      t
    );
  end loop;
end $$;

-- demo_seed_batches/records: no policies at all, matching the live source's
-- "REVOKE ALL ... FROM anon, authenticated" -- service-role (admin client) only.
