-- PLATFORM-P1-02.1/02.2/02.3 ("Business-Level Exceptions", docs/plan/09-PLATFORM-ADMIN-
-- PORTAL-BACKLOG.md §24): a superadmin grants one business a time-boxed exception to its
-- plan --
--
--   Business A / Plan: Pro / Temporary Discovery limit: 500 / Expires: 30 days /
--   Reason: Enterprise pilot
--
-- Entity-ownership check (00-MASTER-PLAN.md §5): nothing existing models a per-business
-- exception. core.licenses decides whether a *module* is licensed at all (and a superadmin
-- already grants or revokes those by hand), platform.plan_features / plan_limits are
-- per-plan. So this is the Business Override layer PLATFORM-P0-05.2's precedence chain
-- already names (Platform Global -> Plan -> Business Override -> User Permission), for the
-- two things a plan decides that a licence doesn't:
--
--   * 'feature' -- grant a platform.features capability the business's plan lacks;
--   * 'limit'   -- replace a plan limit (platform.plan_limits) with a specific number, or
--                  with unlimited (limit_value null).
--
-- It never overrides a licence: a feature override on an unlicensed module grants nothing
-- (hasFeature() checks the licence first), and RLS `tenant AND licensed` stays the
-- authoritative gate for data.
--
-- 02.2 ("Every override must have reason, created_by, start, expiry"): all four are NOT
-- NULL with checks, so an open-ended or unexplained exception can't exist. Revoking stamps
-- revoked_at/by/reason; nothing is ever deleted (no DELETE grant), so the history of an
-- override outlives it.
--
-- 02.3 ("All overrides audited"): create and revoke go through SECURITY DEFINER functions
-- that re-check platform.is_superadmin() and write platform.audit_log (severity high) with
-- the reason and before/after rows; authenticated has no INSERT/UPDATE/DELETE grant.
--
-- Enforcement: core.try_consume_usage_counter() (PLATFORM-P0-06.3's atomic limit check) is
-- redefined here with the same signature and result shape, consulting an active limit
-- override before the plan's own limit.

create table platform.business_overrides (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  override_type text not null check (override_type in ('feature', 'limit')),
  module_key text references core.modules (key),
  feature_key text,
  -- Same closed vocabulary as platform.plan_limits / core.usage_counters.
  resource_key text check (resource_key is null or resource_key in (
    'businesses', 'users', 'business_offerings', 'products', 'contacts', 'prospects',
    'opportunities', 'ai_runs', 'ai_credits', 'whatsapp_conversations', 'storage',
    'api_calls', 'automation_runs'
  )),
  -- 'limit' only: the replacement limit; null = unlimited for the override's duration.
  limit_value integer check (limit_value is null or limit_value >= 0),
  reason text not null check (btrim(reason) <> '' and char_length(reason) <= 500),
  created_by uuid not null references auth.users (id) on delete restrict,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  revoke_reason text,
  created_at timestamptz not null default now(),
  check (expires_at > starts_at),
  check (
    (override_type = 'feature' and module_key is not null and feature_key is not null and resource_key is null and limit_value is null)
    or (override_type = 'limit' and resource_key is not null and module_key is null and feature_key is null)
  ),
  check ((revoked_at is null and revoke_reason is null) or (revoked_at is not null and btrim(revoke_reason) <> ''))
);

create index business_overrides_business_idx on platform.business_overrides (business_id, override_type);
create index business_overrides_created_by_idx on platform.business_overrides (created_by);
create index business_overrides_revoked_by_idx on platform.business_overrides (revoked_by);
create index business_overrides_module_key_idx on platform.business_overrides (module_key);

alter table platform.business_overrides enable row level security;

-- A business's own members may read its overrides (the entitlement service runs with the
-- member's session and has to see them); superadmins see every business's.
create policy "members and superadmins can view business overrides" on platform.business_overrides
  for select to authenticated
  using (business_id in (select core.user_business_ids()) or platform.is_superadmin());

grant select on platform.business_overrides to authenticated;
grant all on platform.business_overrides to service_role;

-- The one active override of a kind, if any: started, not expired, not revoked. When two
-- overlap, the most recently created wins.
create function platform.active_limit_override(p_business_id uuid, p_resource_key text)
returns table (override_id uuid, limit_value integer)
language sql
stable
security definer
set search_path = platform
as $$
  select o.id, o.limit_value
  from platform.business_overrides o
  where o.business_id = p_business_id
    and o.override_type = 'limit'
    and o.resource_key = p_resource_key
    and o.revoked_at is null
    and o.starts_at <= now()
    and o.expires_at > now()
  order by o.created_at desc
  limit 1;
$$;

revoke execute on function platform.active_limit_override(uuid, text) from public, anon, authenticated;

create function platform.create_business_override(
  p_business_id uuid,
  p_override_type text,
  p_module_key text,
  p_feature_key text,
  p_resource_key text,
  p_limit_value integer,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_row platform.business_overrides;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can grant a business override.' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.';
  end if;
  if p_expires_at is null then
    raise exception 'An expiry is required.';
  end if;
  if p_override_type = 'feature' and not exists (
    select 1 from platform.features f where f.module_key = p_module_key and f.key = p_feature_key
  ) then
    raise exception 'Unknown feature %.%', p_module_key, p_feature_key;
  end if;

  insert into platform.business_overrides (
    business_id, override_type, module_key, feature_key, resource_key, limit_value,
    reason, created_by, starts_at, expires_at
  )
  values (
    p_business_id, p_override_type,
    case when p_override_type = 'feature' then p_module_key end,
    case when p_override_type = 'feature' then p_feature_key end,
    case when p_override_type = 'limit' then p_resource_key end,
    case when p_override_type = 'limit' then p_limit_value end,
    btrim(p_reason), auth.uid(), coalesce(p_starts_at, now()), p_expires_at
  )
  returning * into v_row;

  perform platform.write_platform_audit_log(
    auth.uid(), 'created', 'business_override', v_row.id::text, 'high', btrim(p_reason), null, to_jsonb(v_row)
  );
  return v_row.id;
end;
$$;

create function platform.revoke_business_override(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_before platform.business_overrides;
  v_after platform.business_overrides;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can revoke a business override.' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.';
  end if;
  select * into v_before from platform.business_overrides where id = p_id for update;
  if not found then
    raise exception 'Unknown override %', p_id;
  end if;
  if v_before.revoked_at is not null then
    raise exception 'This override is already revoked.';
  end if;

  update platform.business_overrides
  set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = btrim(p_reason)
  where id = p_id
  returning * into v_after;

  perform platform.write_platform_audit_log(
    auth.uid(), 'updated', 'business_override', p_id::text, 'high', btrim(p_reason), to_jsonb(v_before), to_jsonb(v_after)
  );
end;
$$;

revoke execute on function platform.create_business_override(uuid, text, text, text, text, integer, timestamptz, timestamptz, text) from public, anon;
revoke execute on function platform.revoke_business_override(uuid, text) from public, anon;
grant execute on function platform.create_business_override(uuid, text, text, text, text, integer, timestamptz, timestamptz, text) to authenticated;
grant execute on function platform.revoke_business_override(uuid, text) to authenticated;

-- PLATFORM-P0-06.3's atomic check-and-consume, now honouring an active limit override
-- (PLATFORM-P1-02.1). Same signature, same result shape: an override reports as a hard
-- 'limited' row (or 'unlimited' when its limit_value is null), so every existing caller
-- keeps working unchanged. Body otherwise identical to
-- 20260912120000_core_try_consume_usage_counter_soft_limits.sql.
create or replace function core.try_consume_usage_counter(
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
  granted boolean
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
  v_before integer;
  v_after integer;
  v_granted boolean;
  v_override_id uuid;
  v_override_limit integer;
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

  select o.override_id, o.limit_value into v_override_id, v_override_limit
  from platform.active_limit_override(p_business_id, p_resource_key) o;

  if v_override_id is not null then
    v_state := case when v_override_limit is null then 'unlimited' else 'limited' end;
    v_limit := v_override_limit;
    v_limit_type := case when v_override_limit is null then null else 'hard' end;
  else
    select plm.state, plm.limit_value, plm.limit_type into v_state, v_limit, v_limit_type
    from platform.plans p
    left join platform.plan_limits plm on plm.plan_id = p.id and plm.resource_key = p_resource_key
    where p.key = v_plan_key;
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

  return query select v_state, v_limit, v_limit_type, v_before, v_after, v_granted;
end;
$$;
