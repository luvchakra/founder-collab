-- Bookkeeping tables for the platform-admin "seed demo data" tool
-- (apps/web/app/(dashboard)/dashboard/admin). Ported from stockpilot-ai-ops's
-- public.demo_seed_batches/demo_seed_records (20260912000000_admin_seed_data_tool.sql),
-- promoted to `core` since the tool itself can seed demo data for any licensed module's
-- tables, not only inventory's -- module-inventory is the only caller today.
--
-- Deliberately NOT granted to `authenticated` at all (not just RLS-denied): only the
-- service-role admin client the admin page's server actions use can read or write them.
-- Every row a seed run inserts into any business table is recorded here, so "delete
-- demo data" can remove exactly those rows -- never anything a business's real users
-- added themselves.
create table core.demo_seed_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  target_user_id uuid not null,
  requested_by uuid not null,
  record_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index demo_seed_batches_business_id_idx on core.demo_seed_batches (business_id);

alter table core.demo_seed_batches enable row level security;
revoke all on core.demo_seed_batches from anon, authenticated;
grant all on core.demo_seed_batches to service_role;

create table core.demo_seed_records (
  id bigint generated always as identity primary key,
  batch_id uuid not null references core.demo_seed_batches (id) on delete cascade,
  -- The Postgres schema the row lives in ('inventory' today), alongside the table name --
  -- unlike the single-schema original, this platform's tables are split across schemas,
  -- so "table_name" alone is no longer enough to find a row back.
  schema_name text not null,
  table_name text not null,
  record_id uuid not null,
  created_at timestamptz not null default now()
);

create index demo_seed_records_batch_id_idx on core.demo_seed_records (batch_id);

alter table core.demo_seed_records enable row level security;
revoke all on core.demo_seed_records from anon, authenticated;
grant all on core.demo_seed_records to service_role;
