-- PLATFORM-P1-10.8 (Manage Organizations), PLATFORM-P1-10.9 (Paid Environments) and
-- PLATFORM-P1-10.14 (Organization Onboarding), docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
-- §40, on top of 20261013100000/110000. Ported from WonderID 0157 and 0161.
--
-- Every ownership check runs here, as the caller (auth.uid()), never in the app alone. An
-- owner is an active member holding the owner role in the organization (the root business);
-- owning the organization means owning its environments. Owner actions are written to
-- core.audit_log on the business they change.

-- ---------------------------------------------------------------------------------------
-- Ownership
-- ---------------------------------------------------------------------------------------

-- Reads membership directly, not through core.user_business_ids(), so an owner still counts
-- as owner of an organization they disabled (WonderID pitfall: a disabled organization hidden
-- from its own owner can never be re-enabled).
create function core.is_organization_owner(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from core.business_members m
    where m.business_id = core.organization_of(p_business)
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = 'owner'
  )
$$;

revoke execute on function core.is_organization_owner(uuid) from public, anon;
grant execute on function core.is_organization_owner(uuid) to authenticated, service_role;

-- The organizations (and their environments) the caller owns, disabled ones included,
-- decommissioned ones not.
create function core.my_managed_organizations()
returns table (business_id uuid, name text, slug text, status text, disabled_by_owner boolean, environment text, parent_business_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.name, s.slug, b.status, b.disabled_by_owner, coalesce(e.environment, 'production'), e.parent_business_id
  from core.businesses b
  join core.business_settings s on s.business_id = b.id
  left join platform.business_environments e on e.business_id = b.id
  where b.status <> 'decommissioned'
    and core.is_organization_owner(b.id)
$$;

revoke execute on function core.my_managed_organizations() from public, anon;
grant execute on function core.my_managed_organizations() to authenticated;

-- ---------------------------------------------------------------------------------------
-- Owner actions
-- ---------------------------------------------------------------------------------------

create function core.owner_rename_organization(p_business uuid, p_name text)
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
  if not core.is_organization_owner(p_business) then
    raise exception 'Only the organization''s owner can rename it.' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Use 2 to 80 characters.' using errcode = '22023';
  end if;
  select name into v_old from core.businesses where id = p_business for update;
  update core.businesses set name = v_name where id = p_business;
  update core.businesses b set name = v_name || ' (' || platform.environment_label(e.environment) || ')'
    from platform.business_environments e
   where e.parent_business_id = p_business and e.business_id = b.id and b.status <> 'decommissioned';
  perform core.append_audit_log(p_business, auth.uid(), 'organization.renamed', 'business', p_business,
    jsonb_build_object('name', v_old), jsonb_build_object('name', v_name));
  return v_old;
end;
$$;

-- Disable cascades from the organization to its environments; one environment can also be
-- disabled alone. Re-enabling lifts only the owner's own disable, never a vendor suspension,
-- and an environment can't be re-enabled while its organization is off. Returns the ids changed.
create function core.owner_set_organization_disabled(p_business uuid, p_disabled boolean)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_root uuid := core.organization_of(p_business);
  v_is_root boolean := core.organization_of(p_business) = p_business;
  v_target core.businesses;
  v_id uuid;
begin
  if not core.is_organization_owner(p_business) then
    raise exception 'Only the organization''s owner can do that.' using errcode = '42501';
  end if;
  select * into v_target from core.businesses where id = p_business for update;
  if not found or v_target.status = 'decommissioned' then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;

  if p_disabled then
    for v_id in
      select b.id from core.businesses b
      where b.status = 'active'
        and (b.id = p_business or (v_is_root and b.id in (select e.business_id from platform.business_environments e where e.parent_business_id = p_business)))
    loop
      update core.businesses
         set status = 'suspended', disabled_by_owner = true, suspension_reason = 'Disabled by the organization''s owner'
       where id = v_id;
      perform core.append_audit_log(v_id, auth.uid(), 'organization.disabled', 'business', v_id, null, null);
      return next v_id;
    end loop;
    return;
  end if;

  if v_target.status = 'suspended' and not v_target.disabled_by_owner then
    raise exception 'The platform suspended this organization; contact support to lift it.' using errcode = '42501';
  end if;
  if not v_is_root and exists (select 1 from core.businesses r where r.id = v_root and r.status <> 'active') then
    raise exception 'Enable the organization first.' using errcode = '22023';
  end if;
  for v_id in
    select b.id from core.businesses b
    where b.status = 'suspended' and b.disabled_by_owner
      and (b.id = p_business or (v_is_root and b.id in (select e.business_id from platform.business_environments e where e.parent_business_id = p_business)))
  loop
    update core.businesses set status = 'active' where id = v_id;
    perform core.append_audit_log(v_id, auth.uid(), 'organization.enabled', 'business', v_id, null, null);
    return next v_id;
  end loop;
end;
$$;

revoke execute on function core.owner_rename_organization(uuid, text) from public, anon;
grant execute on function core.owner_rename_organization(uuid, text) to authenticated;
revoke execute on function core.owner_set_organization_disabled(uuid, boolean) from public, anon;
grant execute on function core.owner_set_organization_disabled(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Onboarding: a new organization with the address prefix and environment its creator chose
-- ---------------------------------------------------------------------------------------

-- The caller must own or administer the account (the same rule as creating a business today).
-- The creator becomes the owner. Modules are switched on by the app afterwards
-- (seedDefaultLicenses), same as createBusiness().
create function core.create_business_with_address(p_account uuid, p_name text, p_slug text, p_environment text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_slug text := lower(btrim(p_slug));
  v_problem text;
  v_id uuid;
begin
  if auth.uid() is null or p_account not in (select core.user_admin_account_ids()) then
    raise exception 'You can''t create an organization in that account.' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Use 2 to 80 characters for the name.' using errcode = '22023';
  end if;
  if p_environment is null or p_environment not in ('production', 'development', 'test', 'staging') then
    raise exception 'Choose production, development, test or staging.' using errcode = '22023';
  end if;
  v_problem := core.business_slug_problem(v_slug);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = '22023';
  end if;
  if exists (select 1 from core.business_settings s where s.slug = v_slug) then
    raise exception 'That address is taken. Try another.' using errcode = '23505';
  end if;

  insert into core.businesses (account_id, name) values (p_account, v_name) returning id into v_id;
  update core.business_settings set slug = v_slug where business_id = v_id;
  if p_environment <> 'production' then
    insert into platform.business_environments (business_id, environment) values (v_id, p_environment);
  end if;
  insert into core.business_members (business_id, user_id, role, role_id, status, joined_at)
  values (v_id, auth.uid(), 'owner', (select r.id from core.roles r where r.business_id is null and r.key = 'owner'), 'active', now())
  on conflict (business_id, user_id) do nothing;
  perform core.append_audit_log(v_id, auth.uid(), 'organization.created', 'business', v_id, null,
    jsonb_build_object('name', v_name, 'slug', v_slug, 'environment', p_environment));
  return v_id;
end;
$$;

revoke execute on function core.create_business_with_address(uuid, text, text, text) from public, anon;
grant execute on function core.create_business_with_address(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Paid environments (PLATFORM-P1-10.9)
-- ---------------------------------------------------------------------------------------

-- The order is written first; the environment is set up after. One open order per
-- organization and environment (a double click gets "already being set up"). Owner decision
-- 2026-10-13: test payments (payment_mode 'test', no money moves) until a payment provider is
-- set up; the label stays on the order for good.
create table platform.environment_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.businesses (id) on delete cascade,
  environment text not null check (environment in ('production', 'development', 'test', 'staging')),
  payment_mode text not null check (payment_mode in ('test', 'razorpay', 'stripe')),
  status text not null default 'paid' check (status in ('paid', 'fulfilled', 'failed')),
  environment_business_id uuid,
  failure text check (failure is null or length(failure) <= 1000),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  constraint environment_orders_fulfilled check ((status = 'fulfilled') = (environment_business_id is not null and fulfilled_at is not null))
);

create unique index environment_orders_one_open on platform.environment_orders (organization_id, environment) where status = 'paid';
create index environment_orders_organization_idx on platform.environment_orders (organization_id, created_at desc);

alter table platform.environment_orders enable row level security;

create policy "owners can view their organization's environment orders" on platform.environment_orders
  for select to authenticated
  using (core.is_organization_owner(organization_id) or platform.is_superadmin());

revoke all on platform.environment_orders from anon, authenticated;
grant select on platform.environment_orders to authenticated;
grant all on platform.environment_orders to service_role;
