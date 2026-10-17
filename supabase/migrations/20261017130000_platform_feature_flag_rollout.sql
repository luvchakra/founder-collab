-- PLATFORM-P1-08.2 ("Feature Rollout") and PLATFORM-P1-08.3 ("Rollback Flag"),
-- docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §30.
--
-- 08.2 asks for a staged rollout -- Internal, Pilot, Selected Plans, All Customers. 08.3
-- asks to turn a feature off without reverting application code. Both extend the existing
-- operational flag catalog (`platform.feature_flags`, PLATFORM-P0-08) rather than adding a
-- parallel table: a rollout is a property of a flag, and its history belongs in the same
-- `platform.feature_flag_events` stream the Audit and Config History pages already read.
--
-- Stages are cumulative, each one adds to the last:
--   internal        only the named businesses (`rollout_business_ids`)
--   pilot           named businesses + `rollout_percentage`% of all businesses
--   selected_plans  pilot + every business on one of `rollout_plan_keys`
--   all             every business (the default, so flags created before this keep
--                   behaving exactly as they did)
-- The percentage uses a deterministic bucket: the first 32 bits of
-- sha256(feature_key || ':' || business_id), mod 100. The same business always lands in
-- the same bucket for the same flag, so raising the percentage only ever adds businesses
-- and never flips one that was already in back out. Different flags bucket independently.
-- `platform-feature-rollout.ts` computes the identical bucket in TypeScript.
--
-- Rollback (08.3): every rollout change saves the configuration it replaced in
-- `last_good_rollout`. `platform.rollback_feature_flag()` restores that saved
-- configuration (and clears it, so a second rollback does not bounce back). If no earlier
-- rollout is saved, the rollback turns the flag off instead. Either way a reason is
-- required and one 'rolled_back' event is written.
--
-- Platform control-plane data (CLAUDE.md non-negotiable #1): not tenant data and never
-- gated by `core.licenses`. Writes are superadmin-only, through SECURITY DEFINER functions
-- that check `platform.is_superadmin()` themselves; there is still no direct write grant
-- on `platform.feature_flags` to `authenticated`.

alter table platform.feature_flags
  add column rollout_stage text not null default 'all'
    check (rollout_stage in ('internal', 'pilot', 'selected_plans', 'all')),
  add column rollout_percentage smallint not null default 0
    check (rollout_percentage between 0 and 100),
  add column rollout_business_ids uuid[] not null default '{}'
    check (cardinality(rollout_business_ids) <= 500),
  add column rollout_plan_keys text[] not null default '{}',
  add column last_good_rollout jsonb,
  -- The percentage only counts from Pilot on; plans only at Selected Plans and All.
  add constraint feature_flags_rollout_internal_no_percentage
    check (rollout_stage <> 'internal' or rollout_percentage = 0),
  add constraint feature_flags_rollout_plans_stage
    check (rollout_stage in ('selected_plans', 'all') or cardinality(rollout_plan_keys) = 0);

alter table platform.feature_flag_events drop constraint feature_flag_events_action_check;
alter table platform.feature_flag_events add constraint feature_flag_events_action_check
  check (action in ('created', 'updated', 'deleted', 'rollout_changed', 'rolled_back'));

-- The deterministic rollout bucket (0-99) for one business and one flag.
create function platform.feature_rollout_bucket(p_feature_key text, p_business_id uuid)
returns integer
language sql
immutable
strict
set search_path = ''
as $$
  select ((('x' || left(encode(sha256(convert_to(p_feature_key || ':' || p_business_id::text, 'UTF8')), 'hex'), 8))::bit(32)::bigint) % 100)::integer;
$$;

revoke execute on function platform.feature_rollout_bucket(text, uuid) from public, anon;
grant execute on function platform.feature_rollout_bucket(text, uuid) to authenticated, service_role;

create function platform.feature_flag_rollout_snapshot(p platform.feature_flags)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'rollout_stage', p.rollout_stage,
    'rollout_percentage', p.rollout_percentage,
    'rollout_business_ids', to_jsonb(p.rollout_business_ids),
    'rollout_plan_keys', to_jsonb(p.rollout_plan_keys)
  );
