-- PLATFORM-P0-09.3 ("Provider Routing", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §13)
-- -- CONFIG-ONLY, per the user's explicit decision recorded in this run's own audit-log
-- entry (docs/design/platform-admin-portal-audit.md, "PLATFORM-P0-09.3 -- Provider Routing
-- (config-only)"), resolving the prior run's stop-and-report on this exact story.
--
-- **What this migration is, and is not**: a new, audited `platform.*` config surface
-- recording WonderArc's *intent* for how AI calls should eventually be routed -- a
-- platform-wide default provider/model, a `ModuleKey -> AiProvider` override map, and a
-- platform-wide fallback provider. It is NOT runtime wiring: no code anywhere in this
-- codebase reads this table to make a real routing decision yet. `packages/core/src/ai/
-- business-router.ts`, `operation-registry.ts`, `model-registry.ts`'s resolution logic, and
-- `packages/module-discovery`'s own separate router are all untouched by this story --
-- exactly as they were left untouched by PLATFORM-P0-09.1/09.2. The prior stopped entry's
-- own "Two readings of Provider Routing" analysis is still the reference for *why* actually
-- wiring this into the live call chain (BYOK precedence, failover semantics, module-vs-
-- operation granularity, missing-key fallback behavior) is a separate, later story: none of
-- those algorithm questions are answered here, and none needed to be, because this story
-- builds no code path that would need to answer them.
--
-- **Entity-ownership check (CLAUDE.md non-negotiable #5)**: genuinely new concept, not a
-- duplicate of `platform.ai_providers` (per-provider registry: is this provider enabled,
-- which models, its own default/fallback model) or `core.ai_provider_credentials`/
-- `discovery.ai_provider_credentials` (per-tenant BYOK). This table is the one thing neither
-- of those is: a single, platform-wide *routing policy* describing which provider a given
-- module's AI calls should prefer, and what to fall back to -- `platform` schema, per
-- CLAUDE.md non-negotiable #1's carve-out (control-plane data, never tenant data, never
-- gated by `core.licenses`).
--
-- **Singleton by construction**, same "boolean PK fixed to true" trick `platform.branding`
-- already established: there is exactly one platform-wide routing policy, never a list of
-- them. Seeded once below; there is no `create_ai_provider_routing()`/insert path and no
-- delete path anywhere in this migration, so the row count can never drift from 1.
--
-- **`default_provider`/`fallback_provider` are nullable, unlike `platform.ai_providers`'
-- own NOT NULL primary key column** -- deliberately: seeding a non-null "the platform's
-- default AI provider is X" the moment this table starts existing, before any SUPERADMIN
-- has actually decided that, would be exactly the kind of fabricated state PLATFORM-P0-09.1
-- itself avoided by seeding every provider `enabled = false` rather than guessing one
-- "on". Both are validated (in the function below, not a table CHECK, since a CHECK
-- constraint cannot look up another table's rows) to reference a real
-- `platform.ai_providers.provider` when set, but that provider does NOT need a configured
-- key or `enabled = true` -- this table records routing *intent*, not a live-readiness
-- check, per this story's own explicit brief. A plain FK (nullable-safe: a FK constraint
-- only fires on a non-null value) gives the same guarantee at the schema level too, as a
-- second, redundant-on-purpose safety net beneath the function's own friendlier error.
--
-- **`module_overrides` is a single `jsonb` map (`ModuleKey -> AiProvider`), not a normalized
-- child table** -- there are at most five entries ever (one per `core.modules.key`, the
-- same closed catalog `packages/module-registry/src/index.ts`'s `ModuleKey` union mirrors),
-- there is no independent per-row lifecycle (a module either has an override or it
-- doesn't -- no per-row enabled/timestamps/audit of its own), and the whole map is always
-- read and written as one unit by a single audited function, the same "opaque JSONB is
-- correct when nothing needs per-row structure" reasoning `platform.ai_providers.
-- rate_limits`/`cost_controls` already used. Unlike those two columns, this one is *not*
-- opaque to validation: every key must be a real `core.modules.key` and every value a real
-- `platform.ai_providers.provider`, enforced by the function below (again, a table CHECK
-- cannot express a cross-table lookup).
--
-- **`default_model` has no cross-table containment check** (unlike `platform.ai_providers.
-- default_model`, which must appear in that same row's own `models` array) -- because this
-- column is a platform-wide override independent of any single provider's own configured
-- model list, and because the referenced `default_provider` may legitimately have zero
-- models configured yet (routing intent can be recorded before a provider is fully set
-- up). Same "config describing intent, not a live-readiness check" reasoning as the
-- provider-existence checks above.
--
-- **Audited-mutation pattern, mirroring `platform.ai_providers`/`platform.feature_flags`
-- exactly**: no INSERT/UPDATE/DELETE grant to `authenticated` at all -- every change goes
-- through `platform.update_ai_provider_routing()`, which requires a genuine SUPERADMIN and
-- a non-empty `reason`, and writes one atomic audit-trail row.
--
-- **A dedicated `platform.ai_provider_routing_events` table, not a reuse of `platform.
-- ai_provider_events`** -- considered and rejected: that table's `provider` column is
-- `not null` and its `action` CHECK enumerates four *per-provider* actions
-- (`config_updated`/`key_set`/`key_rotated`/`key_removed`); a routing-policy change is not
-- about any single provider (it can touch `default_provider`, `fallback_provider`, and
-- several `module_overrides` entries -- each naming a different provider -- in one write),
-- so forcing it into that table would mean either a fabricated sentinel `provider` value or
-- widening that table's own CHECK/nullability for a genuinely different kind of event. A
-- dedicated table keeps both audit trails honest about what they actually record. It also
-- has no `action` column at all (unlike its sibling) -- there is exactly one kind of event
-- this table will ever record (the singleton row's config changed), so a column that could
-- only ever hold one value would be speculative structure, not deferred scope (CLAUDE.md
-- development principle #7).
create table platform.ai_provider_routing (
  id boolean primary key default true check (id),

  default_provider text references platform.ai_providers (provider),
  default_model text,

  module_overrides jsonb not null default '{}'::jsonb,

  fallback_provider text references platform.ai_providers (provider),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index ai_provider_routing_updated_by_idx on platform.ai_provider_routing (updated_by);

insert into platform.ai_provider_routing (id) values (true);

create table platform.ai_provider_routing_events (
  id uuid primary key default gen_random_uuid(),
  previous_value jsonb not null,
  new_value jsonb not null,
  reason text not null check (btrim(reason) <> ''),
  performed_by uuid references auth.users (id) on delete set null,
  performed_at timestamptz not null default now()
);

create index ai_provider_routing_events_performed_by_idx on platform.ai_provider_routing_events (performed_by);

alter table platform.ai_provider_routing enable row level security;
alter table platform.ai_provider_routing_events enable row level security;

-- SELECT open to any authenticated user, same "avoid a second widening migration later"
-- reasoning `platform.ai_providers`/`platform.modules` already used in advance: whatever
-- future story actually wires a routing consumer will most likely run as an ordinary
-- signed-in business member's own request, not exclusively a SUPERADMIN, and will need to
-- read this policy the same way. Nothing secret lives on this table. No INSERT/UPDATE/
-- DELETE grant to `authenticated` at all -- every mutation goes through
-- `update_ai_provider_routing()` below.
create policy "authenticated users can view the ai provider routing policy" on platform.ai_provider_routing
  for select to authenticated
  using (true);

grant select on platform.ai_provider_routing to authenticated;
grant all on platform.ai_provider_routing to service_role;

-- Sensitive operational history, same trust level `platform.ai_provider_events`/
-- `platform.feature_flag_events` already established -- SUPERADMIN-only SELECT, no direct
-- write grant to `authenticated` at all.
create policy "superadmins can view ai provider routing events" on platform.ai_provider_routing_events
  for select to authenticated
  using (platform.is_superadmin());

grant select on platform.ai_provider_routing_events to authenticated;
grant all on platform.ai_provider_routing_events to service_role;

create function platform.update_ai_provider_routing(
  p_default_provider text,
  p_default_model text,
  p_module_overrides jsonb,
  p_fallback_provider text,
  p_reason text
)
returns platform.ai_provider_routing
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_prev platform.ai_provider_routing;
  v_row platform.ai_provider_routing;
  v_module_overrides jsonb;
  v_key text;
  v_value text;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can change the AI provider routing policy.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to change the AI provider routing policy.';
  end if;

  v_module_overrides := coalesce(p_module_overrides, '{}'::jsonb);
  if jsonb_typeof(v_module_overrides) is distinct from 'object' then
    raise exception 'module_overrides must be a JSON object mapping module key to AI provider.';
  end if;

  if p_default_provider is not null and not exists (
    select 1 from platform.ai_providers where provider = p_default_provider
  ) then
    raise exception 'Unknown AI provider for default_provider: %', p_default_provider;
  end if;
  if p_fallback_provider is not null and not exists (
    select 1 from platform.ai_providers where provider = p_fallback_provider
  ) then
    raise exception 'Unknown AI provider for fallback_provider: %', p_fallback_provider;
  end if;

  for v_key, v_value in select * from jsonb_each_text(v_module_overrides) loop
    if not exists (select 1 from core.modules where key = v_key) then
      raise exception 'Unknown module key in module_overrides: %', v_key;
    end if;
    if not exists (select 1 from platform.ai_providers where provider = v_value) then
      raise exception 'Unknown AI provider in module_overrides for module %: %', v_key, v_value;
    end if;
  end loop;

  select * into v_prev from platform.ai_provider_routing where id = true for update;

  update platform.ai_provider_routing
  set default_provider = p_default_provider,
      default_model = p_default_model,
      module_overrides = v_module_overrides,
      fallback_provider = p_fallback_provider,
      updated_by = auth.uid(),
      updated_at = now()
  where id = true
  returning * into v_row;

  insert into platform.ai_provider_routing_events (previous_value, new_value, reason, performed_by)
  values (to_jsonb(v_prev), to_jsonb(v_row), btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.update_ai_provider_routing(text, text, jsonb, text, text) from public, anon;
grant execute on function platform.update_ai_provider_routing(text, text, jsonb, text, text) to authenticated;
