-- DISC-OFFER-P0-10.2 "Persistent Pipeline Stage Model" -- DISC-OFFER-P0-10.1 already
-- built the current-state row (`discovery.pipeline_stages`: status/started_at/
-- completed_at/failed_at/error/last_ai_run_id) but every retry *overwrote* the previous
-- attempt's own failed_at/error in place -- exactly the "silently destroying history"
-- this story's own explicit line calls out. This migration adds the three fields 10.2
-- itself names (version/input_version/output_version) to that current-state row, and a
-- new append-only `pipeline_stage_runs` table that records every individual execution
-- attempt as its own permanent row -- the same "current value on the live row, full
-- history on its own append-only table" pattern this schema already uses for
-- `products.product_profile` vs. nothing (no history kept there) contrasted with
-- `discovery.prospect_scores` (a real history table) vs. `prospects.fit_score` (the
-- current value) -- prospect_scores is the closer precedent here.
--
-- `version` is a plain per-stage attempt counter (1 for the first run, incremented on
-- every subsequent run/retry) -- not yet the richer "ICP v1/v2/v3 with full content
-- snapshots" DISC-OFFER-P0-14.2's own "Versioned Stage Results" describes; that story
-- owns snapshotting a stage's actual *output content* (e.g. the ICP's own field values
-- at each version), a distinct, larger concern from this story's own "don't overwrite
-- the stage's own execution history" -- 14.2 can be built on top of the version numbers
-- this migration introduces without this table needing to change shape again.
-- `input_version`/`output_version` are the doc's own named fields, included now
-- (schema-first, the same precedent DISC-OFFER-P0-01.1 already set by widening
-- `products.status` ahead of 01.3 needing the third value) -- left nullable and
-- unpopulated with real cross-stage lineage until DISC-OFFER-P0-11.3's own "Stage
-- Dependency Graph" gives them something real to point at; recording a stage's own bare
-- attempt number in the meantime would be redundant with `version` itself.
alter table discovery.pipeline_stages
  add column version integer not null default 0,
  add column input_version integer,
  add column output_version integer;

-- Every past attempt at a stage, exactly as it finished -- a real answer to "what
-- happened the last three times this stage ran," which the current-state row alone
-- (10.1) cannot answer once a retry overwrites it. Only terminal outcomes are recorded
-- here (completed/failed/skipped) -- an in-progress "running" state has nothing to
-- preserve yet; `discovery.pipeline_stages` itself is still the source of truth for "is
-- this stage running right now."
create table discovery.pipeline_stage_runs (
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
  version integer not null,
  status text not null check (status in ('completed', 'failed', 'skipped')),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  error text,
  created_at timestamptz not null default now(),
  unique (workspace_id, stage_key, version)
);

-- No separate (workspace_id, stage_key) index: the unique constraint above already
-- leads with those two columns, so it already serves a "list this stage's history"
-- lookup via its own leftmost prefix -- the same reasoning already applied to
-- `pipeline_stages`' own unique constraint in the prior migration.
alter table discovery.pipeline_stage_runs enable row level security;

-- Same tenant-AND-licensed pattern as every other workspace-scoped table. Select and
-- insert only -- a recorded attempt is permanent (no update/delete), the same
-- append-only treatment `discovery.prospect_scores`/`discovery.signals` already
-- established for their own history rows.
create policy "members can view pipeline stage runs in their workspaces"
  on discovery.pipeline_stage_runs for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create pipeline stage runs in their workspaces"
  on discovery.pipeline_stage_runs for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
