-- PLATFORM-P0-06.5 decision #1 (Soft-limit behavior, verbatim): "A soft limit never
-- blocks. `canConsume()`/`try_consume_usage_counter()` keep allowing the action exactly as
-- they do today for an ordinary `limited` state at/under its cap -- the only difference is
-- what happens once usage is AT OR OVER the limit for a resource marked 'soft': the action
-- must still be allowed (not denied) ... there is no ceiling on a soft limit (this decision
-- explicitly rejected the 'billing overage ceiling' option)."
--
-- `core.try_consume_usage_counter()` (PLATFORM-P0-06.3, previous migration) keeps its
-- existing atomic read-lock-decide-write shape UNCHANGED for every resource, EXCEPT: once a
-- `limited` resource's own `limit_type` (previous migration, this same story) is 'soft',
-- the function now always grants and always increments, regardless of whether doing so
-- pushes usage past `limit_value` -- no separate overage ceiling exists. A 'hard' limit
-- (the default for every pre-existing and every new `limited` row, per the previous
-- migration's own backfill/app-layer default) keeps denying exactly as it always has --
-- this migration changes no hard-limit behavior at all, and the row-level lock
-- (`select ... for update`) that makes the whole function atomic is untouched.
--
-- The function's own return shape grows one column, `limit_type` (nullable, mirrors the
-- table's own column: null for disabled/unlimited/unrestricted, 'soft' or 'hard' for
-- limited) -- Postgres cannot `CREATE OR REPLACE` a function whose `RETURNS TABLE` shape
-- changes, so this drops and recreates it. No argument/signature change, so the one
-- existing caller (`canConsume()`, packages/core/src/entitlements/limit-entitlement.ts)
-- keeps calling it exactly the same way. The new column lets
-- `buildConsumeEntitlementDecision()` tell a soft grant-past-the-guideline apart from an
-- ordinary hard grant, so its own `reason` text can say "over your plan's guideline"
-- instead of claiming usage is "within the limit" when it plainly is not.
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

  -- The same three-state read `limit-entitlement.ts`'s `getLimit()` performs: a plan with
  -- no configured row at all for this resource reads as `state is null` here, normalized
  -- below to the same "unrestricted" meaning `buildLimitEntitlementDecision()` already
  -- gives an absent row. `limit_type` is null whenever `state` isn't 'limited' (the
  -- column's own CHECK constraint guarantees this), so no separate normalization is needed
  -- for it.
  select plm.state, plm.limit_value, plm.limit_type into v_state, v_limit, v_limit_type
  from platform.plans p
  left join platform.plan_limits plm on plm.plan_id = p.id and plm.resource_key = p_resource_key
  where p.key = v_plan_key;

  if v_state is null then
    v_state := 'unrestricted';
  end if;

  -- Create the counter row first if it doesn't exist yet (mirrors
  -- `increment_usage_counter()`'s own upsert), then lock it with `for update` before
  -- reading `count` -- this is the one line that makes the whole function atomic, for both
  -- the hard and soft branches below: a second concurrent caller for the same
  -- (business, resource, period) blocks here until the first transaction commits or rolls
  -- back, so two callers can never both read the same "before" count and race past each
  -- other -- a soft limit removes the *denial*, not the lock, so a burst of concurrent soft
  -- consumption still serializes into a correct, race-free final count.
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
    -- Decision #1: a soft limit never blocks. Always grant, always increment, regardless
    -- of `v_limit` -- there is no overage ceiling to check against.
    v_granted := true;
    update core.usage_counters set count = count + p_quantity
      where business_id = p_business_id and resource_key = p_resource_key and period = p_period
      returning count into v_after;
  else -- 'limited' and v_limit_type = 'hard' (the only other possibility once state is
       -- 'limited', per the column's own CHECK constraint) -- unchanged from
       -- PLATFORM-P0-06.3's own original behavior.
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

revoke execute on function core.try_consume_usage_counter(uuid, text, integer, text) from public, anon;
grant execute on function core.try_consume_usage_counter(uuid, text, integer, text) to authenticated;
