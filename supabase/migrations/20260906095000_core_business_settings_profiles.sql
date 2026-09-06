-- Epic 2, story C-2: core.business_settings, core.user_profiles, core.employees,
-- core.business_members -- rounding out the platform-wide tenancy/identity layer that
-- C-1 (core_schema.sql) started.
--
-- Sourced from stockpilot-ai-ops (read live, per docs/plan/05 §B.7's freeze policy):
-- `organizations`' base columns (slug, industry, currency, timezone, plan) plus the GST
-- columns 20260901120000_gst_engine.sql later added (gstin, state,
-- gst_registration_type) become `core.business_settings` -- 03-STOCKPILOT-MIGRATION.md
-- §2's disposition table ("organizations -> core.businesses + core.business_settings").
-- `industry` stays on `core.businesses` itself (already ported there in C-1 from
-- discovery.businesses); everything else org-settings-shaped lands here, one-to-one with
-- a business. `locale` and `fiscal_year_start_month` are 00-MASTER-PLAN.md §Epic 2 C-2's
-- own additions, with no StockPilot equivalent -- StockPilot has no fiscal-year concept
-- yet, but GST reporting (GSTR1) needs one, so it's added now rather than retrofitted
-- under SP-3b.
--
-- `profiles` becomes `core.user_profiles`, same shape. `organization_members` role-based
-- membership becomes `core.business_members` -- kept to the generic owner/admin/member
-- role set already used by core.account_members (C-1), not StockPilot's inventory-
-- specific role catalog (inventory_manager, procurement_manager, ...): that catalog is
-- module-scoped permission data, C-7's job (core.permissions/role_permissions), not a
-- platform-wide membership concept.
--
-- `employees` is new -- StockPilot has no separate concept (an "employee" there is just
-- an organization_member); the platform's is a genuine addition per
-- 00-MASTER-PLAN.md §5 ("Employee / technician ... a technician is an employee, not a
-- second user record") since FSM (Epic 5) needs employment attributes a business_members
-- role row doesn't carry (job title, employment type, hire date).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table core.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core.business_settings (
  business_id uuid primary key references core.businesses (id) on delete cascade,
  slug text unique,
  plan text not null default 'starter',
  currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  locale text not null default 'en-IN',
  -- Month (1-12) the business's fiscal year starts in -- 4 (April) is the Indian
  -- financial-year default; GST reporting (GSTR1, Epic 4's SP-3b) needs this to bucket
  -- documents into the right fiscal year.
  fiscal_year_start_month smallint not null default 4 check (fiscal_year_start_month between 1 and 12),
  gstin text,
  state text,
  gst_registration_type text not null default 'regular'
    check (gst_registration_type in ('regular', 'composition', 'unregistered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 'owner'/'admin' are platform-level (full business management, incl. membership
  -- itself); the rest are C-7's StockPilot-derived operational roles, each carrying its
  -- own permission set via core.role_permissions -- a business_members row holds exactly
  -- one role, same as StockPilot's own organization_members.role.
  role text not null default 'viewer' check (role in (
    'owner', 'admin',
    'inventory_manager', 'procurement_manager', 'sales_manager', 'accountant',
    'warehouse_operator', 'viewer'
  )),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index business_members_business_id_idx on core.business_members (business_id);
create index business_members_user_id_idx on core.business_members (user_id);

create table core.employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  job_title text,
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time', 'part_time', 'contractor')),
  is_active boolean not null default true,
  hire_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index employees_business_id_idx on core.employees (business_id);
create index employees_user_id_idx on core.employees (user_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create trigger user_profiles_set_updated_at
  before update on core.user_profiles
  for each row execute function core.set_updated_at();
create trigger business_settings_set_updated_at
  before update on core.business_settings
  for each row execute function core.set_updated_at();
create trigger employees_set_updated_at
  before update on core.employees
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- New-user bootstrap: extend C-1's handle_new_user() (create or replace keeps the
-- existing on_core_user_created trigger binding) to also seed the new user's profile
-- row, mirroring StockPilot's own on_auth_user_created -> profiles insert.
-- ---------------------------------------------------------------------------

create or replace function core.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  new_account_id uuid;
begin
  insert into core.accounts (name)
  values (
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'My'
    ) || '''s Account'
  )
  returning id into new_account_id;

  insert into core.account_members (account_id, user_id, role)
  values (new_account_id, new.id, 'owner');

  insert into core.user_profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- A role-gated insert/delete policy on business_members can't subquery
-- business_members directly -- Postgres reported "infinite recursion detected in
-- policy for relation business_members" the first time this was tried inline, the exact
-- failure mode core.user_account_ids()/user_business_ids() (core_schema.sql) were
-- already written as SECURITY DEFINER functions to avoid. Same fix here.
-- ---------------------------------------------------------------------------

create function core.user_admin_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = core
as $$
  select business_id from core.business_members
  where user_id = auth.uid() and role in ('owner', 'admin');
$$;

revoke execute on function core.user_admin_business_ids() from public, anon;
grant execute on function core.user_admin_business_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table core.user_profiles enable row level security;
alter table core.business_settings enable row level security;
alter table core.business_members enable row level security;
alter table core.employees enable row level security;

create policy "users can view their own profile"
  on core.user_profiles for select
  using (id = (select auth.uid()));
create policy "co-members can view each other's profile"
  on core.user_profiles for select
  using (
    id in (
      select bm2.user_id from core.business_members bm1
      join core.business_members bm2 on bm2.business_id = bm1.business_id
      where bm1.user_id = (select auth.uid())
    )
  );
create policy "users can update their own profile"
  on core.user_profiles for update
  using (id = (select auth.uid()));

create policy "members can view their business settings"
  on core.business_settings for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create their business settings"
  on core.business_settings for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update their business settings"
  on core.business_settings for update
  using (business_id in (select core.user_business_ids()));

create policy "members can view membership of their businesses"
  on core.business_members for select
  using (business_id in (select core.user_business_ids()));
create policy "business owners and admins can add members"
  on core.business_members for insert
  with check (
    business_id in (select core.user_admin_business_ids())
    -- the business's own account owner/admin (via core.account_members) can also add the
    -- first business member, since a freshly created business has none yet.
    or business_id in (
      select b.id from core.businesses b
      where b.account_id in (select core.user_admin_account_ids())
    )
    -- self-service: any account member (any role) can add themselves as a member of a
    -- business their account already owns -- covers createBusiness() adding its own
    -- creator regardless of that creator's account-level role.
    or (user_id = (select auth.uid()) and business_id in (select core.user_business_ids()))
  );
create policy "business owners and admins can remove members"
  on core.business_members for delete
  using (business_id in (select core.user_admin_business_ids()));

create policy "members can view employees in their businesses"
  on core.employees for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create employees in their businesses"
  on core.employees for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update employees in their businesses"
  on core.employees for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete employees in their businesses"
  on core.employees for delete
  using (business_id in (select core.user_business_ids()));
