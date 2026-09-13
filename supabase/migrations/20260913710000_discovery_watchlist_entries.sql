-- DISC-OFFER-P1 §7-01.3 "Account Watchlist" -- checked the entity-ownership map and the
-- existing discovery schema first: no "watchlist" concept exists anywhere yet (grepped
-- the whole repo). Genuinely new entity: a founder's own deliberate "keep an eye on this
-- one" flag on a specific prospect, distinct from `opportunities.status = 'watching'`
-- (an opportunity-instance lifecycle state, tied to one buying-signal moment) -- a
-- prospect can be worth watching generally even with no open opportunity at all.
--
-- "current score" and "last signal" (the doc's own listed fields) are deliberately NOT
-- columns here: `prospects.fit_score` and `discovery.signals` (ordered by
-- `observed_at`) already hold those facts, and nothing in this codebase has an
-- unattended process that could keep a duplicated copy here fresh (DISC-OFFER-P1
-- §7-01.2 "Continuous Monitoring" is blocked -- see the audit log -- precisely because
-- no such process exists). Storing a second, static copy would silently go stale the
-- first time the live value changed, so both are read live at query time instead (see
-- `lib/watchlist/queries.ts`).
--
-- "Same account can be watched differently for different offerings" (the doc's own
-- acceptance note) falls out of the existing model for free: `discovery.prospects` is
-- already workspace-scoped (one workspace = one offering, ADR-4), so the same
-- real-world company already exists as a *separate* prospect row per offering it's
-- tracked under. Watching one of those rows is inherently offering-specific; no extra
-- column or join is needed to express "differently per offering."
create table discovery.watchlist_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  prospect_id uuid not null references discovery.prospects (id) on delete cascade,
  watch_reason text not null,
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One active watch entry per account per offering -- re-adding an already-watched
  -- prospect edits the existing entry (see `addToWatchlist`'s upsert), never duplicates.
  unique (workspace_id, prospect_id)
);

create index watchlist_entries_workspace_id_idx on discovery.watchlist_entries (workspace_id);
create index watchlist_entries_prospect_id_idx on discovery.watchlist_entries (prospect_id);

create trigger watchlist_entries_set_updated_at
  before update on discovery.watchlist_entries
  for each row execute function discovery.set_updated_at();

alter table discovery.watchlist_entries enable row level security;

create policy "members can view watchlist entries in their workspaces"
  on discovery.watchlist_entries for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create watchlist entries in their workspaces"
  on discovery.watchlist_entries for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can update watchlist entries in their workspaces"
  on discovery.watchlist_entries for update
  using (workspace_id in (select discovery.user_workspace_ids()))
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can delete watchlist entries in their workspaces"
  on discovery.watchlist_entries for delete
  using (workspace_id in (select discovery.user_workspace_ids()));
