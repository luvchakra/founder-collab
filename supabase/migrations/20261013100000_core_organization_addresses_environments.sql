-- PLATFORM-P1-10.1 (Organization Address), PLATFORM-P1-10.4 (Environments),
-- PLATFORM-P1-10.6 (One Plan per Organization) and PLATFORM-P1-10.7 (Remove Environment),
-- docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §40; design and owner decisions in
-- docs/design/organization-addresses-environments.md (ported from WonderID 0095/0156-0165).
--
-- The organization is the business. Its slug becomes its address prefix
-- (<slug>.<BASE_APP_HOST>); each environment is a sibling business in the same account, with
-- its own data, members and licences, linked by platform.business_environments.
-- parent_business_id. Nothing is shared between environments except the plan.
--
-- Owner decision: suspension hides a business and refuses sign-in on its address; it is NOT
-- enforced in RLS (core.user_business_ids() is unchanged).

-- ---------------------------------------------------------------------------------------
-- Address prefix rules
-- ---------------------------------------------------------------------------------------

-- Mirrors packages/core/src/tenancy/host.ts slugProblem(); keep the reserved list in step.
create function core.business_slug_problem(p_slug text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_slug is null then 'An address is required.'
    when p_slug <> lower(p_slug) then 'Use lowercase letters.'
    when length(p_slug) < 3 or length(p_slug) > 32 then 'Use 3 to 32 characters.'
    when p_slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' then 'Use letters, digits and hyphens, starting and ending with a letter or digit.'
    when p_slug like '%--%' then 'No double hyphens.'
    when p_slug = any (array[
      'dashboard', 'platform', 'login', 'signup', 'forgot-password', 'reset-password', 'onboarding',
      'auth', 'api', 'p', 'help', 'terms', 'privacy', 'pricing', 'invite', 'legal',
      'www', 'app', 'admin', 'administrator', 'platform-admin', 'signin', 'sign-in', 'sign-up',
      'sso', 'oauth', 'mail', 'email', 'smtp', 'static', 'assets', 'cdn', 'media', 'files',
      'status', 'docs', 'support', 'billing', 'wonderark', 'wonderapps', 'root', 'system',
      'internal', 'test', 'demo', 'dev', 'staging', 'prod', 'production', 'localhost',
      'security', 'account', 'accounts', 'console', 'organizations', 'no-access', 'not-found',
      'service-unavailable', 'go', 'organization-not-found', 'organization-paused'
    ]) then 'That address is reserved.'
    else null
  end
$$;

-- Every live slug was checked against these rules before this migration (2026-10-13: 7 of 7).
alter table core.business_settings
  add constraint business_settings_slug_rules check (core.business_slug_problem(slug) is null);

create or replace function core.generate_business_slug(business_name text)
returns text
language plpgsql
security definer
set search_path = core
as $$
declare
  candidate text;
  final_slug text;
  suffix int;
begin
  candidate := trim(both '-' from regexp_replace(lower(regexp_replace(business_name, '[^a-zA-Z0-9]+', '-', 'g')), '-{2,}', '-', 'g'));
  candidate := trim(both '-' from left(candidate, 32));
  if candidate = '' or core.business_slug_problem(candidate) is not null then
    candidate := trim(both '-' from left(coalesce(nullif(candidate, ''), 'business'), 23)) || '-business';
  end if;

  final_slug := candidate;
  suffix := 1;
  while exists (select 1 from core.business_settings where slug = final_slug) loop
    suffix := suffix + 1;
    final_slug := trim(both '-' from left(candidate, 32 - length(suffix::text) - 1)) || '-' || suffix;
  end loop;

  return final_slug;
end;
$$;

revoke execute on function core.generate_business_slug(text) from public, anon, authenticated;

-- An address is the organization's identity on the web: members can't change it with a
-- plain UPDATE (business_settings' member update policy has no column limit). The vendor
-- console and the owner functions change it as SECURITY DEFINER, so current_user is their
-- owner, not the client role -- same pattern as core.guard_business_settings_plan().
create function core.guard_business_settings_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and new.slug is distinct from old.slug then
    raise exception 'An organization''s address can only be changed by the platform.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger business_settings_slug_guard
  before update on core.business_settings
  for each row execute function core.guard_business_settings_slug();

revoke execute on function core.guard_business_settings_slug() from public, anon, authenticated;

create function core.business_slug_available(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select core.business_slug_problem(p_slug) is null
     and not exists (select 1 from core.business_settings s where s.slug = p_slug)
$$;

revoke execute on function core.business_slug_available(text) from public, anon;
grant execute on function core.business_slug_available(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------
-- Business status: suspension and decommissioning
-- ---------------------------------------------------------------------------------------

alter table core.businesses
  add column status text not null default 'active' check (status in ('active', 'suspended', 'decommissioned')),
  add column suspended_at timestamptz,
  add column suspension_reason text check (suspension_reason is null or length(suspension_reason) <= 1000),
  add column disabled_by_owner boolean not null default false;

-- Members can't suspend, re-activate or decommission through the businesses update policy;
-- only the vendor console and the owner functions (definers) can. Keeps the timestamps
-- honest whoever changes it.
create function core.guard_business_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.status is distinct from old.status
       or new.suspended_at is distinct from old.suspended_at
       or new.suspension_reason is distinct from old.suspension_reason
       or new.disabled_by_owner is distinct from old.disabled_by_owner) then
    raise exception 'An organization''s status can only be changed by its owner or the platform.' using errcode = '42501';
  end if;
  if new.status = 'suspended' and old.status <> 'suspended' then
    new.suspended_at := now();
  elsif new.status <> 'suspended' then
    new.suspended_at := null;
    new.suspension_reason := null;
    new.disabled_by_owner := false;
  end if;
  return new;
end;
$$;

create trigger businesses_status_guard
  before update on core.businesses
  for each row execute function core.guard_business_status();

revoke execute on function core.guard_business_status() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Host resolution
-- ---------------------------------------------------------------------------------------

-- The public face of the business at an address: enough for the proxy to answer 404, and for
-- the sign-in page to name the organization and refuse a suspended one. It never authorizes
-- anything -- data access still needs an active membership (core.user_business_ids()).
-- Called server-side only, with the service role (the proxy and the auth actions); clients
-- have no access to the core schema before sign-in.
create function core.resolve_business_host(p_label text)
returns table (business_id uuid, name text, slug text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.name, s.slug, b.status
  from core.business_settings s
  join core.businesses b on b.id = s.business_id
  where s.slug = lower(p_label)
  limit 1
$$;

revoke execute on function core.resolve_business_host(text) from public, anon, authenticated;
grant execute on function core.resolve_business_host(text) to service_role;

-- ---------------------------------------------------------------------------------------
-- Environments
-- ---------------------------------------------------------------------------------------

-- Vendor-side: RLS on with no client policies. A business with no row is production.
-- parent_business_id deliberately has NO foreign key: a second FK to core.businesses makes
-- PostgREST embeds ambiguous (WonderID's console returned 500 in production for exactly
-- this). The functions below check the parent exists, and businesses are decommissioned,
-- never deleted.
create table platform.business_environments (
  business_id uuid primary key references core.businesses (id) on delete cascade,
  environment text not null check (environment in ('production', 'development', 'test', 'staging', 'sandbox')),
  parent_business_id uuid,
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_environments_parent_not_self check (parent_business_id is null or parent_business_id <> business_id)
);

create unique index business_environments_one_per_kind
  on platform.business_environments (parent_business_id, environment)
  where parent_business_id is not null;

alter table platform.business_environments enable row level security;
revoke all on platform.business_environments from anon, authenticated;
grant all on platform.business_environments to service_role;

-- The caller's own businesses with their environment and organization link, for the
-- switcher. Only businesses the caller is a member of (core.user_business_ids()).
create function core.my_business_environments()
returns table (business_id uuid, environment text, parent_business_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, coalesce(e.environment, 'production'), e.parent_business_id
  from core.businesses b
  left join platform.business_environments e on e.business_id = b.id
  where b.id in (select core.user_business_ids())
$$;

revoke execute on function core.my_business_environments() from public, anon;
grant execute on function core.my_business_environments() to authenticated;

create function core.organization_of(p_business uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select e.parent_business_id from platform.business_environments e where e.business_id = p_business), p_business)
$$;

revoke execute on function core.organization_of(uuid) from public, anon, authenticated;
grant execute on function core.organization_of(uuid) to service_role;

create function platform.environment_label(p_environment text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_environment
    when 'production' then 'Production'
    when 'development' then 'Dev'
    when 'test' then 'Test'
    when 'staging' then 'Staging'
    else 'Sandbox'
  end
$$;

-- ---------------------------------------------------------------------------------------
-- Vendor functions: service_role only. The console checks requireSuperadmin() first and
-- passes the acting superadmin as p_actor; each change is audited here, in the same
-- transaction, at high severity.
-- ---------------------------------------------------------------------------------------

create function platform.create_business_environment(p_actor uuid, p_parent uuid, p_environment text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent core.businesses;
  v_parent_env text;
  v_root_slug text;
  v_plan text;
  v_slug text;
  v_problem text;
  v_id uuid;
begin
  if p_environment is null or p_environment not in ('production', 'development', 'test', 'staging') then
    raise exception 'Unknown environment: %', p_environment using errcode = '22023';
  end if;
  select * into v_parent from core.businesses where id = p_parent for update;
  if not found then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  if v_parent.status <> 'active' then
    raise exception 'Enable the organization first.' using errcode = '22023';
  end if;
  if exists (select 1 from platform.business_environments e where e.business_id = p_parent and e.parent_business_id is not null) then
    raise exception 'Environments are added to the organization, not to another environment.' using errcode = '22023';
  end if;
  v_parent_env := coalesce((select e.environment from platform.business_environments e where e.business_id = p_parent), 'production');
  if v_parent_env = p_environment then
    raise exception 'The organization is already its % environment.', platform.environment_label(p_environment) using errcode = '23505';
  end if;
  if exists (select 1 from platform.business_environments e where e.parent_business_id = p_parent and e.environment = p_environment) then
    raise exception 'This organization already has a % environment.', platform.environment_label(p_environment) using errcode = '23505';
  end if;

  select s.slug, s.plan into v_root_slug, v_plan from core.business_settings s where s.business_id = p_parent;
  -- Never stack suffixes (acme-dev-staging); production sits at the bare prefix.
  v_slug := regexp_replace(v_root_slug, '-(dev|test|staging)$', '')
    || case p_environment when 'production' then '' when 'development' then '-dev' when 'test' then '-test' else '-staging' end;
  v_problem := core.business_slug_problem(v_slug);
  if v_problem is not null then
    raise exception 'The address % can''t be used: %', v_slug, v_problem using errcode = '22023';
  end if;
  if exists (select 1 from core.business_settings s where s.slug = v_slug) then
    raise exception 'The address % is already taken.', v_slug using errcode = '23505';
  end if;

  insert into core.businesses (account_id, name, description, website, industry)
  values (v_parent.account_id, left(v_parent.name, 180) || ' (' || platform.environment_label(p_environment) || ')',
          v_parent.description, v_parent.website, v_parent.industry)
  returning id into v_id;

  -- The settings row came from core.handle_new_business(); give it the environment's address
  -- and the organization's plan (PLATFORM-P1-10.6).
  update core.business_settings set slug = v_slug, plan = v_plan where business_id = v_id;

  insert into platform.business_environments (business_id, environment, parent_business_id)
  values (v_id, p_environment, p_parent);

  -- The organization's active owners own the environment too; nothing else is copied.
  insert into core.business_members (business_id, user_id, role, role_id, status, joined_at)
  select v_id, m.user_id, m.role, m.role_id, 'active', now()
  from core.business_members m
  where m.business_id = p_parent and m.status = 'active' and m.role = 'owner'
  on conflict do nothing;

  perform platform.write_platform_audit_log(p_actor, 'created', 'business_environment', v_id::text, 'high', null, null,
    jsonb_build_object('organization_id', p_parent, 'environment', p_environment, 'slug', v_slug));
  return v_id;
end;
$$;

-- Decommission one business: data kept, address freed, nobody signs in.
create function platform.decommission_business(p_business uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
  v_new text;
begin
  select slug into v_old from core.business_settings where business_id = p_business;
  v_new := regexp_replace(trim(both '-' from left(v_old, 15)) || '-removed-' || substr(md5(gen_random_uuid()::text), 1, 6), '-{2,}', '-', 'g');
  update core.business_settings set slug = v_new where business_id = p_business;
  update core.businesses set status = 'decommissioned' where id = p_business;
  update platform.business_environments
     set notes = left(concat_ws(E'\n', notes, 'Decommissioned ' || now()::date || '; was ' || v_old
                   || coalesce(' in organization ' || parent_business_id::text, '')), 2000),
         parent_business_id = null,
         updated_at = now()
   where business_id = p_business;
  return v_old;
end;
$$;

revoke execute on function platform.decommission_business(uuid) from public, anon, authenticated;

create function platform.remove_business_environment(p_actor uuid, p_business uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent uuid;
  v_old text;
begin
  select parent_business_id into v_parent from platform.business_environments where business_id = p_business;
  if v_parent is null then
    raise exception 'Only an organization''s added environment can be removed this way. Remove the organization instead.' using errcode = '22023';
  end if;
  v_old := platform.decommission_business(p_business);
  perform platform.write_platform_audit_log(p_actor, 'deleted', 'business_environment', p_business::text, 'high', null,
    jsonb_build_object('organization_id', v_parent, 'slug', v_old), jsonb_build_object('status', 'decommissioned'));
  return v_old;
end;
$$;

-- Removing the organization removes its environments first, then itself.
create function platform.remove_organization(p_actor uuid, p_business uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_child uuid;
  v_count integer := 0;
  v_old text;
begin
  if exists (select 1 from platform.business_environments e where e.business_id = p_business and e.parent_business_id is not null) then
    raise exception 'That is an environment; remove it from its organization.' using errcode = '22023';
  end if;
  if not exists (select 1 from core.businesses where id = p_business and status <> 'decommissioned') then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  for v_child in select e.business_id from platform.business_environments e where e.parent_business_id = p_business loop
    perform platform.decommission_business(v_child);
    v_count := v_count + 1;
  end loop;
  v_old := platform.decommission_business(p_business);
  perform platform.write_platform_audit_log(p_actor, 'deleted', 'organization', p_business::text, 'high', null,
    jsonb_build_object('slug', v_old, 'environments_removed', v_count), jsonb_build_object('status', 'decommissioned'));
  return v_count + 1;
end;
$$;

-- A vendor address change frees the old address at once.
create function platform.rename_business_slug(p_actor uuid, p_business uuid, p_slug text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
  v_problem text := core.business_slug_problem(p_slug);
begin
  if v_problem is not null then
    raise exception '%', v_problem using errcode = '22023';
  end if;
  select slug into v_old from core.business_settings where business_id = p_business for update;
  if not found then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  if v_old = p_slug then
    return v_old;
  end if;
  if exists (select 1 from core.business_settings where slug = p_slug) then
    raise exception 'The address % is already taken.', p_slug using errcode = '23505';
  end if;
  update core.business_settings set slug = p_slug where business_id = p_business;
  perform platform.write_platform_audit_log(p_actor, 'updated', 'business_address', p_business::text, 'high', null,
    jsonb_build_object('slug', v_old), jsonb_build_object('slug', p_slug));
  return v_old;
end;
$$;

create function platform.set_business_environment(p_actor uuid, p_business uuid, p_environment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if p_environment is null or p_environment not in ('production', 'development', 'test', 'staging', 'sandbox') then
    raise exception 'Unknown environment: %', p_environment using errcode = '22023';
  end if;
  if not exists (select 1 from core.businesses where id = p_business) then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  v_old := coalesce((select environment from platform.business_environments where business_id = p_business), 'production');
  insert into platform.business_environments (business_id, environment)
  values (p_business, p_environment)
  on conflict (business_id) do update set environment = excluded.environment, updated_at = now();
  perform platform.write_platform_audit_log(p_actor, 'updated', 'business_environment', p_business::text, 'high', null,
    jsonb_build_object('environment', v_old), jsonb_build_object('environment', p_environment));
end;
$$;

-- Renaming the organization renames its environments: "Acme (Test)".
create function platform.rename_organization(p_actor uuid, p_business uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
  v_name text := btrim(p_name);
begin
  if exists (select 1 from platform.business_environments e where e.business_id = p_business and e.parent_business_id is not null) then
    raise exception 'Rename the organization, not one of its environments.' using errcode = '22023';
  end if;
  if v_name is null or length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Use 2 to 80 characters.' using errcode = '22023';
  end if;
  select name into v_old from core.businesses where id = p_business for update;
  if not found then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  update core.businesses set name = v_name where id = p_business;
  update core.businesses b set name = v_name || ' (' || platform.environment_label(e.environment) || ')'
    from platform.business_environments e
   where e.parent_business_id = p_business and e.business_id = b.id and b.status <> 'decommissioned';
  perform platform.write_platform_audit_log(p_actor, 'updated', 'organization', p_business::text, 'high', null,
    jsonb_build_object('name', v_old), jsonb_build_object('name', v_name));
  return v_old;
end;
$$;

-- Vendor suspension and re-activation. A vendor action clears disabled_by_owner (the guard
-- trigger does that when leaving suspension; here it's set false on suspend too), so an
-- owner can never lift a vendor suspension.
create function platform.set_business_status(p_actor uuid, p_business uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if p_status is null or p_status not in ('active', 'suspended') then
    raise exception 'Unknown status: %', p_status using errcode = '22023';
  end if;
  select status into v_old from core.businesses where id = p_business for update;
  if not found or v_old = 'decommissioned' then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  update core.businesses
     set status = p_status,
         suspension_reason = case when p_status = 'suspended' then nullif(btrim(p_reason), '') end,
         disabled_by_owner = false
   where id = p_business;
  perform platform.write_platform_audit_log(p_actor, 'updated', 'business_status', p_business::text, 'high',
    nullif(btrim(p_reason), ''), jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));
end;
$$;

revoke execute on function platform.create_business_environment(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function platform.remove_business_environment(uuid, uuid) from public, anon, authenticated;
revoke execute on function platform.remove_organization(uuid, uuid) from public, anon, authenticated;
revoke execute on function platform.rename_business_slug(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function platform.set_business_environment(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function platform.rename_organization(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function platform.set_business_status(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function platform.create_business_environment(uuid, uuid, text) to service_role;
grant execute on function platform.remove_business_environment(uuid, uuid) to service_role;
grant execute on function platform.remove_organization(uuid, uuid) to service_role;
grant execute on function platform.rename_business_slug(uuid, uuid, text) to service_role;
grant execute on function platform.set_business_environment(uuid, uuid, text) to service_role;
grant execute on function platform.rename_organization(uuid, uuid, text) to service_role;
grant execute on function platform.set_business_status(uuid, uuid, text, text) to service_role;
