-- DISC-OFFER-P0-05.5: "Negative Signals" -- the doc's own closed set of nine reasons
-- that reduce opportunity quality. Distinct from `discovery.signals` (05.3, positive
-- buying-intent facts, append-only/no-update since each is an observed event) and from
-- `discovery_definitions.disqualifiers` (a definition's own free-text *matching
-- criteria*, never evaluated against a specific prospect anywhere in the code today).
-- Negative signals are the opposite of `signals`' own shape: a *current assessment* of
-- why a prospect may be a poor fit, re-evaluated and refreshed as new information
-- arrives (an industry mismatch found last week is still true today; a "recent
-- rejection" is current until the relationship changes) -- so this table gets the
-- standard four-policy select/insert/update/delete pattern (buyer_personas,
-- discovery_definitions, opportunities), not the append-only shape `signals` uses.
create table discovery.negative_signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  prospect_id uuid not null references discovery.prospects (id) on delete cascade,
  reason text not null check (
    reason in (
      'wrong_industry', 'wrong_size', 'wrong_geography', 'no_relevant_problem',
      'known_incompatible_solution', 'recent_rejection', 'no_buyer',
      'existing_active_relationship', 'insufficient_evidence'
    )
  ),
  detail text,
  -- 'auto' rows are owned by `syncNegativeSignalsForProspect` (lib/negative-signals/mutations.ts)
  -- and are freely upserted/removed as re-evaluation warrants; 'manual' rows (the two
  -- reasons this module cannot yet detect on its own -- see that file's own comment) are
  -- never touched by the automated sync.
  source text not null default 'auto' check (source in ('auto', 'manual')),
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- One current assessment per reason per prospect -- re-detecting the same reason
  -- refreshes this row rather than accumulating duplicates.
  unique (prospect_id, reason)
);

create index negative_signals_workspace_id_idx on discovery.negative_signals (workspace_id);
create index negative_signals_prospect_id_idx on discovery.negative_signals (prospect_id);

alter table discovery.negative_signals enable row level security;

create policy "members can view negative signals in their workspaces"
  on discovery.negative_signals for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create negative signals in their workspaces"
  on discovery.negative_signals for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can update negative signals in their workspaces"
  on discovery.negative_signals for update
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can delete negative signals in their workspaces"
  on discovery.negative_signals for delete
  using (workspace_id in (select discovery.user_workspace_ids()));
