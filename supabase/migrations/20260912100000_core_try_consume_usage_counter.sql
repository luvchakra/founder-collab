-- PLATFORM-P0-06.3 ("Limit Enforcement", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §10)
-- -- "Enforce limits server-side. UI-only restrictions are not sufficient." This is
-- `canConsume(business, resource, quantity)`, PLATFORM-P0-05.1's fourth and last named
-- entitlement-service function, deliberately left unbuilt by every prior story that named
-- it (`limit-entitlement.ts`'s own docstring, `usage/mutations.ts`'s own docstring) for
-- exactly this reason: it needs to reserve/check against a *prospective* quantity
-- atomically at the point of the action, a genuinely different concern from `getLimit()`'s
-- "read the current state."
--
-- Why this is a new SQL function rather than a TypeScript read-then-write: a
-- read-then-write in application code (read `getLimit()`, decide, then call
-- `incrementUsageCounter()`) has a real race -- two concurrent requests can both read
-- "1 remaining" and both proceed, overshooting the limit by one. The only way to make
-- "would consuming N more exceed the limit" and "consume N more" atomic is to do both
-- inside one transaction, row-locked, server-side -- exactly `core.increment_usage_counter()`'s
-- own reasoning for being a single SECURITY DEFINER function rather than a client
-- read-modify-write, one migration over.
--
-- Deliberately returns raw facts (`state`, `limit_value`, `usage_before`, `usage_after`,
-- `granted`), not an already-shaped `EntitlementDecision` -- the decision's `reason`/
-- `allowed` text belongs in `packages/core/src/entitlements/limit-entitlement.ts`'s own
-- pure, directly-unit-tested `buildConsumeEntitlementDecision()`, matching the same
-- "IO-touching function returns raw data, a pure sibling shapes the decision" split
-- `getLimit()`/`buildLimitEntitlementDecision()` already established -- there is no reason
-- to duplicate that shaping logic in PL/pgSQL string formatting.
create function core.try_consume_usage_counter(
  p_business_id uuid,
  p_resource_key text,
  p_quantity integer default 1,
  p_period text default 'current'
)
returns table (
  state text,
  limit_value integer,
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
  -- gives an absent row.
  select plm.state, plm.limit_value into v_state, v_limit
  from platform.plans p
  left join platform.plan_limits plm on plm.plan_id = p.id and plm.resource_key = p_resource_key
  where p.key = v_plan_key;

  if v_state is null then
    v_state := 'unrestricted';
  end if;

  -- Create the counter row first if it doesn't exist yet (mirrors
  -- `increment_usage_counter()`'s own upsert), then lock it with `for update` before
  -- reading `count` -- this is the one line that makes the whole function atomic: a second
  -- concurrent caller for the same (business, resource, period) blocks here until the
  -- first transaction commits or rolls back, so two callers can never both read the same
  -- "before" count and both be granted past the limit.
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
  else -- 'limited'
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

  return query select v_state, v_limit, v_before, v_after, v_granted;
end;
$$;

revoke execute on function core.try_consume_usage_counter(uuid, text, integer, text) from public, anon;
grant execute on function core.try_consume_usage_counter(uuid, text, integer, text) to authenticated;
