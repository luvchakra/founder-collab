-- DISC-OFFER-P0-05.3: "Multi-Signal Correlation" -- checked existing tables first.
-- Buying signals only existed as free-text strings (`prospect_research.buying_signals`/
-- `recent_events`, both text[]) with no stable identity, so a correlation could never
-- honestly satisfy the story's own "correlation must retain supporting signal IDs"
-- acceptance criterion -- there was nothing with an id to retain. Genuinely new entity:
-- one atomic, addressable, time-stamped fact about a prospect, distinct from
-- `prospect_research` itself (a single research summary row) and from
-- `discovery_definitions.desired_signals`/`excluded_signals` (a definition's own
-- free-text *matching criteria*, not an observed fact about a specific prospect).
create table discovery.signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  prospect_id uuid not null references discovery.prospects (id) on delete cascade,
  signal_type text not null check (signal_type in ('buying_signal', 'recent_event')),
  description text not null,
  source text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Upsert-only sync target (see lib/signals/mutations.ts#syncSignalsFromResearch):
  -- re-syncing after a refreshed research pass must never delete or duplicate a
  -- previously observed fact, only add genuinely new ones.
  unique (prospect_id, signal_type, description)
);

create index signals_workspace_id_idx on discovery.signals (workspace_id);
create index signals_prospect_id_idx on discovery.signals (prospect_id);

alter table discovery.signals enable row level security;

-- select + insert only, no update/delete -- same append-only shape as
-- discovery.prospect_scores: a signal is an observed fact, sync is upsert-by-natural-key
-- (never an edit to an existing row's own content), against discovery.user_workspace_ids().
create policy "members can view signals in their workspaces"
  on discovery.signals for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create signals in their workspaces"
  on discovery.signals for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
