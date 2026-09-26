-- RBAC-39 (docs/design/rbac.md "Module RLS: per-module, with declared hand-offs") --
-- module data is now scoped to the module's own permissions for EVERY role, in the
-- database, instead of "any write permission anywhere opens every licensed module".
--
-- Why: the Supabase API is public, so the app's per-action checks are not a boundary on
-- their own -- a CRM-only role could read or change Inventory rows directly with its own
-- session. After this migration:
--
--   read  module M  = licence (active or grace) AND the M view permission, or any
--                     permission in M (a role that can change M can see what it changes)
--   write module M  = active licence AND a permission in M beyond view/export (owner
--                     always)
--
-- Cross-module hand-offs (CRM creating an FSM quote, FSM reserving stock, Discovery
-- promoting a prospect to a CRM lead, ...) are opened table by table in the module
-- migrations that follow, each keyed to the permission that initiates the hand-off --
-- see core.handoff_business_ids() below. Nothing else crosses a module boundary.
--
-- Also here: `discovery.manage` (Discovery had no write permission at all, so its core
-- tables were writable by any member, viewers included), and the Accountant role gains
-- the Finance permissions its name promises (it could view Finance but post nothing).

-- ---------------------------------------------------------------------------------------
-- Permissions and grants
-- ---------------------------------------------------------------------------------------

insert into core.permissions (key, module, description) values
  ('discovery.manage', 'discovery', 'Create and edit offerings, prospects, research and outreach in Discovery')
on conflict (key) do nothing;

insert into core.role_permission_grants (role_id, permission_key)
select r.id, g.key
from (values
  ('owner', 'discovery.manage'),
  ('admin', 'discovery.manage'),
  ('sales_manager', 'discovery.manage'),
  -- Accountant: every Finance operation except activating the module itself.
  ('accountant', 'gst.accounts.write'),
  ('accountant', 'gst.banking.manage'),
  ('accountant', 'gst.exceptions.manage'),
  ('accountant', 'gst.file_returns'),
  ('accountant', 'gst.generate'),
  ('accountant', 'gst.journal.create'),
  ('accountant', 'gst.manage_evidence'),
  ('accountant', 'gst.manage_exemption_certificates'),
  ('accountant', 'gst.manage_reconciliation'),
  ('accountant', 'gst.periods.manage')
) as g(role, key)
join core.roles r on r.business_id is null and r.key = g.role
join core.permissions p on p.key = g.key
on conflict do nothing;

-- Legacy mirror for existing readers of core.role_permissions (system roles only).
insert into core.role_permissions (role, permission_key)
select r.key, g.permission_key
from core.role_permission_grants g join core.roles r on r.id = g.role_id and r.business_id is null
on conflict do nothing;

-- Templates offered when a business creates a custom role.
update core.role_templates set permission_keys = array_append(permission_keys, 'discovery.manage')
where key in ('business_admin', 'sales_manager') and not ('discovery.manage' = any (permission_keys));
update core.role_templates
set permission_keys = array(select distinct k from unnest(permission_keys || array[
  'gst.accounts.write','gst.banking.manage','gst.exceptions.manage','gst.file_returns','gst.generate',
  'gst.manage_evidence','gst.manage_exemption_certificates','gst.manage_reconciliation','gst.periods.manage']) k order by k)
where key = 'accountant';

-- ---------------------------------------------------------------------------------------
-- Module access helpers
-- ---------------------------------------------------------------------------------------

-- A permission that only looks (view / view_* / export) versus one that acts.
create or replace function core.is_read_only_permission(p_key text)
returns boolean
language sql
immutable
as $$
  select p_key like '%.view' or p_key like '%.view\_%' or p_key like '%.export';
$$;

-- Whether the caller's role in this business may change data in module p_module: owner
-- always; otherwise a non-read-only permission catalogued under that module.
create or replace function core.has_module_write_permission(p_business_id uuid, p_module text)
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
      and p.module = p_module
      and not core.is_read_only_permission(p.key)
  );
$$;

-- Read: licence (active, or grace until it ends -- ADR-9) AND (the module's view
-- permission OR a write permission in it).
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
    and (core.has_module_access(l.business_id, p_key) or core.has_module_write_permission(l.business_id, p_key));
$$;

-- Write: active licence (grace is read-only, ADR-9) AND a write permission in the module.
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
    and core.has_module_write_permission(l.business_id, p_key);
$$;

-- A declared cross-module hand-off: businesses where module p_module is licensed (active
-- for writes, active or in grace for reads) and the caller holds p_permission -- the
-- permission of the module that INITIATES the hand-off. Used only by the explicit
-- hand-off policies in the module migrations that follow this one.
create or replace function core.handoff_business_ids(p_module text, p_permission text, p_write boolean)
returns setof uuid
language sql
stable
security definer
set search_path = core
as $$
  select l.business_id from core.licenses l
  where l.module_key = p_module
    and (l.status = 'active'
      or (not p_write and l.status = 'grace' and (l.grace_ends_at is null or l.grace_ends_at > now())))
    and l.business_id in (select core.user_business_ids())
    and core.has_business_permission(l.business_id, p_permission);
$$;

revoke execute on function core.has_module_write_permission(uuid, text) from public, anon;
revoke execute on function core.handoff_business_ids(text, text, boolean) from public, anon;
grant execute on function core.has_module_write_permission(uuid, text) to authenticated, service_role;
grant execute on function core.handoff_business_ids(text, text, boolean) to authenticated, service_role;
grant execute on function core.is_read_only_permission(text) to authenticated, service_role;
