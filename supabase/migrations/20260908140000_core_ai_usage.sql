-- Epic 6, story S-4: `core.ai_runs` + `core.ai_provider_credentials` -- so any future
-- non-discovery module that calls an LLM can log usage and hold a BYOK credential
-- through one shared, `core`-owned path (00-MASTER-PLAN.md §6: "all modules bill AI
-- usage through one path"), instead of each module reinventing its own copy of
-- `discovery.ai_runs`/`ai_provider_credentials`.
--
-- Same decision this platform already made once for `core.messages` (S-3): the backlog
-- line reads "promote ai_runs/ai_provider_credentials/usage_events to core" as if
-- discovery's own tables should be migrated in place. They are not. Two real problems
-- with that:
--
-- 1. `discovery.ai_runs`/`ai_provider_credentials` are `workspace_id`/`account_id`-keyed
--    (discovery's own tenancy grain, ADR-4) -- CLAUDE.md's own non-negotiable says
--    `business_id` is the operational tenant for every other module (fsm/inventory/crm/
--    gst). Forcing `business_id` onto a working, tested, workspace-scoped usage ledger
--    (with its own cache-lookup index keyed on `workspace_id`) for zero current benefit
--    -- no other module calls an LLM at all yet, confirmed by grep across every module
--    package -- is exactly the kind of change CLAUDE.md principle 10 says not to make
--    without an explicit reason. Discovery keeps billing through its own existing path,
--    completely untouched.
-- 2. `usage_events` does not exist anywhere in this codebase or its migrations --
--    confirmed by grep. It is aspirational text in `00-MASTER-PLAN.md` §5/§6 only, never
--    actually built by any prior story. There is nothing to promote, and inventing a
--    schema for it now with no real caller would be exactly the "speculative
--    functionality" CLAUDE.md's development principles say not to build. Not created
--    here; flagged as a live-source discrepancy rather than silently reconciled.
--
-- New tables instead, forward-only: any module that starts calling an LLM writes here
-- going forward. `packages/core/src/ai-usage/{types,queries,mutations}.ts` is the one
-- shared TS path (mirrors `packages/core/src/messages/*` from S-3). Reuses
-- `packages/core/src/crypto/api-key.ts` (AES-256-GCM) for the credential's own secret
-- column -- already shared infrastructure, not duplicated.

create table core.ai_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  operation text not null,
  model text not null,
  provider text,
  prompt_version text not null,
  input_hash text not null,
  input_tokens integer,
  output_tokens integer,
  estimated_cost numeric(10, 6),
  duration_ms integer,
  search_count integer,
  status text not null default 'succeeded' check (status in ('succeeded', 'failed')),
  error_code text,
  created_at timestamptz not null default now()
);

create index ai_runs_business_id_idx on core.ai_runs (business_id);
create index ai_runs_cache_lookup_idx
  on core.ai_runs (business_id, operation, input_hash)
  where status = 'succeeded';

-- One connected BYOK AI provider per business (mirrors discovery.ai_provider_credentials'
-- own one-per-account shape, at the business grain instead). encrypted_api_key is
-- application-level ciphertext -- RLS does not by itself protect a column from
-- application code, so only a module's own internal credential lookup should ever
-- select it, same caveat discovery's own copy of this table already documents.
create table core.ai_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'google')),
  encrypted_api_key text not null,
  key_fingerprint text not null,
  status text not null default 'connected' check (status in ('connected', 'error')),
  last_validated_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id)
);

create index ai_provider_credentials_business_id_idx on core.ai_provider_credentials (business_id);

create trigger ai_provider_credentials_set_updated_at
  before update on core.ai_provider_credentials
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant-only (`business_id in core.user_business_ids()`), no
-- license gate on either table, mirroring `core.messages`' own S-3 reasoning (also
-- mirroring discovery.ai_runs/ai_provider_credentials' own RLS, which has no permission
-- gate either): this is cross-module infrastructure, not a licensed module's own
-- feature -- whichever module actually calls an LLM enforces its own license at the
-- route/action layer before ever reaching this table. `core.ai_runs` is append-only
-- from the app (view + insert, never update/delete), same as discovery's own copy.
-- ---------------------------------------------------------------------------

alter table core.ai_runs enable row level security;
alter table core.ai_provider_credentials enable row level security;

create policy "business members can view their ai runs"
  on core.ai_runs for select
  using (business_id in (select core.user_business_ids()));
create policy "business members can create ai runs"
  on core.ai_runs for insert
  with check (business_id in (select core.user_business_ids()));

create policy "business members can view their ai provider credential"
  on core.ai_provider_credentials for select
  using (business_id in (select core.user_business_ids()));
create policy "business members can create their ai provider credential"
  on core.ai_provider_credentials for insert
  with check (business_id in (select core.user_business_ids()));
create policy "business members can update their ai provider credential"
  on core.ai_provider_credentials for update
  using (business_id in (select core.user_business_ids()));
create policy "business members can delete their ai provider credential"
  on core.ai_provider_credentials for delete
  using (business_id in (select core.user_business_ids()));

-- No explicit grant needed -- `20260907120000_grant_schema_privileges.sql`'s own
-- `alter default privileges in schema core` already covers any new table created here,
-- same as `core.messages`/`threads`/`message_templates` (S-3) relied on.
