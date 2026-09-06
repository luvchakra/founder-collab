-- Core platform schema (Epic 2, story C-1): the cross-module tenancy root every module
-- shares -- 00-MASTER-PLAN.md §5's entity-ownership map: "Account, membership, roles" and
-- "Business (org/company)" are core concepts, not owned by any one module.
--
-- These two tables (`accounts`, `account_members`, `businesses`) were originally created
-- inside `discovery`'s own schema (20260906100000_discovery_schema.sql), before `core`
-- existed and before there was a second module to share them with -- see that migration's
-- own docstring, which named this exact move as "Epic 2's C-1 job". This migration is
-- that move: the tables, their auto-provisioning trigger, their `security definer` RLS
-- helpers, and their RLS policies all move here verbatim (schema-qualified to `core`
-- instead of `discovery`). `discovery.products`/`discovery.workspaces` stay in
-- `discovery` (ADR-4: workspace_id is discovery's own tenant boundary) and now carry a
-- cross-schema FK into `core.businesses` -- the one kind of cross-schema FK the platform
-- allows (00-MASTER-PLAN.md §4 rule 2).
--
-- Runs before 20260906100000_discovery_schema.sql in the migration timeline (this
-- filename's timestamp is earlier) since discovery.products' FK depends on
-- core.businesses existing first.

create schema if not exists core;

-- ---------------------------------------------------------------------------
-- Tenancy: accounts -> account_members / businesses
-- ---------------------------------------------------------------------------

create table core.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table core.account_members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references core.accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (account_id, user_id)
);

create table core.businesses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references core.accounts (id) on delete cascade,
  name text not null,
  description text,
  website text,
  industry text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index account_members_user_id_idx on core.account_members (user_id);
create index account_members_account_id_idx on core.account_members (account_id);
create index businesses_account_id_idx on core.businesses (account_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function core.set_updated_at()
returns trigger
language plpgsql
set search_path = core
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger accounts_set_updated_at
  before update on core.accounts
  for each row execute function core.set_updated_at();
create trigger businesses_set_updated_at
  before update on core.businesses
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tenant-resolution helper functions.
--
-- SECURITY DEFINER so the body runs with the owning role's privileges and is NOT itself
-- subject to the RLS policies below -- this is what breaks the recursion that would
-- otherwise occur (a policy on account_members calling a function that queries
-- account_members through that same policy). Each function explicitly filters by
-- auth.uid(), so it never leaks another user's data despite bypassing RLS internally.
-- Exact pattern as discovery.user_account_ids()/user_business_ids() before this move.
-- ---------------------------------------------------------------------------

create function core.user_account_ids()
returns setof uuid
language sql
stable
security definer
set search_path = core
as $$
  select account_id from core.account_members where user_id = auth.uid();
$$;

create function core.user_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = core
as $$
  select b.id from core.businesses b where b.account_id in (select core.user_account_ids());
$$;

-- Separate from user_account_ids() -- a policy that self-references account_members
-- (e.g. "can I add a member to this account") needs to filter by role too, and doing
-- that filter inline in the policy (rather than through this function) is exactly the
-- self-referencing subquery that caused "infinite recursion detected in policy for
-- relation" the first time this was tried directly against business_members (a table
-- with the identical role-gated insert/delete shape) -- fixed here before it could bite
-- account_members too.
create function core.user_admin_account_ids()
returns setof uuid
language sql
stable
security definer
set search_path = core
as $$
  select account_id from core.account_members
  where user_id = auth.uid() and role in ('owner', 'admin');
$$;

revoke execute on function core.user_account_ids() from public, anon;
revoke execute on function core.user_business_ids() from public, anon;
revoke execute on function core.user_admin_account_ids() from public, anon;
grant execute on function core.user_account_ids() to authenticated;
grant execute on function core.user_business_ids() to authenticated;
grant execute on function core.user_admin_account_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table core.accounts enable row level security;
alter table core.account_members enable row level security;
alter table core.businesses enable row level security;

-- accounts: members can view; owners/admins can update. No client-side insert/delete --
-- accounts are created only via handle_new_user() below.
create policy "members can view their accounts"
  on core.accounts for select
  using (id in (select core.user_account_ids()));

create policy "owners and admins can update their accounts"
  on core.accounts for update
  using (id in (select core.user_admin_account_ids()));

-- account_members: members can view membership of their own accounts; owners/admins can
-- manage membership.
create policy "members can view membership of their accounts"
  on core.account_members for select
  using (account_id in (select core.user_account_ids()));

create policy "owners and admins can add members"
  on core.account_members for insert
  with check (account_id in (select core.user_admin_account_ids()));

create policy "owners and admins can remove members"
  on core.account_members for delete
  using (account_id in (select core.user_admin_account_ids()));

-- businesses: any member of the owning account can view/create/update/delete.
create policy "members can view businesses in their account"
  on core.businesses for select
  using (account_id in (select core.user_account_ids()));
create policy "members can create businesses in their account"
  on core.businesses for insert
  with check (account_id in (select core.user_account_ids()));
create policy "members can update businesses in their account"
  on core.businesses for update
  using (account_id in (select core.user_account_ids()));
create policy "members can delete businesses in their account"
  on core.businesses for delete
  using (account_id in (select core.user_account_ids()));

-- ---------------------------------------------------------------------------
-- New-user auto-provisioning
-- ---------------------------------------------------------------------------

-- Every new auth user gets their own account as owner. Prefers the signup form's Name
-- field (raw_user_meta_data.full_name) over the email-prefix fallback. Moved from
-- discovery.handle_new_user() -- account creation is platform-wide, not a discovery
-- concern, and every module (inventory/fsm/crm/gst) needs the same new-user bootstrap.
create function core.handle_new_user()
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

  return new;
end;
$$;

revoke execute on function core.handle_new_user() from public, anon, authenticated;

create trigger on_core_user_created
  after insert on auth.users
  for each row execute function core.handle_new_user();
