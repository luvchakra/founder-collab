-- Epic 2, story C-3: core.modules/core.licenses/core.license_events + the
-- has_module()/has_module_write() checks every module's RLS ultimately calls
-- (00-MASTER-PLAN.md §7, CLAUDE.md non-negotiable #2: "every table's RLS policy is
-- `tenant AND licensed`").
--
-- Licenses are sold at account level and activated per business (00-MASTER-PLAN.md §3:
-- "a customer with two businesses can run FSM in one only") -- core.licenses carries
-- both account_id (denormalized from the business, for account-wide billing/reporting)
-- and business_id (the actual scope of the entitlement).
--
-- Grace period (ADR-9 / CLAUDE.md non-negotiable #4): cancelling a license never deletes
-- data. status moves active -> grace (30-day read-only window, grace_ends_at set) ->
-- expired. has_module() (read access) is true during active AND grace; has_module_write()
-- is true only during active -- the one line that actually enforces "read-only grace".
-- C-4 (license lifecycle service) is what drives these status transitions and writes
-- license_events; this story only lays the tables and the two check functions down.

create table core.modules (
  key text primary key,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

insert into core.modules (key, name, description) values
  ('discovery', 'Discovery', 'Customer discovery: ICP, prospects, research, outreach.'),
  ('inventory', 'Inventory', 'Inventory and purchasing.'),
  ('fsm', 'Field Service', 'Field service management: jobs, scheduling, invoicing.'),
  ('crm', 'CRM', 'Unified inbox and customer relationship management.'),
  ('gst', 'GST', 'GST e-invoicing, e-way bills, and return filing.');

create table core.licenses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references core.accounts (id) on delete cascade,
  business_id uuid not null references core.businesses (id) on delete cascade,
  module_key text not null references core.modules (key),
  status text not null default 'active' check (status in ('active', 'grace', 'expired', 'cancelled')),
  activated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  grace_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, module_key)
);

create index licenses_business_id_idx on core.licenses (business_id);
create index licenses_account_id_idx on core.licenses (account_id);

create table core.license_events (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references core.licenses (id) on delete cascade,
  business_id uuid not null references core.businesses (id) on delete cascade,
  module_key text not null references core.modules (key),
  event_type text not null check (event_type in ('activated', 'deactivated', 'reactivated', 'expired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index license_events_license_id_idx on core.license_events (license_id);
create index license_events_business_id_idx on core.license_events (business_id);

create trigger licenses_set_updated_at
  before update on core.licenses
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Entitlement checks -- every module's RLS calls these. SECURITY DEFINER so the check
-- runs regardless of the caller's own RLS visibility into core.licenses (a module table's
-- policy needs a yes/no answer, not a joinable row), stable so the planner can treat
-- repeated calls in one statement as constant.
-- ---------------------------------------------------------------------------

create function core.has_module(p_business_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = core
as $$
  select exists (
    select 1 from core.licenses
    where business_id = p_business_id
      and module_key = p_key
      and (
        status = 'active'
        or (status = 'grace' and (grace_ends_at is null or grace_ends_at > now()))
      )
  );
$$;

create function core.has_module_write(p_business_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = core
as $$
  select exists (
    select 1 from core.licenses
    where business_id = p_business_id
      and module_key = p_key
      and status = 'active'
  );
$$;

revoke execute on function core.has_module(uuid, text) from public, anon;
revoke execute on function core.has_module_write(uuid, text) from public, anon;
grant execute on function core.has_module(uuid, text) to authenticated;
grant execute on function core.has_module_write(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table core.modules enable row level security;
alter table core.licenses enable row level security;
alter table core.license_events enable row level security;

-- modules: the catalogue is not tenant data -- every authenticated user can read it (the
-- module-registry UI needs the full list to render "not licensed" states), nobody writes
-- it from the client.
create policy "authenticated users can view the module catalogue"
  on core.modules for select
  to authenticated
  using (true);

-- licenses: members of the business can view their own licenses. No client-side
-- insert/update/delete -- activation/deactivation goes through the service-role lifecycle
-- service (C-4), which enforces the state machine and writes license_events atomically.
create policy "members can view their business licenses"
  on core.licenses for select
  using (business_id in (select core.user_business_ids()));

create policy "members can view their business license events"
  on core.license_events for select
  using (business_id in (select core.user_business_ids()));
