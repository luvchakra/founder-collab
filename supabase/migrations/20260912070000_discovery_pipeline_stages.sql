-- DISC-OFFER-P0-10.1 "Run AI Discovery CTA" -- "Every stage has a persisted status" /
-- "User can leave and return" / "Completed stages remain available" / "Failed stages
-- can be retried" only actually hold with a real, per-offering row per stage, not
-- component-only state that vanishes on reload (the same reasoning
-- discovery.website_onboarding_runs, 09.1, already established for that pipeline).
--
-- One row per (workspace_id, stage_key): this is *current* stage state for the offering,
-- not a run-history log (that's DISC-OFFER-P0-14.1's own "Discovery Run History" table)
-- and not yet versioned (DISC-OFFER-P0-10.2's own explicit "Reruns create new versions
-- rather than silently destroying history" -- 10.1's own acceptance criteria only ever
-- asks for "retried", never "versioned", so the version/input_version/output_version
-- columns 10.2 names are deliberately deferred to that story rather than spliced in here
-- ahead of it being built, matching CLAUDE.md dev principle #7).
--
-- stage_key is the doc's own exact fourteen-stage list (§14's pipeline diagram / 10.2's
-- own "Create persistent stage state" list). status is the doc's own exact six-state
-- vocabulary. last_ai_run_id is a soft reference into discovery.ai_runs (on delete set
-- null, same treatment as every other soft reference already established in this schema
-- -- discovery_definition_id, icp_id, signal_correlation_id) for whichever stage
-- actually made an AI call; left null for a stage handler that turned out to need no AI
-- call this time (e.g. nothing left to discover) or one whose logic is deterministic by
-- design (CLAUDE.md dev principle #4).
create table discovery.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  stage_key text not null check (
    stage_key in (
      'website_understanding', 'offering_profile', 'icp', 'buyer_personas',
      'discovery_strategy', 'account_discovery', 'signals', 'signal_correlation',
      'opportunity_scoring', 'why_now', 'research', 'buyer_intelligence',
      'recommended_action', 'crm_handoff'
    )
  ),
  status text not null default 'not_started' check (
    status in ('not_started', 'running', 'completed', 'failed', 'needs_review', 'skipped')
  ),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error text,
  last_ai_run_id uuid references discovery.ai_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, stage_key)
);

-- The (workspace_id, stage_key) unique index above already covers workspace_id-only
-- lookups (leftmost-prefix), so no separate single-column index is needed for that FK --
-- same reasoning already double-checked via get_advisors for every other table this run.
-- last_ai_run_id's own FK does need its own index (it isn't a prefix of any other one).
create index pipeline_stages_last_ai_run_id_idx on discovery.pipeline_stages (last_ai_run_id);

create trigger pipeline_stages_set_updated_at
  before update on discovery.pipeline_stages
  for each row execute function discovery.set_updated_at();

alter table discovery.pipeline_stages enable row level security;

-- Same four-policy pattern as every other workspace-scoped table in this schema against
-- discovery.user_workspace_ids() (tenant AND licensed, since that function already
-- embeds the license check via user_product_ids() -- see its own comment, ~line 388 of
-- 20260906100000_discovery_schema.sql). No delete policy: stage state is reset by
-- overwriting its status/timestamps in place (a retry), never by removing the row --
-- every stage key always has exactly one row once seeded.
create policy "members can view pipeline stages in their workspaces"
  on discovery.pipeline_stages for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create pipeline stages in their workspaces"
  on discovery.pipeline_stages for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can update pipeline stages in their workspaces"
  on discovery.pipeline_stages for update
  using (workspace_id in (select discovery.user_workspace_ids()));
