-- PLATFORM-P0-09.4 ("AI Feature Policies", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
-- §13) -- CONFIG-ONLY, the same scope PLATFORM-P0-09.3 (Provider Routing) was explicitly
-- decided to be: a platform-wide policy SUPERADMIN can set and see, with no runtime
-- enforcement wired anywhere yet. §13's own text for 09.4 is six flat fields with no
-- algorithm attached to any of them ("AI enabled / allowed providers / allowed models /
-- maximum tokens / maximum run cost / daily platform budget") -- unlike 09.3's own
-- Discovery/CRM/Compliance routing example, there is no worked example here implying a
-- specific enforcement algorithm this migration would have to invent, so this is not the
-- kind of genuine architectural ambiguity 09.3 stopped on. Real enforcement (pausing AI,
-- notifying SUPERADMIN when a threshold is exceeded) is explicitly PLATFORM-P0-10.1/10.2's
-- own later, separate section (§14, "AI Safety / Cost Controls") -- this migration lays the
-- policy down, the same "table now, real enforcement in a later story" sequencing
-- `platform.ai_providers.rate_limits`/`cost_controls` (PLATFORM-P0-09.1) and
-- `platform.modules.enabled` (PLATFORM-P0-07.1, wired by 07.2 later) both already used.
--
-- **No code anywhere reads this table to make a real decision yet** -- `ai_enabled` does
-- not gate any AI call path, `allowed_providers`/`allowed_models` are not checked before a
-- provider/model is used, and the token/cost/budget columns are not enforced against any
-- real run. `packages/core/src/ai/business-router.ts`, `operation-registry.ts`,
-- `model-registry.ts`, and `module-discovery`'s own router are all untouched, exactly as
-- PLATFORM-P0-09.1/09.2/09.3 already left them.
--
-- **Entity-ownership check (CLAUDE.md non-negotiable #5)**: genuinely new concept, not a
-- duplicate of `platform.ai_providers` (per-provider registry) or `platform.
-- ai_provider_routing` (which provider a module should prefer). This is the one thing
-- neither of those is: a platform-wide *ceiling* on AI usage/spend and which
-- providers/models are permitted at all, independent of routing preference.
--
-- **Singleton by construction**, same pattern `platform.branding`/`platform.
-- ai_provider_routing` already established: exactly one platform-wide policy, never a list.
--
-- **`allowed_providers` is validated against `platform.ai_providers.provider`, `allowed_models`
-- is not** -- `platform.ai_providers.provider` is the closed, real provider catalog (three
-- known values); `models` is itself just a free-text array on that same catalog with no
-- cross-provider validation of its own (see that migration's own reasoning), so there is no
-- narrower catalog for this table's `allowed_models` to validate against either -- same
-- "opaque, no consumer enforces it yet" treatment. An empty array in either column means "no
-- restriction configured yet," not "nothing is allowed" -- matches `platform.ai_providers`'
-- own "no models configured yet is a valid, honest state" precedent, not a fabricated
-- lockdown the moment this table starts existing.
--
-- **`max_run_cost_usd`/`daily_platform_budget_usd` are denominated in USD, not
-- `platform.plans.currency`'s own per-plan currency (which defaults to INR)** -- a
-- deliberate, narrow call: every one of the three real AI providers `platform.ai_providers`
-- already models (OpenAI, Anthropic, Google) bills WonderArc itself in USD regardless of
-- which currency any customer's own subscription plan is priced in, so a USD-denominated
-- platform AI spend ceiling is the only unit that maps onto a real invoice -- not an
-- assumption about customer-facing pricing at all. `max_tokens_per_run` is dimensionless
-- (a token count), so it carries no currency question.
--
-- **Audited-mutation pattern, mirroring `platform.ai_providers`/`platform.
-- ai_provider_routing` exactly**: no INSERT/UPDATE/DELETE grant to `authenticated` at all --
-- every change goes through `platform.update_ai_feature_policies()`, which requires a
-- genuine SUPERADMIN and a non-empty `reason`, and writes one atomic audit-trail row to a
-- dedicated `platform.ai_feature_policy_events` table (same "a routing/policy-wide change
-- doesn't belong in a per-provider audit table" reasoning `platform.ai_provider_routing`'s
-- own migration already used for its own dedicated events table -- and again, no `action`
-- column, since this table records exactly one kind of event).
create table platform.ai_feature_policies (
  id boolean primary key default true check (id),

  ai_enabled boolean not null default true,
  allowed_providers text[] not null default '{}',
  allowed_models text[] not null default '{}',

  max_tokens_per_run integer check (max_tokens_per_run is null or max_tokens_per_run > 0),
  max_run_cost_usd numeric(10, 4) check (max_run_cost_usd is null or max_run_cost_usd > 0),
  daily_platform_budget_usd numeric(12, 2) check (daily_platform_budget_usd is null or daily_platform_budget_usd > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index ai_feature_policies_updated_by_idx on platform.ai_feature_policies (updated_by);

-- Seed: AI features "on" (matches today's actual behavior -- there is no existing global AI
-- kill switch anywhere in this codebase, so defaulting to enabled preserves current
-- behavior the moment this table starts existing, same as `platform.modules.enabled`'s own
-- default-true reasoning), no provider/model restriction, and no token/cost/budget ceiling
-- -- nothing fabricated.
insert into platform.ai_feature_policies (id) values (true);

create table platform.ai_feature_policy_events (
  id uuid primary key default gen_random_uuid(),
  previous_value jsonb not null,
  new_value jsonb not null,
  reason text not null check (btrim(reason) <> ''),
  performed_by uuid references auth.users (id) on delete set null,
  performed_at timestamptz not null default now()
);

create index ai_feature_policy_events_performed_by_idx on platform.ai_feature_policy_events (performed_by);

alter table platform.ai_feature_policies enable row level security;
alter table platform.ai_feature_policy_events enable row level security;

-- SELECT open to any authenticated user, same "avoid a second widening migration later"
-- reasoning `platform.ai_provider_routing` already used: a future enforcement consumer
-- (PLATFORM-P0-10.1/10.2) will most likely need to read `ai_enabled`/the ceilings as an
-- ordinary signed-in business member's own request, not exclusively a SUPERADMIN. Nothing
-- secret lives on this table. No INSERT/UPDATE/DELETE grant to `authenticated` at all.
create policy "authenticated users can view the ai feature policy" on platform.ai_feature_policies
  for select to authenticated
  using (true);

grant select on platform.ai_feature_policies to authenticated;
grant all on platform.ai_feature_policies to service_role;

-- Sensitive operational history, same trust level every sibling `platform.*` audit table in
-- this backlog already established -- SUPERADMIN-only SELECT, no direct write grant at all.
create policy "superadmins can view ai feature policy events" on platform.ai_feature_policy_events
  for select to authenticated
  using (platform.is_superadmin());

grant select on platform.ai_feature_policy_events to authenticated;
grant all on platform.ai_feature_policy_events to service_role;

create function platform.update_ai_feature_policies(
  p_ai_enabled boolean,
  p_allowed_providers text[],
  p_allowed_models text[],
  p_max_tokens_per_run integer,
  p_max_run_cost_usd numeric,
  p_daily_platform_budget_usd numeric,
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
      updated_by = auth.uid(),
      updated_at = now()
  where id = true
  returning * into v_row;

  insert into platform.ai_feature_policy_events (previous_value, new_value, reason, performed_by)
  values (to_jsonb(v_prev), to_jsonb(v_row), btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.update_ai_feature_policies(boolean, text[], text[], integer, numeric, numeric, text) from public, anon;
grant execute on function platform.update_ai_feature_policies(boolean, text[], text[], integer, numeric, numeric, text) to authenticated;
