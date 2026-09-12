-- PLATFORM-P0-09.1/09.2 ("Internal AI Provider Registry" / "Secure API Key Storage",
-- docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §13). Combined into one migration/story the
-- same way 08.1-08.4 were: a provider registry and its own key storage are one cohesive
-- artifact here, not two independent concepts built in sequence -- you cannot sensibly
-- "manage" a provider (09.1) without also deciding how the credential that makes it usable
-- is protected (09.2).
--
-- **Entity-ownership check (CLAUDE.md non-negotiable #5) -- genuinely distinct from every
-- existing AI-credential table**: `discovery.ai_provider_credentials` and
-- `core.ai_provider_credentials` are per-tenant BYOK (Bring Your Own Key) -- one business's
-- own connected key, tenant-RLS-scoped, used only for that business's own AI calls.
-- PLATFORM-P0-02.2's own dashboard entry already flagged this distinction in advance: "the
-- one category with a narrower real signal (per-business BYOK ai_provider_credentials)
-- surfaces that count... explicitly labeled as *not* the platform-wide provider registry
-- PLATFORM-P0-09 will add." This migration is that platform-wide registry: WonderArc's own
-- provider configuration and its own platform-level credentials (used as the fallback the
-- platform itself bills when a business has no BYOK key connected, or by any module-side
-- call that isn't tenant-billed at all) -- never a business's data, never gated by
-- `core.licenses`, hence `platform` schema (CLAUDE.md non-negotiable #1's carve-out).
--
-- **Reused, not reinvented, secret-at-rest pattern**: `packages/core/src/crypto/api-key.ts`
-- (AES-256-GCM, `API_KEY_ENCRYPTION_SECRET`) is already shared, platform-wide infrastructure
-- -- built for BYOK, explicitly re-documented in its own file header as reusable by "any
-- caller with its own text column," and already reused as-is by `module-gst`'s GSP
-- credentials (2026-09-09). This migration is the third caller, not a fresh design.
-- `encryptApiKey`/`decryptApiKey`/`fingerprintApiKey` stay exactly as they are -- no new
-- crypto code, no Supabase Vault/pgsodium (this codebase's own established convention, per
-- that file's own header comment, is one consistent application-level scheme for every
-- secret, not a mix of storage mechanisms).
--
-- **Lockdown goes further than BYOK's own two tables, matching `gst`'s own stricter fix
-- instead**: `core.ai_provider_credentials`/`discovery.ai_provider_credentials` grant
-- `authenticated` a SELECT policy on the *whole row*, `encrypted_api_key` column included --
-- safe there only because the account/business member reading it is the same tenant the key
-- belongs to, and no query in this codebase ever actually selects that column back to a
-- browser. `gst.eway_bill_credentials`/`einvoice_credentials` went further after
-- docs/testing/EXECUTION-2026-09-08.md finding 3: no SELECT grant to `authenticated` on the
-- credentials table at all, full stop, with a separate SECURITY DEFINER status function
-- that never selects the secret column. This run's own task brief sets an explicitly higher
-- bar for this section ("never store a real secret... anywhere a normal `select *` could
-- expose it"), and a platform-level key protects every tenant on the platform at once, not
-- one tenant's own data -- so `platform.ai_provider_keys` (below) follows `gst`'s own
-- stricter shape: zero SELECT grant to `authenticated`, not even for a genuine SUPERADMIN.
-- The only way to learn *whether* a key is configured, and its masked fingerprint, is
-- `platform.ai_provider_key_status()`, a SECURITY DEFINER function that never selects
-- `encrypted_api_key` -- nobody, including a SUPERADMIN, can ever read a platform provider
-- key's ciphertext back out through this schema. The actual AI-calling router (a future,
-- separate story -- see the "deliberately not built this story" note in
-- `platform-ai-providers.ts`) will read it only via a service-role/admin client, the same
-- way `packages/core/src/ai/business-router.ts` already does for BYOK.
--
-- **A fixed, seeded catalog, not an open create/delete surface -- mirrors
-- `platform.modules`' own precedent (PLATFORM-P0-07.1)**: `AiProvider` (`packages/core/src/
-- ai/model-registry.ts`) is a closed TS union (`"openai" | "anthropic" | "google"`) --
-- adding a fourth provider needs real code (a model registry entry, a provider-factory
-- branch, a test-connection endpoint) that does not exist yet, so accepting an arbitrary
-- provider string here would let a SUPERADMIN configure a "provider" nothing can ever route
-- to. Doc text naming "Other future providers" is aspirational, not a request to build an
-- open-ended registry now (CLAUDE.md development principle #7). Same shape
-- `platform.modules` already chose for its own fixed, code-defined catalog (core.modules'
-- five keys, seeded once, never created/deleted by an admin function): three rows are
-- seeded here, matching model-registry.ts's own three providers exactly, and there is no
-- `create_ai_provider()`/`delete_ai_provider()` function anywhere in this migration.
--
-- **Why every mutation goes through a SECURITY DEFINER function, unlike `platform.modules`'
-- own plain RLS-gated `.update()`**: PLATFORM-P0-16.2 explicitly names "AI key changes" as a
-- mandatory high-risk audit item, and this run's own task brief sets a higher security bar
-- for this section specifically. Extending that same audited-write discipline to the
-- registry's own config (enabled/models/rate limits/cost controls), not only the key
-- material, matches `platform.feature_flags`' own reasoning (08.1-08.4: "every change," not
-- only the sensitive half) rather than `platform.modules`' narrower, not-yet-audited
-- columns -- this config directly controls real spend and which third party a platform-wide
-- credential is sent to, exactly the class of change 16.2 calls out. So neither
-- `platform.ai_providers` nor `platform.ai_provider_keys` gets any direct INSERT/UPDATE/
-- DELETE grant to `authenticated` at all; every write requires a non-empty `reason` and
-- writes one atomic `platform.ai_provider_events` row, the same shape
-- `create_feature_flag()`/`update_feature_flag()`/`delete_feature_flag()` already
-- established.
--
-- **The audit trail never carries key material, not even ciphertext**: a key mutation's
-- `previous_value`/`new_value` are hand-built with `jsonb_build_object('key_fingerprint',
-- ...)` -- never `to_jsonb(row)` -- so `encrypted_api_key` is structurally impossible to
-- leak into `platform.ai_provider_events` even though that table's own SELECT is already
-- superadmin-only. Config-only mutations (`update_ai_provider_config`) touch no secret
-- column at all, so `to_jsonb(row)` is safe there, mirroring `feature_flags`' own snapshot
-- shape exactly.
--
-- **`rate_limits`/`cost_controls` are opaque JSONB, not typed columns**: §13's own text
-- names "rate limits" and "cost controls" with no units, fields, or granularity specified,
-- and no consumer enforces either yet (PLATFORM-P0-10, "AI Safety / Cost Controls," is the
-- later, separate story that gives platform-wide budget enforcement a real shape -- see
-- below). Same reasoning `gst.tax_rules.value` already used for its own underspecified
-- config ("opaque jsonb... next story's job to give some of that jsonb shape a name, not
-- this one's to guess ahead of time") -- inventing specific numeric fields/units now would
-- be a guess this migration has no authority to make, not a deferral of real scope.
--
-- **Deliberately distinct from PLATFORM-P0-10.1's own future "Platform AI Budget"**: that
-- story configures daily/monthly/per-business/per-feature budgets with real circuit-breaker
-- enforcement (§14) -- a materially bigger, cross-cutting concern than one provider's own
-- `cost_controls` knob. Nothing here builds or guesses at that shape; §13's own "AI Feature
-- Policies" (09.4, its own separate future story in this run) is the next, narrower piece in
-- this doc's own section order.
create table platform.ai_providers (
  provider text primary key check (provider in ('openai', 'anthropic', 'google')),

  enabled boolean not null default false,
  models text[] not null default '{}',
  default_model text,
  fallback_model text,
  check (default_model is null or default_model = any (models)),
  check (fallback_model is null or fallback_model = any (models)),

  -- Opaque, forward-declared config -- see this migration's own header comment for why.
  rate_limits jsonb not null default '{}'::jsonb,
  cost_controls jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index ai_providers_updated_by_idx on platform.ai_providers (updated_by);

-- Seed: one row per model-registry.ts's own three known providers, every default left
-- as-is (disabled, no models configured) -- mirrors platform.modules' own "cross-schema
-- seed from a fixed, code-defined catalog" shape. No SUPERADMIN has configured anything yet,
-- so `enabled` defaults false here (unlike platform.modules' `enabled default true`) --
-- there is no existing behavior to preserve for a brand-new, never-before-configured
-- provider, and defaulting an unconfigured (no key, no model) provider to "enabled" would
-- be a fabricated "on" state, not a safe default.
insert into platform.ai_providers (provider) values ('openai'), ('anthropic'), ('google');

-- Secret storage -- see this migration's own header comment for the full lockdown
-- reasoning. One row per provider, present only once a SUPERADMIN has actually configured a
-- key (no seed row here, unlike platform.ai_providers itself).
create table platform.ai_provider_keys (
  provider text primary key references platform.ai_providers (provider) on delete cascade,

  encrypted_api_key text not null,
  key_fingerprint text not null,
  -- Not nullable: the application layer only ever calls `set_ai_provider_key()` after
  -- `testProviderConnection()` (packages/core/src/ai-providers/test-connection.ts,
  -- already-shared infrastructure) confirms the key actually works, mirroring BYOK's own
  -- `connectAiProvider()` -- "a rejected key is never persisted." Unlike
  -- `core.ai_provider_credentials`/`discovery.ai_provider_credentials`, there is no
  -- `status`/`last_error` pair here: those exist there to support a *stored* 'error' state
  -- from a later re-validation flow neither this story nor any consumer builds -- a column
  -- no code would ever write is exactly the speculative shape CLAUDE.md development
  -- principle #7 rules out. If a real re-validation feature is ever built, it can add that
  -- pair then.
  last_validated_at timestamptz not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index ai_provider_keys_updated_by_idx on platform.ai_provider_keys (updated_by);

-- Append-only audit trail for both tables -- see this migration's own header comment for
-- why key mutations' JSONB snapshots are hand-built (fingerprint only), never `to_jsonb(row)`.
create table platform.ai_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  action text not null check (action in ('config_updated', 'key_set', 'key_rotated', 'key_removed')),
  previous_value jsonb,
  new_value jsonb,
  reason text not null check (btrim(reason) <> ''),
  performed_by uuid references auth.users (id) on delete set null,
  performed_at timestamptz not null default now()
);

create index ai_provider_events_provider_idx on platform.ai_provider_events (provider);
create index ai_provider_events_performed_by_idx on platform.ai_provider_events (performed_by);

alter table platform.ai_providers enable row level security;
alter table platform.ai_provider_keys enable row level security;
alter table platform.ai_provider_events enable row level security;

-- SELECT open to any authenticated user, same "avoid a second widening migration" reasoning
-- platform.modules/platform.feature_flags already used in advance: a future routing
-- consumer (PLATFORM-P0-09.3) runs as an ordinary signed-in business member, not a
-- SUPERADMIN, and will need to read `enabled`/`models`/`default_model`/`fallback_model` the
-- same way. No secret lives on this table at all -- see platform.ai_provider_keys for that.
-- No INSERT/UPDATE/DELETE grant to `authenticated` -- every mutation goes through
-- `update_ai_provider_config()` below.
create policy "authenticated users can view the ai provider registry" on platform.ai_providers
  for select to authenticated
  using (true);

grant select on platform.ai_providers to authenticated;
grant all on platform.ai_providers to service_role;

-- No SELECT/INSERT/UPDATE/DELETE policy or grant to `authenticated` at all -- deliberately,
-- the entire point of this table (see the migration's own header comment). Only
-- `service_role` (the future AI-calling router, not built this story) and the SECURITY
-- DEFINER functions below (which run with the function owner's privileges, not the caller's)
-- can ever touch a row here.
grant all on platform.ai_provider_keys to service_role;

-- Sensitive operational history, same trust level platform.feature_flag_events/
-- platform.module_status_events already established -- SUPERADMIN-only SELECT, no direct
-- write grant to `authenticated` at all.
create policy "superadmins can view ai provider events" on platform.ai_provider_events
  for select to authenticated
  using (platform.is_superadmin());

grant select on platform.ai_provider_events to authenticated;
grant all on platform.ai_provider_events to service_role;

create function platform.update_ai_provider_config(
  p_provider text,
  p_enabled boolean,
  p_models text[],
  p_default_model text,
  p_fallback_model text,
  p_rate_limits jsonb,
  p_cost_controls jsonb,
  p_reason text
)
returns platform.ai_providers
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_prev platform.ai_providers;
  v_row platform.ai_providers;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can change the AI provider registry.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to change an AI provider''s configuration.';
  end if;

  select * into v_prev from platform.ai_providers where provider = p_provider for update;
  if not found then
    raise exception 'Unknown AI provider: %', p_provider;
  end if;

  update platform.ai_providers
  set enabled = p_enabled,
      models = coalesce(p_models, '{}'),
      default_model = p_default_model,
      fallback_model = p_fallback_model,
      rate_limits = coalesce(p_rate_limits, '{}'::jsonb),
      cost_controls = coalesce(p_cost_controls, '{}'::jsonb),
      updated_by = auth.uid(),
      updated_at = now()
  where provider = p_provider
  returning * into v_row;

  insert into platform.ai_provider_events (provider, action, previous_value, new_value, reason, performed_by)
  values (p_provider, 'config_updated', to_jsonb(v_prev), to_jsonb(v_row), btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.update_ai_provider_config(text, boolean, text[], text, text, jsonb, jsonb, text) from public, anon;
grant execute on function platform.update_ai_provider_config(text, boolean, text[], text, text, jsonb, jsonb, text) to authenticated;

-- Sets (or rotates) a provider's key. `p_encrypted_api_key`/`p_key_fingerprint` arrive
-- already computed by the application layer (`encryptApiKey`/`fingerprintApiKey`,
-- node:crypto -- there is no pgcrypto equivalent call here, matching every other caller of
-- this same crypto module) -- the plaintext key itself never reaches Postgres, only its
-- ciphertext and a non-reversible fingerprint, so it can never appear in a WAL record, a
-- slow-query log, or this function's own arguments as seen by `pg_stat_activity`/audit
-- logging in plaintext form.
create function platform.set_ai_provider_key(
  p_provider text,
  p_encrypted_api_key text,
  p_key_fingerprint text,
  p_last_validated_at timestamptz,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_existing platform.ai_provider_keys;
  v_existed boolean;
  v_action text;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can set an AI provider key.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to set an AI provider key.';
  end if;
  if not exists (select 1 from platform.ai_providers where provider = p_provider) then
    raise exception 'Unknown AI provider: %', p_provider;
  end if;

  -- `v_existed` is captured into its own variable immediately -- PL/pgSQL's `FOUND` is
  -- overwritten by every subsequent statement that can set it (the upsert below included,
  -- which always affects a row), so reusing `found` again at the audit-insert below would
  -- silently read the upsert's own result instead of this SELECT's.
  select * into v_existing from platform.ai_provider_keys where provider = p_provider for update;
  v_existed := found;
  v_action := case when v_existed then 'key_rotated' else 'key_set' end;

  insert into platform.ai_provider_keys
    (provider, encrypted_api_key, key_fingerprint, last_validated_at, updated_by)
  values
    (p_provider, p_encrypted_api_key, p_key_fingerprint, p_last_validated_at, auth.uid())
  on conflict (provider) do update
  set encrypted_api_key = excluded.encrypted_api_key,
      key_fingerprint = excluded.key_fingerprint,
      last_validated_at = excluded.last_validated_at,
      updated_by = excluded.updated_by,
      updated_at = now();

  -- Fingerprint only -- see this migration's own header comment for why
  -- `encrypted_api_key` never appears in an audit snapshot.
  insert into platform.ai_provider_events (provider, action, previous_value, new_value, reason, performed_by)
  values (
    p_provider,
    v_action,
    case when v_existed then jsonb_build_object('key_fingerprint', v_existing.key_fingerprint) else null end,
    jsonb_build_object('key_fingerprint', p_key_fingerprint),
    btrim(p_reason),
    auth.uid()
  );
end;
$$;

revoke execute on function platform.set_ai_provider_key(text, text, text, timestamptz, text) from public, anon;
grant execute on function platform.set_ai_provider_key(text, text, text, timestamptz, text) to authenticated;

create function platform.remove_ai_provider_key(p_provider text, p_reason text)
returns void
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_existing platform.ai_provider_keys;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can remove an AI provider key.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to remove an AI provider key.';
  end if;

  select * into v_existing from platform.ai_provider_keys where provider = p_provider for update;
  if not found then
    raise exception 'No key is configured for AI provider: %', p_provider;
  end if;

  insert into platform.ai_provider_events (provider, action, previous_value, new_value, reason, performed_by)
  values (
    p_provider,
    'key_removed',
    jsonb_build_object('key_fingerprint', v_existing.key_fingerprint),
    null,
    btrim(p_reason),
    auth.uid()
  );

  delete from platform.ai_provider_keys where provider = p_provider;
end;
$$;

revoke execute on function platform.remove_ai_provider_key(text, text) from public, anon;
grant execute on function platform.remove_ai_provider_key(text, text) to authenticated;

-- The only read path for "is a key configured, and its masked fingerprint" -- see this
-- migration's own header comment for why nobody, including a genuine SUPERADMIN, can ever
-- select `encrypted_api_key` back out through any other path. SECURITY DEFINER so it can
-- read `platform.ai_provider_keys` at all (that table grants `authenticated` nothing);
-- restricted to SUPERADMIN internally anyway since no ordinary business member has any
-- reason to know whether the platform's own OpenAI credential is configured.
create function platform.ai_provider_key_status()
returns table (
  provider text,
  configured boolean,
  key_fingerprint text,
  last_validated_at timestamptz,
  key_updated_at timestamptz
)
language sql
stable
security definer
set search_path = platform
as $$
  select
    p.provider,
    (k.provider is not null) as configured,
    k.key_fingerprint,
    k.last_validated_at,
    k.updated_at as key_updated_at
  from platform.ai_providers p
  left join platform.ai_provider_keys k on k.provider = p.provider
  where platform.is_superadmin();
$$;

revoke execute on function platform.ai_provider_key_status() from public, anon;
grant execute on function platform.ai_provider_key_status() to authenticated;
