-- DISC-OFFER-P0-14.1 "Discovery Run History" -- the doc's own field list (run_id/
-- offering_id/started_at/completed_at/trigger/starting_stage/status/"AI provider/model
-- where applicable"/"stages executed"/errors/user edits), plus "Reuse existing Core AI
-- run/audit mechanisms where appropriate."
--
-- Checked the entity-ownership map (`docs/plan/00-MASTER-PLAN.md` §5) and this schema's
-- own existing tables first: `discovery.pipeline_stages` (DISC-OFFER-P0-10.1) is
-- *current* per-stage state, and `discovery.pipeline_stage_runs` (DISC-OFFER-P0-10.2) is
-- an append-only log of every individual *stage* attempt -- neither is "run history" in
-- this story's sense. 10.2's own migration comment says so explicitly ("not a run-history
-- log (that's DISC-OFFER-P0-14.1's own 'Discovery Run History' table)"), confirming this
-- is genuinely new rather than a parallel of something already listed. A "run" here is
-- one client-driven walk through some contiguous suffix of the fourteen technical stages
-- (`run-ai-discovery-panel.tsx`'s own `runFrom()`, one HTTP request per stage -- see that
-- route's own comment for why), triggered either by the main "Run AI Discovery" CTA
-- (DISC-OFFER-P0-10.1), a per-group "Retry" on a failed stage (DISC-OFFER-P0-10.3), or the
-- auto-resume after "Save & Run Downstream" on an edited stage (DISC-OFFER-P0-11.1/11.2) --
-- one row per such walk, not one row per technical stage attempt (that's still
-- `pipeline_stage_runs`' own job).
--
-- `offering_id` (the doc's own literal field name) is `workspace_id` here, matching every
-- sibling pipeline table -- `discovery.workspaces` is 1:1 with `products` (the "Business
-- Offering" entity, DISC-OFFER-P0-01.1) via `workspaces.product_id`, and `workspace_id` is
-- this module's own tenant key (ADR-4's discovery exception), not a separate concept.
--
-- `trigger`/`starting_stage`/`status` are the doc's own named fields; `error` captures the
-- terminal failure that actually stopped the walk (the client's own loop breaks on the
-- first stage that doesn't succeed), for a quick "what happened" summary without joining
-- out to `pipeline_stage_runs`. "AI provider/model where applicable" and "user edits" are
-- deliberately NOT columns on this table: the AI provider/model actually used is already
-- fully captured, per underlying operation, in `discovery.ai_runs` (DISC-OFFER-P0-10.1's
-- own precedent already logs there) -- duplicating it here would drift the moment a stage
-- handler's own AI call details change; a run's own query layer instead derives it by
-- reading `discovery.ai_runs` rows whose `created_at` falls inside `[started_at,
-- completed_at]` for the same `workspace_id` (see `lib/ai/usage.ts`'s own
-- `listAiRunsInWindow`, added alongside this migration) -- "where applicable" naturally
-- reads as an empty list for a run that only executed deterministic stages, never a false
-- "no AI was used" claim manufactured by a stale duplicate column. "User edits" is
-- likewise not a separate log here: `trigger = 'save_and_run_downstream'` already *is* "a
-- user edit initiated this run" (11.1/11.2's own worked example), distinct from an
-- automation-initiated run -- the deeper "distinguish a user's edited field values from
-- the AI's own generated ones" is DISC-OFFER-P0-14.2's own explicit, later "Versioned
-- Stage Results" concern (its own acceptance line: "User edits and AI-generated changes
-- should be distinguishable"), not this story's.
--
-- "Stages executed" is not duplicated as an array/jsonb column either: `run_id` below
-- (added to `pipeline_stage_runs`) is the real, queryable link -- every technical stage
-- attempt made *during* this run is already its own permanent `pipeline_stage_runs` row
-- (10.2), so this run's own "stages executed" is simply "list pipeline_stage_runs where
-- run_id = this run's id", not a second, redundant record of the same fact.
create table discovery.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  trigger text not null check (
    trigger in ('run_ai_discovery_cta', 'retry_failed_stage', 'save_and_run_downstream')
  ),
  starting_stage text not null check (
    starting_stage in (
      'website_understanding', 'offering_profile', 'icp', 'buyer_personas',
      'discovery_strategy', 'account_discovery', 'signals', 'signal_correlation',
      'opportunity_scoring', 'why_now', 'research', 'buyer_intelligence',
      'recommended_action', 'crm_handoff'
    )
  ),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

-- "Most recent runs for this offering" is this table's own primary read pattern (a
-- History page/list) -- workspace_id alone has no unique constraint to piggyback on here
-- (unlike pipeline_stages/pipeline_stage_runs, which lead with workspace_id in their own
-- unique keys), so it gets its own explicit index, sorted to match that read directly.
create index pipeline_runs_workspace_id_started_at_idx
  on discovery.pipeline_runs (workspace_id, started_at desc);

alter table discovery.pipeline_runs enable row level security;

-- Same tenant-AND-licensed pattern as every other workspace-scoped table in this schema
-- (discovery.user_workspace_ids() already embeds the license check -- see that
-- function's own comment). Update (not just select/insert): unlike pipeline_stage_runs
-- (fully immutable, written once as a finished fact), a run row is created `running` and
-- later transitioned to `completed`/`failed` by the same request flow that started it --
-- the same select/insert/update-only shape (no delete) already established for
-- `discovery.pipeline_stages` itself.
create policy "members can view pipeline runs in their workspaces"
  on discovery.pipeline_runs for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create pipeline runs in their workspaces"
  on discovery.pipeline_runs for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can update pipeline runs in their workspaces"
  on discovery.pipeline_runs for update
  using (workspace_id in (select discovery.user_workspace_ids()));

-- The real link between a run and the technical stage attempts it actually drove --
-- nullable because a stage can still be run/retried directly with no enclosing "run" row
-- (e.g. this migration shipping before any run has ever started, or the client's own
-- "start run" call failing transiently -- the pipeline itself must keep working even if
-- run-history bookkeeping doesn't, the same "never let a logging failure break the
-- caller's actual result" principle `recordAiRun` already established for `ai_runs`).
alter table discovery.pipeline_stage_runs
  add column run_id uuid references discovery.pipeline_runs (id);

-- Not covered by any existing unique constraint's leftmost prefix (those all lead with
-- workspace_id/stage_key), so it needs its own index for "stages executed during this
-- run" to be a real index lookup rather than a sequential scan.
create index pipeline_stage_runs_run_id_idx on discovery.pipeline_stage_runs (run_id);
