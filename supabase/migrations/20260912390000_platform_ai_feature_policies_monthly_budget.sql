-- PLATFORM-P0-10.1 ("Platform AI Budget", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §14)
-- -- **user-decided scope, not this migration's own judgment call**. §14's own text lists
-- four fields for 10.1 ("daily budget / monthly budget / per-business budget /
-- per-feature budget"). PLATFORM-P0-09.4's own migration
-- (20260912380000_platform_ai_feature_policies.sql) already stopped-and-reported on this
-- exact overlap when it landed `daily_platform_budget_usd`, and the follow-on
-- PLATFORM-P0-10.1/10.2 story (this backlog's next section) stopped again rather than
-- guess. The user has since decided all three open questions from that stop-and-report
-- entry (docs/design/platform-admin-portal-audit.md, "PLATFORM-P0-10.1/10.2 -- STOP AND
-- REPORT"); this migration implements exactly decision #1:
--
--   1. §14's "daily budget" IS `platform.ai_feature_policies.daily_platform_budget_usd`
--      (already built by 09.4) -- not a second, independent column/table. This migration
--      adds ONLY the "monthly budget" half as a new column on the SAME row, through the
--      SAME audited-mutation function (`update_ai_feature_policies()`, extended in place,
--      not duplicated) and the SAME UI page (`/platform/ai-feature-policies`).
--
-- Decisions #2 and #3 are explicitly OUT of scope for this migration and are not
-- implemented here (see the audit log entry for this story for the full reasoning):
--
--   2. "Per-business budget" and "per-feature budget" are DEFERRED -- no `business_id`-
--      keyed table, no per-`AiOperation`/per-`ModuleKey`/per-feature-flag budget column or
--      table is added by this migration. The granularity question (identical-for-all vs.
--      true per-business override; which "feature" concept) remains genuinely unresolved
--      and is left for a future, separately-scoped story.
--   3. PLATFORM-P0-10.2 (the "Pause AI, notify SUPERADMIN" circuit breaker) is DEFERRED in
--      full -- this migration adds no runtime enforcement, no threshold-exceeded check, no
--      notification mechanism, and no wiring into `business-router.ts`/discovery's own
--      router. `monthly_budget_usd` is config only, exactly like `daily_platform_budget_usd`
--      already is -- no code anywhere reads either column to make a real decision yet.
--
-- **Shape**: same USD-denomination reasoning 09.4 already documented for
-- `daily_platform_budget_usd` (every real AI provider bills WonderArc itself in USD
-- regardless of a customer plan's own currency) and the same nullable/CHECK-positive-
-- when-set shape (`null` means "no ceiling configured," not a fabricated default cap).
--
-- **Function signature change**: Postgres cannot `CREATE OR REPLACE` a function that gains
-- a new parameter (a genuinely different signature, not just a body change) -- same
-- "drop and recreate" precedent
-- `20260912120000_core_try_consume_usage_counter_soft_limits.sql` already established for
-- exactly this situation. The one existing caller
-- (`packages/core/src/admin/platform-ai-feature-policies.ts`'s `updateAiFeaturePolicy()`)
-- is updated in the same commit to pass the new argument.
alter table platform.ai_feature_policies
  add column monthly_budget_usd numeric(12, 2)
    check (monthly_budget_usd is null or monthly_budget_usd > 0);

drop function platform.update_ai_feature_policies(boolean, text[], text[], integer, numeric, numeric, text);

create function platform.update_ai_feature_policies(
  p_ai_enabled boolean,
  p_allowed_providers text[],
  p_allowed_models text[],
  p_max_tokens_per_run integer,
  p_max_run_cost_usd numeric,
  p_daily_platform_budget_usd numeric,
  p_monthly_budget_usd numeric,
  p_reason text
)
returns platform.ai_feature_policies
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_prev platform.ai_feature_policies;
  v_row platform.ai_feature_policies;
  v_allowed_providers text[];
  v_allowed_models text[];
  v_provider text;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can change the AI feature policy.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to change the AI feature policy.';
  end if;

  v_allowed_providers := coalesce(p_allowed_providers, '{}');
  v_allowed_models := coalesce(p_allowed_models, '{}');

  foreach v_provider in array v_allowed_providers loop
    if not exists (select 1 from platform.ai_providers where provider = v_provider) then
      raise exception 'Unknown AI provider in allowed_providers: %', v_provider;
    end if;
  end loop;

  select * into v_prev from platform.ai_feature_policies where id = true for update;

  update platform.ai_feature_policies
  set ai_enabled = p_ai_enabled,
      allowed_providers = v_allowed_providers,
      allowed_models = v_allowed_models,
      max_tokens_per_run = p_max_tokens_per_run,
      max_run_cost_usd = p_max_run_cost_usd,
      daily_platform_budget_usd = p_daily_platform_budget_usd,
      monthly_budget_usd = p_monthly_budget_usd,
      updated_by = auth.uid(),
      updated_at = now()
  where id = true
  returning * into v_row;

  insert into platform.ai_feature_policy_events (previous_value, new_value, reason, performed_by)
  values (to_jsonb(v_prev), to_jsonb(v_row), btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.update_ai_feature_policies(boolean, text[], text[], integer, numeric, numeric, numeric, text) from public, anon;
grant execute on function platform.update_ai_feature_policies(boolean, text[], text[], integer, numeric, numeric, numeric, text) to authenticated;
