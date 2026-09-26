-- RBAC-01 (findings in docs/design/rbac.md), RBAC-02..RBAC-06 (RBAC-03: the eight existing
-- role strings become system roles with their grants carried over), RBAC-09, RBAC-19 -- business-scoped roles, grants and effective
-- permissions (docs/plan/15-MULTI-USER-RBAC-BACKLOG.md §3-§12, §39-§45, §49-§51).
--
-- Extends the existing foundation rather than replacing it (§2):
--   * core.permissions stays the one permission catalogue; new keys are added, none renamed.
--   * core.business_members stays the membership table; it gains role_id, status and
--     lifecycle timestamps. The legacy `role` text column is kept in sync by trigger so
--     every existing reader keeps working.
--   * core.role_permissions (role text -> key) stays for existing readers; the new
--     core.role_permission_grants (role id -> key) is what authorization now reads, so a
--     business can have its own custom roles.
--   * core.has_permission(business, key) keeps its signature -- 129 RLS policies call it
--     -- and now resolves through the caller's *active* membership role in that business.
--
-- The tenancy rule changes in one place: core.user_business_ids(). A business is visible
-- to the owners/admins of the account that owns it (unchanged for every existing user --
-- all current account members are owners) and to anyone with an *active* membership in it
-- (new: invited users from other accounts). Suspended and removed members see nothing.
--
-- Module RLS gains the permission layer through the two helpers every module policy
-- already calls: core.licensed_business_ids(module) now also requires the caller's module
-- view permission (or an operational role), and core.write_licensed_business_ids(module) a
-- role that can write at all -- see the comment above those functions. So module tables enforce tenant AND licensed AND permission (§49)
-- without rewriting ~450 policies. Discovery's own policies are untouched (§37).

-- ---------------------------------------------------------------------------------------
-- Roles (§5, §13-§15)
-- ---------------------------------------------------------------------------------------

