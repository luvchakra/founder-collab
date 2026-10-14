-- PLATFORM-P1-10.6 (One Plan per Organization), PLATFORM-P1-10.11 (Environment Console),
-- PLATFORM-P1-10.12 (Organization Details) and PLATFORM-P1-10.13 (Organization
-- Announcements), docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §40. The vendor console's
-- data, on top of 20261013100000 (addresses and environments). Ported from WonderID
-- 0162/0163 and its announcements' "one organization" audience and End now.

-- ---------------------------------------------------------------------------------------
-- Organization details (vendor-only: RLS on, no client policies, service role only)
-- ---------------------------------------------------------------------------------------

-- One row per organization (its root business), never per environment. The same rules as
-- packages/core/src/admin/platform-organization-profile-rules.ts, which validates first and
-- gives the message; these checks are the backstop.
create table platform.organization_profiles (
  business_id uuid primary key references core.businesses (id) on delete cascade,
  description text check (description is null or length(description) <= 1000),
  contact_name text check (contact_name is null or length(contact_name) <= 120),
  contact_email text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9 ()\-]{6,24}$'),
  company_name text check (company_name is null or length(company_name) <= 160),
  company_email text check (company_email is null or company_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  company_phone text check (company_phone is null or company_phone ~ '^\+?[0-9 ()\-]{6,24}$'),
  industry text check (industry is null or length(industry) <= 80),
  user_base_size text check (user_base_size is null or user_base_size in ('1-50', '51-200', '201-1000', '1001-5000', '5001-20000', '20000+')),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  website text check (website is null or website ~* '^https?://\S+$'),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table platform.organization_profiles enable row level security;
revoke all on platform.organization_profiles from anon, authenticated;
grant all on platform.organization_profiles to service_role;

create function platform.save_organization_profile(p_actor uuid, p_business uuid, p_profile jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if exists (select 1 from platform.business_environments e where e.business_id = p_business and e.parent_business_id is not null) then
    raise exception 'Details belong to the organization, not to one of its environments.' using errcode = '22023';
  end if;
  if not exists (select 1 from core.businesses where id = p_business) then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  select to_jsonb(p) - 'business_id' - 'updated_by' - 'updated_at' into v_old from platform.organization_profiles p where p.business_id = p_business;
  insert into platform.organization_profiles as p (
    business_id, description, contact_name, contact_email, contact_phone, company_name, company_email,
    company_phone, industry, user_base_size, country, website, updated_by, updated_at)
  values (
    p_business, p_profile->>'description', p_profile->>'contact_name', p_profile->>'contact_email',
    p_profile->>'contact_phone', p_profile->>'company_name', p_profile->>'company_email',
    p_profile->>'company_phone', p_profile->>'industry', p_profile->>'user_base_size',
    p_profile->>'country', p_profile->>'website', p_actor, now())
  on conflict (business_id) do update set
    description = excluded.description, contact_name = excluded.contact_name,
    contact_email = excluded.contact_email, contact_phone = excluded.contact_phone,
    company_name = excluded.company_name, company_email = excluded.company_email,
    company_phone = excluded.company_phone, industry = excluded.industry,
    user_base_size = excluded.user_base_size, country = excluded.country, website = excluded.website,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  select to_jsonb(p) - 'business_id' - 'updated_by' - 'updated_at' into v_new from platform.organization_profiles p where p.business_id = p_business;
  perform platform.write_platform_audit_log(p_actor, 'updated', 'organization_profile', p_business::text, 'normal', null, v_old, v_new);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- One plan per organization (PLATFORM-P1-10.6)
-- ---------------------------------------------------------------------------------------

-- Sets the plan on the organization and every live environment. A business whose plan is
-- billed by a payment provider (a live Razorpay/Stripe subscription) is never overwritten:
-- it is reported back unchanged, so the console can say "change it in Billing".
create function platform.set_organization_plan(p_actor uuid, p_business uuid, p_plan text)
returns table (business_id uuid, changed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if exists (select 1 from platform.business_environments e where e.business_id = p_business and e.parent_business_id is not null) then
    raise exception 'The plan belongs to the organization; change it there.' using errcode = '22023';
  end if;
  if not exists (select 1 from platform.plans where key = p_plan) then
    raise exception 'Unknown plan: %', p_plan using errcode = '22023';
  end if;
  select s.plan into v_old from core.business_settings s where s.business_id = p_business;
  if v_old is null then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;

  return query
  with family as (
    select b.id from core.businesses b
    where b.status <> 'decommissioned'
      and (b.id = p_business or b.id in (select e.business_id from platform.business_environments e where e.parent_business_id = p_business))
  ),
  billed as (
    select distinct sub.business_id from platform.subscriptions sub
    where sub.business_id in (select id from family)
      and sub.provider in ('razorpay', 'stripe')
      and sub.status in ('active', 'trialing', 'past_due')
  ),
  updated as (
    update core.business_settings s set plan = p_plan
    where s.business_id in (select id from family) and s.business_id not in (select billed.business_id from billed)
    returning s.business_id
  )
  select f.id, f.id in (select u.business_id from updated u) from family f;

  perform platform.write_platform_audit_log(p_actor, 'updated', 'organization_plan', p_business::text, 'high', null,
    jsonb_build_object('plan', v_old), jsonb_build_object('plan', p_plan));
end;
$$;

-- Private vendor notes on one environment (the audit keeps the length, never the text).
create function platform.set_business_notes(p_actor uuid, p_business uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notes text := nullif(btrim(p_notes), '');
begin
  if v_notes is not null and length(v_notes) > 2000 then
    raise exception 'Use 2000 characters or fewer.' using errcode = '22023';
  end if;
  if not exists (select 1 from core.businesses where id = p_business) then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  insert into platform.business_environments (business_id, environment, notes)
  values (p_business, 'production', v_notes)
  on conflict (business_id) do update set notes = excluded.notes, updated_at = now();
  perform platform.write_platform_audit_log(p_actor, 'updated', 'business_notes', p_business::text, 'normal', null, null,
    jsonb_build_object('length', coalesce(length(v_notes), 0)));
end;
$$;

revoke execute on function platform.save_organization_profile(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function platform.set_organization_plan(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function platform.set_business_notes(uuid, uuid, text) from public, anon, authenticated;
grant execute on function platform.save_organization_profile(uuid, uuid, jsonb) to service_role;
grant execute on function platform.set_organization_plan(uuid, uuid, text) to service_role;
grant execute on function platform.set_business_notes(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------------------
-- Announcements for one organization, and End now (PLATFORM-P1-10.13)
-- ---------------------------------------------------------------------------------------

alter table platform.announcements
  add column audience_business_id uuid references core.businesses (id) on delete cascade;

alter table platform.announcements drop constraint announcements_audience_type_check;
alter table platform.announcements
  add constraint announcements_audience_type_check
  check (audience_type in ('all_customers', 'all_users', 'specific_plan', 'specific_country', 'specific_business'));

alter table platform.announcements drop constraint announcements_check;
alter table platform.announcements
  add constraint announcements_audience_target_check check (
    (audience_type in ('all_customers', 'all_users') and audience_plan_id is null and audience_country_code is null and audience_business_id is null)
    or (audience_type = 'specific_plan' and audience_plan_id is not null and audience_country_code is null and audience_business_id is null)
    or (audience_type = 'specific_country' and audience_country_code is not null and audience_plan_id is null and audience_business_id is null)
    or (audience_type = 'specific_business' and audience_business_id is not null and audience_plan_id is null and audience_country_code is null)
  );

-- A notice for one organization is that organization's to read, not every signed-in user's.
drop policy "authenticated users can view announcements" on platform.announcements;
create policy "users can view announcements meant for them" on platform.announcements
  for select to authenticated
  using (
    audience_type <> 'specific_business'
    or audience_business_id in (select core.user_business_ids())
    or platform.is_superadmin()
  );

-- An announcement for one organization. Same rules and event trail as
-- platform.create_announcement(), which keeps the other audiences.
create function platform.create_business_announcement(
  p_type text,
  p_title text,
  p_message text,
  p_business uuid,
  p_publish_at timestamptz,
  p_expire_at timestamptz,
  p_reason text
)
returns platform.announcements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row platform.announcements;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can create an announcement.' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to create an announcement.';
  end if;
  if p_type not in ('information', 'warning', 'critical') then
    raise exception 'Unknown announcement type: %', p_type;
  end if;
  if not exists (select 1 from core.businesses where id = p_business and status <> 'decommissioned') then
    raise exception 'Organization not found.' using errcode = 'P0002';
  end if;
  insert into platform.announcements (type, title, message, audience_type, audience_business_id, publish_at, expire_at, enabled, updated_by)
  values (p_type, p_title, p_message, 'specific_business', p_business, p_publish_at, p_expire_at, true, auth.uid())
  returning * into v_row;
  insert into platform.announcement_events (title, announcement_id, action, previous_value, new_value, reason, performed_by)
  values (v_row.title, v_row.id, 'created', null, to_jsonb(v_row), btrim(p_reason), auth.uid());
  return v_row;
end;
$$;

-- End now: the notice stops showing at once and its record is kept. False when it had
-- already ended. A notice not yet published is switched off instead (its end can't come
-- before its start).
create function platform.end_announcement(p_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev platform.announcements;
  v_row platform.announcements;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can end an announcement.' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to end an announcement.';
  end if;
  select * into v_prev from platform.announcements where id = p_id for update;
  if not found then
    raise exception 'Unknown announcement id: %', p_id;
  end if;
  if not v_prev.enabled or (v_prev.expire_at is not null and v_prev.expire_at <= now()) then
    return false;
  end if;
  if v_prev.publish_at is not null and v_prev.publish_at > now() then
    update platform.announcements set enabled = false, updated_at = now(), updated_by = auth.uid() where id = p_id returning * into v_row;
  else
    update platform.announcements set expire_at = now(), updated_at = now(), updated_by = auth.uid() where id = p_id returning * into v_row;
  end if;
  insert into platform.announcement_events (title, announcement_id, action, previous_value, new_value, reason, performed_by)
  values (v_row.title, v_row.id, 'updated', to_jsonb(v_prev), to_jsonb(v_row), btrim(p_reason), auth.uid());
  return true;
end;
$$;

revoke execute on function platform.create_business_announcement(text, text, text, uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function platform.create_business_announcement(text, text, text, uuid, timestamptz, timestamptz, text) to authenticated;
revoke execute on function platform.end_announcement(uuid, text) from public, anon;
grant execute on function platform.end_announcement(uuid, text) to authenticated;