$$;

revoke execute on function platform.feature_flag_rollout_snapshot(platform.feature_flags) from public, anon;

-- Set (or advance) a flag's rollout. Superadmin only, reason required.
create function platform.set_feature_flag_rollout(
  p_id uuid,
  p_stage text,
  p_percentage integer,
  p_business_ids uuid[],
  p_plan_keys text[],
  p_reason text
)
returns platform.feature_flags
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev platform.feature_flags;
  v_row platform.feature_flags;
  v_ids uuid[] := coalesce((select array_agg(distinct x order by x) from unnest(coalesce(p_business_ids, '{}')) x), '{}');
  v_plans text[] := coalesce((select array_agg(distinct x order by x) from unnest(coalesce(p_plan_keys, '{}')) x), '{}');
  v_pct integer := coalesce(p_percentage, 0);
  v_unknown text;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can change a feature rollout.' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to change a feature rollout.' using errcode = '22023';
  end if;
  if p_stage is null or p_stage not in ('internal', 'pilot', 'selected_plans', 'all') then
    raise exception 'Unknown rollout stage: %', p_stage using errcode = '22023';
  end if;
  if v_pct < 0 or v_pct > 100 then
    raise exception 'Rollout percentage must be between 0 and 100.' using errcode = '22023';
  end if;
  if p_stage = 'internal' then
    v_pct := 0;
  end if;
  if p_stage in ('internal', 'pilot') then
    v_plans := '{}';
  end if;

  select x::text into v_unknown from unnest(v_ids) x
  where not exists (select 1 from core.businesses b where b.id = x) limit 1;
  if v_unknown is not null then
    raise exception 'Unknown business: %', v_unknown using errcode = '22023';
  end if;
  select x into v_unknown from unnest(v_plans) x
  where not exists (select 1 from platform.plans pl where pl.key = x) limit 1;
  if v_unknown is not null then
    raise exception 'Unknown plan: %', v_unknown using errcode = '22023';
  end if;

  select * into v_prev from platform.feature_flags where id = p_id for update;
  if not found then
    raise exception 'Unknown feature flag id: %', p_id using errcode = 'P0002';
  end if;

  if v_prev.rollout_stage = p_stage and v_prev.rollout_percentage = v_pct
     and v_prev.rollout_business_ids = v_ids and v_prev.rollout_plan_keys = v_plans then
    -- Nothing changed: no event, and the saved known-good state is kept as it is.
    return v_prev;
  end if;

  update platform.feature_flags
  set rollout_stage = p_stage,
      rollout_percentage = v_pct,
      rollout_business_ids = v_ids,
      rollout_plan_keys = v_plans,
      last_good_rollout = platform.feature_flag_rollout_snapshot(v_prev),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_id
  returning * into v_row;

  insert into platform.feature_flag_events (feature_key, flag_id, action, previous_value, new_value, reason, performed_by)
  values (v_row.feature_key, v_row.id, 'rollout_changed', to_jsonb(v_prev), to_jsonb(v_row), btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.set_feature_flag_rollout(uuid, text, integer, uuid[], text[], text) from public, anon;
grant execute on function platform.set_feature_flag_rollout(uuid, text, integer, uuid[], text[], text) to authenticated;

-- PLATFORM-P1-08.3: one-step rollback. Restores the saved known-good rollout, or turns the
-- flag off when there is none. Superadmin only, reason required.
create function platform.rollback_feature_flag(p_id uuid, p_reason text)
returns platform.feature_flags
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev platform.feature_flags;
  v_row platform.feature_flags;
  v_good jsonb;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can roll back a feature flag.' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to roll back a feature flag.' using errcode = '22023';
  end if;

  select * into v_prev from platform.feature_flags where id = p_id for update;
  if not found then
    raise exception 'Unknown feature flag id: %', p_id using errcode = 'P0002';
  end if;
  v_good := v_prev.last_good_rollout;

  if v_good is not null then
    update platform.feature_flags
    set rollout_stage = v_good ->> 'rollout_stage',
        rollout_percentage = (v_good ->> 'rollout_percentage')::smallint,
        rollout_business_ids = coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(v_good -> 'rollout_business_ids') x), '{}'),
        rollout_plan_keys = coalesce((select array_agg(x) from jsonb_array_elements_text(v_good -> 'rollout_plan_keys') x), '{}'),
        last_good_rollout = null,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_id
    returning * into v_row;
  elsif v_prev.enabled then
    update platform.feature_flags
    set enabled = false,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_id
    returning * into v_row;
  else
    raise exception 'Nothing to roll back: this flag is already off and has no earlier rollout saved.' using errcode = '22023';
  end if;

  insert into platform.feature_flag_events (feature_key, flag_id, action, previous_value, new_value, reason, performed_by)
  values (v_row.feature_key, v_row.id, 'rolled_back', to_jsonb(v_prev), to_jsonb(v_row), btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.rollback_feature_flag(uuid, text) from public, anon;
grant execute on function platform.rollback_feature_flag(uuid, text) to authenticated;

-- Runtime evaluation: is this flag on for this business right now? Deterministic, and
-- fails closed: an unknown flag, an unknown business, a caller with no access to the
-- business, missing scope data or any error all answer false. A signed-in caller may ask
-- only about a business they belong to (or any business, as a superadmin); the service
-- role may ask about any business.
create function platform.is_feature_enabled_for_business(p_feature_key text, p_business_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_flag platform.feature_flags;
  v_plan text;
  v_country text;
  v_root uuid;
begin
  if p_feature_key is null or p_business_id is null then
    return false;
  end if;
  if coalesce(current_setting('role', true), '') <> 'service_role'
     and not platform.is_superadmin()
     and p_business_id not in (select core.user_business_ids()) then
    return false;
  end if;

  select * into v_flag from platform.feature_flags where feature_key = p_feature_key;
  if not found then
    return false;
  end if;
  if not v_flag.enabled
     or (v_flag.effective_from is not null and now() < v_flag.effective_from)
     or (v_flag.effective_to is not null and now() > v_flag.effective_to) then
    return false;
  end if;

  select s.plan into v_plan from core.business_settings s where s.business_id = p_business_id;
  if not found then
    return false;
  end if;

  -- The flag's own scope (PLATFORM-P0-08.2).
  if v_flag.scope_type = 'plan' then
    if not exists (select 1 from platform.plans pl where pl.id = v_flag.scope_plan_id and pl.key = v_plan) then
      return false;
    end if;
  elsif v_flag.scope_type = 'module' then
    if not exists (
      select 1 from core.licenses l
      where l.business_id = p_business_id and l.module_key = v_flag.scope_module_key
        and (l.status = 'active' or (l.status = 'grace' and (l.grace_ends_at is null or l.grace_ends_at > now())))
    ) then
      return false;
    end if;
  elsif v_flag.scope_type = 'country' then
    select coalesce(e.parent_business_id, p_business_id) into v_root
    from (select 1) one left join platform.business_environments e on e.business_id = p_business_id;
    select op.country into v_country from platform.organization_profiles op where op.business_id = v_root;
    if v_country is null or v_country <> v_flag.scope_country_code then
      return false;
    end if;
  elsif v_flag.scope_type <> 'global' then
    return false;
  end if;

  -- The staged rollout (PLATFORM-P1-08.2). Stages are cumulative.
  if v_flag.rollout_stage = 'all' then
    return true;
  end if;
  if p_business_id = any (v_flag.rollout_business_ids) then
    return true;
  end if;
  if v_flag.rollout_stage in ('pilot', 'selected_plans')
     and platform.feature_rollout_bucket(v_flag.feature_key, p_business_id) < v_flag.rollout_percentage then
    return true;
  end if;
  if v_flag.rollout_stage = 'selected_plans' and v_plan = any (v_flag.rollout_plan_keys) then
    return true;
  end if;
  return false;
exception when others then
  return false;
end;
$$;

revoke execute on function platform.is_feature_enabled_for_business(text, uuid) from public, anon;
grant execute on function platform.is_feature_enabled_for_business(text, uuid) to authenticated, service_role;
