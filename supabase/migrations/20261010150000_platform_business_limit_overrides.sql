-- PLATFORM-P1-02.1 (Business Override), PLATFORM-P1-02.2 (Temporary Entitlement) and
-- PLATFORM-P1-02.3 (Override Audit), docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §24.
--
-- A superadmin can give one business a different limit for one resource than its plan
-- allows, for a fixed window -- the backlog's own example is "Business A, Plan: Pro,
-- Temporary Discovery limit: 500, Expires: 30 days, Reason: Enterprise pilot".
--
--   02.1  platform.business_limit_overrides: business, resource, limit (a number or
--         unlimited). While active it replaces the plan's limit for that business in both
--         places limits are enforced -- getLimit() (via active_limit_override()) and
--         core.try_consume_usage_counter() (replaced below).
--   02.2  Every override carries reason, created_by, starts_at and expires_at, all
--         required. Expiry needs no job: an override is active only while
--         starts_at <= now() < expires_at and it hasn't been revoked. At most a year long;
--         two overrides for the same business and resource may not overlap.
--   02.3  Rows are written only through create_/revoke_business_limit_override(), never
--         edited (a trigger allows nothing but a one-time revoke) and every insert,
--         revoke or delete lands in platform.audit_log at severity 'high', from a trigger
--         so a service-role write is audited too.
--
-- Scope: limits only. Granting a module a business hasn't licensed would bypass
-- core.licenses, which RLS treats as authoritative (ADR-8) -- that is a licensing change,
-- not an override, and is not built here.

create table platform.business_limit_overrides (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  resource_key text not null check (resource_key in (
    'businesses', 'users', 'business_offerings', 'products', 'contacts', 'prospects',
    'opportunities', 'ai_runs', 'ai_credits', 'whatsapp_conversations', 'storage',
    'api_calls', 'automation_runs'
  )),
  state text not null check (state in ('limited', 'unlimited')),
  limit_value integer check (limit_value is null or limit_value >= 0),
  reason text not null check (btrim(reason) <> ''),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  -- Required at creation (the create function sets it from auth.uid()); nullable only so
  -- deleting the admin's account doesn't fail or erase the override's history.
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  revoke_reason text,
  constraint business_limit_overrides_value_matches_state check ((state = 'limited') = (limit_value is not null)),
  constraint business_limit_overrides_window check (expires_at > starts_at and expires_at <= starts_at + interval '366 days'),
  constraint business_limit_overrides_revoke_reason check ((revoked_at is null) = (revoke_reason is null))
);

create index business_limit_overrides_lookup_idx
  on platform.business_limit_overrides (business_id, resource_key, expires_at desc);

alter table platform.business_limit_overrides enable row level security;

create policy "superadmins can view business limit overrides" on platform.business_limit_overrides
  for select to authenticated
  using (platform.is_superadmin());

revoke all on platform.business_limit_overrides from anon, authenticated;
grant select on platform.business_limit_overrides to authenticated;
grant all on platform.business_limit_overrides to service_role;

-- 02.3: an override is never edited. The only change allowed is the one-time revoke.
create function platform.guard_business_limit_override_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is not null then
    raise exception 'This override is already revoked.';
  end if;
  if (new.business_id, new.resource_key, new.state, new.limit_value, new.reason, new.starts_at,
      new.expires_at, new.created_by, new.created_at)
     is distinct from
     (old.business_id, old.resource_key, old.state, old.limit_value, old.reason, old.starts_at,
      old.expires_at, old.created_by, old.created_at) then
    raise exception 'An override cannot be edited. Revoke it and create a new one.';
  end if;
  return new;
end;
$$;

create trigger business_limit_overrides_guard_update
  before update on platform.business_limit_overrides
  for each row execute function platform.guard_business_limit_override_update();

