-- Epic 2, story C-9: set-returning counterparts to core.has_module()/has_module_write()
-- (C-3), for use inside RLS policies on licensed-module tables instead of the scalar
-- functions.
--
-- Why: a policy like `using (tenant_check and core.has_module(business_id, 'inventory'))`
-- calls has_module() once per candidate row, because business_id is a correlated column
-- reference -- the planner cannot hoist it out as a constant subplan the way it can
-- `business_id in (select core.user_business_ids())` (that subquery has no correlation,
-- so Postgres evaluates it once and hashes it). Verified with scripts/perf-check-
-- tenant-license-rls.mjs: at 100k rows, the correlated-call form took ~490ms
-- (492ms / 22x a plain tenant check) vs ~22ms for a plain tenant check with an identical
-- row count, because of the per-row security-definer function call overhead.
--
-- These return the set of business_ids licensed for a module (same status/grace logic as
-- has_module()/has_module_write()), so a policy can instead write
-- `business_id in (select core.licensed_business_ids('inventory'))` -- an uncorrelated
-- subquery, evaluated once and hashed just like user_business_ids() already is. Every
-- future licensed-module table's RLS (SP-3a onward) should use these, not the scalar
-- functions, for its policy bodies; has_module()/has_module_write() remain the right
-- choice for one-off checks outside a per-row filter (requirePermission()-style
-- defense-in-depth calls, UI gating, proxy.ts's route guard).

create function core.licensed_business_ids(p_key text)
returns setof uuid
language sql
stable
security definer
set search_path = core
as $$
  select business_id from core.licenses
  where module_key = p_key
    and (
      status = 'active'
      or (status = 'grace' and (grace_ends_at is null or grace_ends_at > now()))
    );
$$;

create function core.write_licensed_business_ids(p_key text)
returns setof uuid
language sql
stable
security definer
set search_path = core
as $$
  select business_id from core.licenses
  where module_key = p_key
    and status = 'active';
$$;

revoke execute on function core.licensed_business_ids(text) from public, anon;
revoke execute on function core.write_licensed_business_ids(text) from public, anon;
grant execute on function core.licensed_business_ids(text) to authenticated;
grant execute on function core.write_licensed_business_ids(text) to authenticated;
