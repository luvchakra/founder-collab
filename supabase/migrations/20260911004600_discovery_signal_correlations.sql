-- DISC-OFFER-P0-05.3: "Multi-Signal Correlation" -- the correlated read itself, distinct
-- from the atomic `discovery.signals` facts it groups (previous migration). Append-only
-- like `prospect_scores` (no `updated_at`/trigger): a correlation is the record of one
-- correlation run at a point in time ("time context"), not a live-edited summary --
-- re-running correlation for the same prospect creates a new row rather than overwriting
-- the old one, so history is never silently lost (§25's "silently erase previous stage
-- versions" applies here even though this predates the full pipeline in §29 Phase E).
create table discovery.signal_correlations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  prospect_id uuid not null references discovery.prospects (id) on delete cascade,
  -- "supporting signal IDs" (doc's own wording) -- not a join table, since a correlation
  -- is read far more often than written and the set is small/fixed once computed.
  signal_ids uuid[] not null check (array_length(signal_ids, 1) > 0),
  rationale text not null,
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  earliest_signal_at timestamptz not null,
  latest_signal_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index signal_correlations_workspace_id_idx on discovery.signal_correlations (workspace_id);
create index signal_correlations_prospect_id_idx on discovery.signal_correlations (prospect_id);

alter table discovery.signal_correlations enable row level security;

-- select + insert only, no update/delete -- same append-only shape as
-- discovery.prospect_scores (a rescore is a new row, never an edit to an old one).
create policy "members can view signal correlations in their workspaces"
  on discovery.signal_correlations for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create signal correlations in their workspaces"
  on discovery.signal_correlations for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));

-- Soft reference from the opportunity a correlation supports back to the correlation
-- itself -- same "on delete set null" treatment as opportunities.discovery_definition_id
-- (05.1) and discovery_definitions.icp_id (04.1): an opportunity survives its supporting
-- correlation being deleted rather than being cascaded away with it.
alter table discovery.opportunities
  add column signal_correlation_id uuid references discovery.signal_correlations (id) on delete set null;

create index opportunities_signal_correlation_id_idx on discovery.opportunities (signal_correlation_id);