create function platform.log_business_limit_override_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform platform.write_platform_audit_log(auth.uid(), 'deleted', 'business_override', old.id::text, 'high', null, to_jsonb(old), null);
    return old;
  elsif tg_op = 'UPDATE' then
    perform platform.write_platform_audit_log(auth.uid(), 'updated', 'business_override', new.id::text, 'high', new.revoke_reason, to_jsonb(old), to_jsonb(new));
    return new;
  else
    perform platform.write_platform_audit_log(auth.uid(), 'created', 'business_override', new.id::text, 'high', new.reason, null, to_jsonb(new));
    return new;
  end if;
end;
$$;

create trigger business_limit_overrides_audit
  after insert or update or delete on platform.business_limit_overrides
  for each row execute function platform.log_business_limit_override_audit();

create function platform.create_business_limit_override(
  p_business_id uuid,
  p_resource_key text,
  p_state text,
  p_limit_value integer,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_starts timestamptz := coalesce(p_starts_at, now());
  v_id uuid;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.';
  end if;
  if p_expires_at is null then
    raise exception 'An expiry date is required.';
  end if;
  if p_expires_at <= now() then
    raise exception 'The expiry date must be in the future.';
  end if;
  if p_expires_at <= v_starts then
    raise exception 'The expiry must be after the start.';
  end if;
  if p_expires_at > v_starts + interval '366 days' then
    raise exception 'An override can last at most a year.';
  end if;
  if not exists (select 1 from core.businesses b where b.id = p_business_id) then
    raise exception 'Unknown business.';
  end if;

  -- Serialize creates for one business and resource so two can't both pass the overlap check.
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':' || p_resource_key, 0));
  if exists (
    select 1 from platform.business_limit_overrides o
    where o.business_id = p_business_id
      and o.resource_key = p_resource_key
      and o.revoked_at is null
      and o.starts_at < p_expires_at
      and o.expires_at > v_starts
  ) then
    raise exception 'An override for this resource already covers part of that period. Revoke it first.';
  end if;

  insert into platform.business_limit_overrides
    (business_id, resource_key, state, limit_value, reason, starts_at, expires_at, created_by)
  values
    (p_business_id, p_resource_key, p_state, p_limit_value, btrim(p_reason), v_starts, p_expires_at, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create function platform.revoke_business_limit_override(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.';
  end if;
  update platform.business_limit_overrides
     set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = btrim(p_reason)
   where id = p_id and revoked_at is null;
  if not found then
    raise exception 'Override not found, or already revoked.';
  end if;
end;
$$;

-- The override in force right now, for getLimit(). Readable by the business's own members
-- (their limit is theirs to know) and superadmins; the reason stays superadmin-only.
create function platform.active_limit_override(p_business_id uuid, p_resource_key text)
returns table (state text, limit_value integer, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.state, o.limit_value, o.expires_at
  from platform.business_limit_overrides o
  where o.business_id = p_business_id
    and o.resource_key = p_resource_key
    and o.revoked_at is null
    and o.starts_at <= now()
    and o.expires_at > now()
    and (platform.is_superadmin() or exists (select 1 from core.user_business_ids() as b(id) where b.id = p_business_id))
  order by o.created_at desc
  limit 1;
$$;

revoke execute on function platform.create_business_limit_override(uuid, text, text, integer, timestamptz, timestamptz, text) from public, anon;
grant execute on function platform.create_business_limit_override(uuid, text, text, integer, timestamptz, timestamptz, text) to authenticated;
revoke execute on function platform.revoke_business_limit_override(uuid, text) from public, anon;
grant execute on function platform.revoke_business_limit_override(uuid, text) to authenticated;
revoke execute on function platform.active_limit_override(uuid, text) from public, anon;
grant execute on function platform.active_limit_override(uuid, text) to authenticated, service_role;
revoke execute on function platform.guard_business_limit_override_update() from public, anon, authenticated;
revoke execute on function platform.log_business_limit_override_audit() from public, anon, authenticated;

-- 02.1: enforcement. Same function as 20260912120000 with one step added: an active
-- override replaces the plan's (state, limit) for this business and resource -- a limited
-- override is a hard limit -- and the result says so in a new `overridden` column. The
-- return shape changes, so the function is dropped and recreated with the same grants.
drop function core.try_consume_usage_counter(uuid, text, integer, text);

create function core.try_consume_usage_counter(
  p_business_id uuid,
  p_resource_key text,
  p_quantity integer default 1,
  p_period text default 'current'
)
returns table (
  state text,
  limit_value integer,
  limit_type text,
  usage_before integer,
  usage_after integer,
  granted boolean,
  overridden boolean
)
language plpgsql
security definer
set search_path = core, platform, pg_temp
as $$
declare
  v_plan_key text;
  v_state text;
  v_limit integer;
  v_limit_type text;
  v_override_state text;
  v_override_limit integer;
  v_overridden boolean := false;
  v_before integer;
  v_after integer;
  v_granted boolean;
begin
  if p_quantity <= 0 then
    raise exception 'try_consume_usage_counter: p_quantity must be positive, got %', p_quantity;
  end if;

  if p_business_id not in (select user_business_ids()) then
    raise exception 'try_consume_usage_counter: % is not a member of business %', auth.uid(), p_business_id;
  end if;

  select bs.plan into v_plan_key from core.business_settings bs where bs.business_id = p_business_id;
  if v_plan_key is null then
    raise exception 'try_consume_usage_counter: business % has no business_settings row (the on_core_business_created trigger should have created one)', p_business_id;
  end if;

  select plm.state, plm.limit_value, plm.limit_type into v_state, v_limit, v_limit_type
  from platform.plans p
  left join platform.plan_limits plm on plm.plan_id = p.id and plm.resource_key = p_resource_key
  where p.key = v_plan_key;

  -- PLATFORM-P1-02.1: an active business override wins over the plan.
  select o.state, o.limit_value into v_override_state, v_override_limit
  from platform.business_limit_overrides o
  where o.business_id = p_business_id
    and o.resource_key = p_resource_key
    and o.revoked_at is null
    and o.starts_at <= now()
    and o.expires_at > now()
  order by o.created_at desc
  limit 1;
  if v_override_state is not null then
    v_overridden := true;
    v_state := v_override_state;
    v_limit := v_override_limit;
    v_limit_type := case when v_override_state = 'limited' then 'hard' end;
  end if;

  if v_state is null then
    v_state := 'unrestricted';
  end if;

  insert into core.usage_counters (business_id, resource_key, period, count)
  values (p_business_id, p_resource_key, p_period, 0)
  on conflict (business_id, resource_key, period) do nothing;

  select count into v_before
  from core.usage_counters
  where business_id = p_business_id and resource_key = p_resource_key and period = p_period
  for update;

  if v_state = 'disabled' then
    v_granted := false;
    v_after := v_before;
  elsif v_state in ('unlimited', 'unrestricted') then
    v_granted := true;
    update core.usage_counters set count = count + p_quantity
      where business_id = p_business_id and resource_key = p_resource_key and period = p_period
      returning count into v_after;
  elsif v_state = 'limited' and v_limit_type = 'soft' then
    v_granted := true;
    update core.usage_counters set count = count + p_quantity
      where business_id = p_business_id and resource_key = p_resource_key and period = p_period
      returning count into v_after;
  else
    if v_before + p_quantity > v_limit then
      v_granted := false;
      v_after := v_before;
    else
      v_granted := true;
      update core.usage_counters set count = count + p_quantity
        where business_id = p_business_id and resource_key = p_resource_key and period = p_period
        returning count into v_after;
    end if;
  end if;

  return query select v_state, v_limit, v_limit_type, v_before, v_after, v_granted, v_overridden;
end;
$$;

revoke execute on function core.try_consume_usage_counter(uuid, text, integer, text) from public, anon;
grant execute on function core.try_consume_usage_counter(uuid, text, integer, text) to authenticated;