create table core.roles (
  id uuid primary key default gen_random_uuid(),
  -- null = system role, shared by every business; otherwise a business's own custom role.
  business_id uuid references core.businesses (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  name text not null check (btrim(name) <> '' and length(name) <= 80),
  description text check (description is null or length(description) <= 500),
  role_type text not null check (role_type in ('system', 'custom')),
  -- The template a custom role was copied from (§14); copying never links them.
  template_key text,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((business_id is null) = (role_type = 'system'))
);
create unique index roles_system_key_idx on core.roles (key) where business_id is null;
create unique index roles_business_key_idx on core.roles (business_id, key) where business_id is not null;
create index roles_business_idx on core.roles (business_id);

insert into core.roles (key, name, description, role_type) values
  ('owner', 'Owner', 'Full control of the business, including billing, members and ownership.', 'system'),
  ('admin', 'Admin', 'Manages members, roles and every module, except ownership.', 'system'),
  ('inventory_manager', 'Inventory Manager', 'Runs products, stock, transfers and suppliers.', 'system'),
  ('procurement_manager', 'Procurement Manager', 'Runs purchasing and suppliers.', 'system'),
  ('sales_manager', 'Sales Manager', 'Runs customers, orders, CRM and sales.', 'system'),
  ('accountant', 'Accountant', 'Works with invoices, finance and reports.', 'system'),
  ('warehouse_operator', 'Warehouse Operator', 'Receives, ships and transfers stock.', 'system'),
  ('viewer', 'Viewer', 'Read-only access to the modules the business uses.', 'system');

create table core.role_permission_grants (
  role_id uuid not null references core.roles (id) on delete cascade,
  permission_key text not null references core.permissions (key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_key)
);
create index role_permission_grants_permission_idx on core.role_permission_grants (permission_key);

-- ---------------------------------------------------------------------------------------
-- Permission catalogue additions (§9, §32, §33). Existing keys are reused where they exist
-- (inventory.view, crm.view, marketing.view, funding.view); only missing boundaries are
-- added.
-- ---------------------------------------------------------------------------------------

insert into core.permissions (key, module, description) values
  ('business.view', 'core', 'See the business and its settings'),
  ('business.edit', 'core', 'Edit the business profile'),
  ('business.settings.manage', 'core', 'Change business settings (currency, tax, fiscal year)'),
  ('members.view', 'core', 'See the people who have access to the business'),
  ('members.invite', 'core', 'Invite people to the business'),
  ('members.edit', 'core', 'Change a member''s details'),
  ('members.suspend', 'core', 'Suspend and reactivate members'),
  ('members.remove', 'core', 'Remove members from the business'),
  ('members.roles.assign', 'core', 'Assign roles to members'),
  ('members.roles.manage', 'core', 'Create, edit and archive custom roles'),
  ('billing.view', 'core', 'See the plan, subscription and payments'),
  ('billing.manage', 'core', 'Manage billing details and payment methods'),
  ('billing.subscription.change', 'core', 'Buy, change or cancel the plan'),
  ('billing.payment.manage', 'core', 'Manage payments and invoices'),
  ('discovery.view', 'discovery', 'Use Customer Discovery'),
  ('discovery.export', 'discovery', 'Export Discovery data'),
  ('marketing.export', 'discovery', 'Export Marketing data'),
  ('funding.export', 'discovery', 'Export Funding data'),
  ('funding.data_room.manage', 'discovery', 'Upload, update and remove Data Room documents'),
  ('funding.data_room.share', 'discovery', 'Share Data Room documents with investors and revoke shares'),
  ('inventory.export', 'inventory', 'Export Inventory data'),
  ('service.view', 'fsm', 'Use Field Service'),
  ('service.export', 'fsm', 'Export Field Service data'),
  ('crm.export', 'crm', 'Export CRM data'),
  ('finance.view', 'gst', 'Use Finance'),
  ('finance.reports.export', 'gst', 'Export Finance reports and data')
on conflict (key) do nothing;

-- Existing role grants carried over exactly, plus the new keys per role.
insert into core.role_permission_grants (role_id, permission_key)
select r.id, rp.permission_key
from core.role_permissions rp
join core.roles r on r.business_id is null and r.key = rp.role
on conflict do nothing;

insert into core.role_permission_grants (role_id, permission_key)
select r.id, g.key
from (values
  -- Owner holds everything; admin everything but billing management and ownership (§11,
  -- §33: admins get only the billing permissions the business grants them).
  ('admin', 'business.view'), ('admin', 'business.edit'), ('admin', 'business.settings.manage'),
  ('admin', 'members.view'), ('admin', 'members.invite'), ('admin', 'members.edit'), ('admin', 'members.suspend'),
  ('admin', 'members.remove'), ('admin', 'members.roles.assign'), ('admin', 'members.roles.manage'),
  ('admin', 'billing.view'),
  ('admin', 'discovery.view'), ('admin', 'discovery.export'), ('admin', 'marketing.export'), ('admin', 'funding.export'),
  ('admin', 'funding.data_room.manage'), ('admin', 'funding.data_room.share'),
  ('accountant', 'funding.data_room.manage'),
  ('admin', 'inventory.export'), ('admin', 'service.view'), ('admin', 'service.export'), ('admin', 'crm.export'),
  ('admin', 'finance.view'), ('admin', 'finance.reports.export'),
  ('inventory_manager', 'business.view'), ('inventory_manager', 'inventory.export'),
  ('procurement_manager', 'business.view'),
  ('sales_manager', 'business.view'), ('sales_manager', 'discovery.view'), ('sales_manager', 'crm.export'),
  ('accountant', 'business.view'), ('accountant', 'finance.view'), ('accountant', 'finance.reports.export'),
  ('warehouse_operator', 'business.view'),
  ('viewer', 'business.view'), ('viewer', 'discovery.view'), ('viewer', 'funding.view'), ('viewer', 'service.view'),
  ('viewer', 'crm.view'), ('viewer', 'finance.view')
) as g (role_key, key)
join core.roles r on r.business_id is null and r.key = g.role_key
on conflict do nothing;

-- The owner role is granted the whole catalogue (and core.has_business_permission treats
-- it as all-permissions, so keys added later need no backfill).
insert into core.role_permission_grants (role_id, permission_key)
select r.id, p.key from core.roles r cross join core.permissions p
where r.business_id is null and r.key = 'owner'
on conflict do nothing;

-- Legacy mirror for existing readers of core.role_permissions (system roles only).
insert into core.role_permissions (role, permission_key)
select r.key, g.permission_key
from core.role_permission_grants g join core.roles r on r.id = g.role_id and r.business_id is null
on conflict do nothing;

-- ---------------------------------------------------------------------------------------
-- Membership (§6, §7, §45)
-- ---------------------------------------------------------------------------------------

alter table core.business_members
  add column role_id uuid references core.roles (id),
  add column status text not null default 'active' check (status in ('invited', 'active', 'suspended', 'removed')),
  add column invited_at timestamptz,
  add column invited_by uuid,
  add column joined_at timestamptz,
  add column suspended_at timestamptz,
  add column removed_at timestamptz,
  add column updated_at timestamptz not null default now();

alter table core.business_members drop constraint business_members_role_check;
alter table core.business_members add constraint business_members_role_check check (role in (
  'owner', 'admin', 'inventory_manager', 'procurement_manager', 'sales_manager', 'accountant',
  'warehouse_operator', 'viewer', 'custom'
));

update core.business_members m set role_id = r.id, joined_at = m.created_at
from core.roles r where r.business_id is null and r.key = m.role and m.role_id is null;

-- Every business keeps an owner membership: an account owner who never got one (a
-- business created outside the app) is added, so membership -- not account -- decides
-- roles from here on.
insert into core.business_members (business_id, user_id, role, role_id, status, joined_at)
select b.id, am.user_id, 'owner', r.id, 'active', now()
from core.businesses b
join core.account_members am on am.account_id = b.account_id and am.role = 'owner'
join core.roles r on r.business_id is null and r.key = 'owner'
where not exists (select 1 from core.business_members m where m.business_id = b.id and m.user_id = am.user_id);

alter table core.business_members alter column role_id set not null;
create index business_members_user_business_idx on core.business_members (user_id, business_id);
create index business_members_role_idx on core.business_members (role_id);

-- Keeps `role` (legacy text) and role_id (authoritative) in step, whichever a writer set:
-- the app's existing "creator becomes owner" insert sets only `role`.
create or replace function core.sync_business_member_role()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  v_role core.roles;
begin
  if new.role_id is null or (tg_op = 'UPDATE' and new.role is distinct from old.role and new.role_id = old.role_id) then
    select * into v_role from core.roles where business_id is null and key = new.role;
    if v_role.id is null then
      raise exception 'Unknown role %', new.role using errcode = '23514';
    end if;
    new.role_id := v_role.id;
  else
    select * into v_role from core.roles where id = new.role_id;
    if v_role.id is null or (v_role.business_id is not null and v_role.business_id <> new.business_id) then
      raise exception 'That role does not belong to this business.' using errcode = '23514';
    end if;
    new.role := case when v_role.business_id is null then v_role.key else 'custom' end;
  end if;
  if tg_op = 'INSERT' and new.status = 'active' and new.joined_at is null then
    new.joined_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger business_members_sync_role
  before insert or update on core.business_members
  for each row execute function core.sync_business_member_role();

-- §44 -- a business never loses its last active owner through member management. A whole
-- business being deleted (its members cascading away) is not member management.
create or replace function core.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active')
     and exists (select 1 from core.businesses where id = old.business_id)
     and not exists (
       select 1 from core.business_members
       where business_id = old.business_id and id <> old.id and role = 'owner' and status = 'active'
     ) then
    raise exception 'A business must keep at least one owner. Transfer ownership first.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger business_members_guard_last_owner
  before update or delete on core.business_members
  for each row execute function core.guard_last_owner();

-- ---------------------------------------------------------------------------------------
-- Effective permissions (§39, §40)
-- ---------------------------------------------------------------------------------------

-- Businesses the caller may enter at all: active memberships, plus every business of an
-- account the caller owns or administers (unchanged behaviour for account owners).
create or replace function core.user_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = core
as $$
  select m.business_id from core.business_members m
  where m.user_id = auth.uid() and m.status = 'active'
  union
  select b.id from core.businesses b
  where b.account_id in (
    select account_id from core.account_members where user_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

-- The caller's role in one business. An active membership decides it; without one, an
-- account owner acts as owner and an account admin as admin. Null = no access.
create or replace function core.current_role_id(p_business_id uuid)
returns uuid
language sql
stable
security definer
set search_path = core
as $$
  select coalesce(
    (select m.role_id from core.business_members m
      where m.business_id = p_business_id and m.user_id = auth.uid() and m.status = 'active'),
    (select r.id from core.businesses b
      join core.account_members am on am.account_id = b.account_id and am.user_id = auth.uid() and am.role in ('owner', 'admin')
      join core.roles r on r.business_id is null and r.key = am.role
      where b.id = p_business_id
      order by am.role = 'owner' desc
      limit 1)
  );
$$;

create or replace function core.user_role_for_business(p_business_id uuid)
returns table (role_id uuid, role_key text, role_name text, role_type text)
language sql
stable
security definer
set search_path = core
as $$
  select r.id, r.key, r.name, r.role_type from core.roles r where r.id = core.current_role_id(p_business_id);
$$;

create or replace function core.has_business_permission(p_business_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = core
as $$
  with role as (
    select r.id, r.key, r.business_id from core.roles r
    where r.id = core.current_role_id(p_business_id) and r.archived_at is null
  )
  select case
    when not exists (select 1 from role) then false
    when (select key from role) = 'owner' and (select business_id from role) is null
      then exists (select 1 from core.permissions where key = p_key)
    else exists (select 1 from core.role_permission_grants g where g.role_id = (select id from role) and g.permission_key = p_key)
  end;
$$;

-- Same signature every existing policy and requirePermission() already use.
create or replace function core.has_permission(p_business_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = core
as $$
  select core.has_business_permission(p_business_id, p_key);
$$;

create or replace function core.effective_permissions(p_business_id uuid)
returns setof text
language sql
stable
security definer
set search_path = core
as $$
  select p.key from core.permissions p where core.has_business_permission(p_business_id, p.key)
  order by p.key;
$$;

-- The shell's one round trip (RBAC-30/31): for every business the caller can enter, their
-- role's name and effective permissions -- for the business switcher's role label and for
-- building navigation from what the role may open.
create or replace function core.my_business_access()
returns table (business_id uuid, role_key text, role_name text, permissions text[])
language sql
stable
security definer
set search_path = core
as $$
  select b, r.key, r.name, array(select core.effective_permissions(b))
  from core.user_business_ids() b
  join core.roles r on r.id = core.current_role_id(b);
$$;

-- Module access (§30): the module's view permission. Module write: any permission in the
-- module beyond viewing -- so a viewer is read-only in the database too, not only the UI.
create or replace function core.module_view_permission(p_module text)
returns text
language sql
immutable
as $$
  select case p_module
    when 'discovery' then 'discovery.view'
    when 'inventory' then 'inventory.view'
    when 'fsm' then 'service.view'
    when 'crm' then 'crm.view'
    when 'gst' then 'finance.view'
  end;
$$;

create or replace function core.has_module_access(p_business_id uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path = core
as $$
  select core.has_business_permission(p_business_id, core.module_view_permission(p_module));
$$;

-- Whether the caller's role can change anything at all in this business -- i.e. holds a
-- permission beyond viewing/exporting in some module. A read-only role (viewer, or a
-- custom view-only role) has none.
create or replace function core.has_write_capability(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core
as $$
  with role as (select core.current_role_id(p_business_id) as id)
  select exists (
    select 1 from core.roles r where r.id = (select id from role) and r.business_id is null and r.key = 'owner'
  ) or exists (
    select 1 from core.role_permission_grants g
    join core.permissions p on p.key = g.permission_key
    join core.roles r on r.id = g.role_id and r.archived_at is null
    where g.role_id = (select id from role)
      and p.module <> 'core'
      and p.key not like '%.view' and p.key not like '%.view\_%' and p.key not like '%.export'
  );
$$;

-- Module RLS (§49). Reads: the module's view permission -- or, for a role that operates
-- the business (holds any write permission), the licence alone, because modules call each
-- other's contracts with the signed-in user's session (an invoice in Inventory records its
-- GST determination; CRM reads stock) and a sales manager creating an invoice must not
-- fail on Finance's tables. Writes: an active licence and a role that can write at all.
-- A read-only role is therefore confined to exactly the modules it may view, and can
-- change nothing, in the database itself; which *action* an operational role may take in
-- which module is enforced per action by requirePermission()/requireModulePermission()
-- and the has_permission() checks already in module policies (RBAC-18, RBAC-20).
create or replace function core.licensed_business_ids(p_key text)
returns setof uuid
language sql
stable
security definer
set search_path = core
as $$
  select l.business_id from core.licenses l
  where l.module_key = p_key
    and (l.status = 'active' or (l.status = 'grace' and (l.grace_ends_at is null or l.grace_ends_at > now())))
    and l.business_id in (select core.user_business_ids())
    and (core.has_module_access(l.business_id, p_key) or core.has_write_capability(l.business_id));
$$;

create or replace function core.write_licensed_business_ids(p_key text)
returns setof uuid
language sql
stable
security definer
set search_path = core
as $$
  select l.business_id from core.licenses l
  where l.module_key = p_key
    and l.status = 'active'
    and l.business_id in (select core.user_business_ids())
    and core.has_write_capability(l.business_id);
$$;

create or replace function core.user_admin_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = core
as $$
  select b from core.user_business_ids() b
  where (select r.key from core.roles r where r.id = core.current_role_id(b) and r.business_id is null) in ('owner', 'admin');
$$;

-- §12, §41 -- the privilege ceiling. The actor must be allowed to assign roles; owner is
-- assignable only by an owner; any other role only if every permission it carries is one
-- the actor holds.
create or replace function core.can_grant_permissions(p_business_id uuid, p_keys text[])
returns boolean
language sql
stable
security definer
set search_path = core
as $$
  select coalesce(bool_and(core.has_business_permission(p_business_id, k)), true) from unnest(p_keys) k;
$$;

create or replace function core.can_assign_role(p_business_id uuid, p_role_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = core
as $$
declare
  v_role core.roles;
  v_actor_key text;
begin
  if not core.has_business_permission(p_business_id, 'members.roles.assign') then
    return false;
  end if;
  select * into v_role from core.roles where id = p_role_id;
  if v_role.id is null or v_role.archived_at is not null
     or (v_role.business_id is not null and v_role.business_id <> p_business_id) then
    return false;
  end if;
  select key into v_actor_key from core.roles where id = core.current_role_id(p_business_id);
  if v_actor_key = 'owner' then
    return true;
  end if;
  if v_role.business_id is null and v_role.key = 'owner' then
    return false;
  end if;
  return core.can_grant_permissions(
    p_business_id,
    coalesce((select array_agg(permission_key) from core.role_permission_grants where role_id = p_role_id), '{}')
  );
end;
$$;

revoke execute on function core.current_role_id(uuid) from public, anon;
revoke execute on function core.user_role_for_business(uuid) from public, anon;
revoke execute on function core.has_business_permission(uuid, text) from public, anon;
revoke execute on function core.effective_permissions(uuid) from public, anon;
revoke execute on function core.my_business_access() from public, anon;
revoke execute on function core.has_module_access(uuid, text) from public, anon;
revoke execute on function core.has_write_capability(uuid) from public, anon;
revoke execute on function core.can_grant_permissions(uuid, text[]) from public, anon;
revoke execute on function core.can_assign_role(uuid, uuid) from public, anon;
grant execute on function core.current_role_id(uuid) to authenticated, service_role;
grant execute on function core.user_role_for_business(uuid) to authenticated, service_role;
grant execute on function core.has_business_permission(uuid, text) to authenticated, service_role;
grant execute on function core.effective_permissions(uuid) to authenticated, service_role;
grant execute on function core.my_business_access() to authenticated;
grant execute on function core.has_module_access(uuid, text) to authenticated, service_role;
grant execute on function core.has_write_capability(uuid) to authenticated, service_role;
grant execute on function core.can_grant_permissions(uuid, text[]) to authenticated, service_role;
grant execute on function core.can_assign_role(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------
-- RLS (§49)
-- ---------------------------------------------------------------------------------------

alter table core.roles enable row level security;
create policy "members can view their businesses' roles and the system roles" on core.roles
  for select to authenticated using (business_id is null or business_id in (select core.user_business_ids()));
grant select on core.roles to authenticated;
grant all on core.roles to service_role;

alter table core.role_permission_grants enable row level security;
create policy "members can view grants of roles they can see" on core.role_permission_grants
  for select to authenticated using (
    role_id in (select id from core.roles where business_id is null or business_id in (select core.user_business_ids()))
  );
grant select on core.role_permission_grants to authenticated;
grant all on core.role_permission_grants to service_role;

-- Businesses: visible through membership, editable with business.edit. Creating and
-- deleting a business stays with the owning account.
drop policy "members can view businesses in their account" on core.businesses;
-- The account clause is column-based on purpose: an INSERT ... RETURNING checks this
-- policy against the new row, which a lookup through user_business_ids() can't see yet.
create policy "members can view their businesses" on core.businesses
  for select to authenticated using (
    id in (select core.user_business_ids()) or account_id in (select core.user_admin_account_ids())
  );
drop policy "members can update businesses in their account" on core.businesses;
create policy "members with business.edit can update their business" on core.businesses
  for update to authenticated
  using (id in (select core.user_business_ids()) and core.has_business_permission(id, 'business.edit'))
  with check (id in (select core.user_business_ids()) and core.has_business_permission(id, 'business.edit'));

drop policy "members can update their business settings" on core.business_settings;
create policy "members with business.settings.manage can update business settings" on core.business_settings
  for update to authenticated
  using (business_id in (select core.user_business_ids()) and core.has_business_permission(business_id, 'business.settings.manage'))
  with check (business_id in (select core.user_business_ids()) and core.has_business_permission(business_id, 'business.settings.manage'));

-- Memberships: everyone sees their own; members.view sees the business's. The only direct
-- write left is the creator's own owner row on a brand-new business in their own account;
-- every other membership change goes through the RBAC functions (ceiling, last owner,
-- audit).
-- True only for a business in an account the caller owns or administers that has no
-- members yet -- the moment right after creating it. SECURITY DEFINER so the check can
-- look at every membership row without recursing through this table's own policies.
create or replace function core.is_unclaimed_account_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core
as $$
  select exists (
    select 1 from core.businesses b
    where b.id = p_business_id
      and b.account_id in (select account_id from core.account_members where user_id = auth.uid() and role in ('owner', 'admin'))
      and not exists (select 1 from core.business_members m where m.business_id = b.id)
  );
$$;
revoke execute on function core.is_unclaimed_account_business(uuid) from public, anon;
grant execute on function core.is_unclaimed_account_business(uuid) to authenticated;

drop policy "members can view membership of their businesses" on core.business_members;
create policy "members can view memberships they are allowed to see" on core.business_members
  for select to authenticated using (
    user_id = (select auth.uid())
    or (business_id in (select core.user_business_ids()) and core.has_business_permission(business_id, 'members.view'))
  );
drop policy "business owners and admins can add members" on core.business_members;
create policy "a business creator becomes its first owner" on core.business_members
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and role = 'owner'
    and core.is_unclaimed_account_business(business_id)
  );
drop policy "business owners and admins can remove members" on core.business_members;
revoke update, delete on core.business_members from authenticated;
