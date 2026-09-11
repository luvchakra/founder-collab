-- PLATFORM-P0-01: "Create SUPERADMIN Role" -- the platform-level control-plane role,
-- distinct from any core.business_members/core.employees role
-- (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §5). Lives in its own `platform`
-- schema (that doc's own §3 recommendation) rather than core.business or any module
-- schema -- platform configuration is not tenant data, never gated by core.licenses.
--
-- `role` is a text column with a check constraint (not a hard Postgres enum type)
-- specifically so future roles (PLATFORM_ADMIN, BILLING_ADMIN, SUPPORT_ADMIN,
-- OPERATIONS_ADMIN, SECURITY_ADMIN -- doc §32/18.3) can be added later by widening the
-- constraint, never by restructuring this table: "the architecture must not hard-code a
-- single future role."
--
-- Soft-revoke (revoked_at/revoked_by/revoke_reason), rows never deleted -- this table's
-- own history is exactly the kind of high-risk record a future platform audit trail
-- (doc §20) needs to be able to reconstruct.
--
-- user_id references auth.users directly, the same identity anchor
-- core.account_members/core.business_members/core.employees already use via their own
-- user_id columns -- a SUPERADMIN is a raw auth user, no account/business/employee row
-- required (doc §5, PLATFORM-P0-01.4: "No Tenant Context Required").
create schema if not exists platform;

create table platform.admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'superadmin' check (role in ('superadmin')),
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  revoke_reason text
);

create index admins_user_id_idx on platform.admins (user_id);
create index admins_granted_by_idx on platform.admins (granted_by);
create index admins_revoked_by_idx on platform.admins (revoked_by);

-- Mirrors core.has_permission()'s exact shape -- the actual authorization boundary
-- (RLS-backed, not just an application-code check), not an arbitrary-user-id lookup:
-- defaults to the calling session's own auth.uid(), all any caller needs is "am I a
-- superadmin".
create function platform.is_superadmin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = platform
as $$
  select exists (
    select 1 from platform.admins
    where user_id = p_user_id and role = 'superadmin' and revoked_at is null
  );
$$;

revoke execute on function platform.is_superadmin(uuid) from public, anon;
grant execute on function platform.is_superadmin(uuid) to authenticated;

alter table platform.admins enable row level security;

-- A superadmin can see the roster (a future "manage superadmins" screen needs this);
-- nobody else can, and nobody -- not even a superadmin -- can write through this policy
-- set yet. Granting/revoking is its own, separately-audited future capability (doc
-- §20/§32); until it exists, rows are migration/service-role-seeded only, matching
-- core.permissions/core.role_permissions' own "no builder yet" scope. Same safe
-- self-referencing-via-security-definer-function pattern core.api_keys' own policies
-- already use, not RLS recursion.
create policy "superadmins can view the roster" on platform.admins for select to authenticated
  using (platform.is_superadmin());

grant select on platform.admins to authenticated;
grant all on platform.admins to service_role;

-- PostgREST only routes requests to schemas listed in the `authenticator` role's
-- pgrst.db_schemas setting (the same infra gap docs/PORT-PROVENANCE.md's own "Infra gap
-- found and fixed" note documents for `gst`/`fsm`) -- guarded by a role-existence check
-- so this no-ops on the local/CI test harness, which has no `authenticator` role.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_schemas = ''public, graphql_public, core, discovery, inventory, gst, fsm, crm, platform''';
  end if;
end $$;
