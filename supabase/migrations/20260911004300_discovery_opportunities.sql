-- DISC-OFFER-P0-05.1: "Discovery Opportunity Model" -- checked existing tables first
-- (prospects/prospect_scores/prospect_research) before creating this one. None of them
-- fit: `prospects.status` (new/qualified/disqualified) is a persistent company
-- qualification state, one row per company per offering's workspace -- it cannot
-- represent "a company can have separate opportunities for different offerings" in the
-- sense the backlog means (a single prospect re-evaluated by *different* discovery
-- definitions over time can surface multiple distinct, time-bound buying-signal
-- moments, each with its own lifecycle from 'new' through to 'sent_to_crm'/'expired').
-- That's a one-to-many relationship (one prospect, several opportunities across
-- definitions/time) prospects/prospect_scores/prospect_research -- all effectively
-- one-per-prospect -- can't express. Genuinely new entity.
create table discovery.opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  prospect_id uuid not null references discovery.prospects (id) on delete cascade,
  discovery_definition_id uuid references discovery.discovery_definitions (id) on delete set null,
  score integer check (score is null or (score >= 0 and score <= 100)),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  why_them text,
  why_now text,
  recommended_action text,
  confidence text not null default 'low' check (confidence in ('low', 'medium', 'high')),
  status text not null default 'new' check (
    status in ('new', 'reviewing', 'action_required', 'watching', 'sent_to_crm', 'dismissed', 'expired')
  ),
  evidence_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_evaluated_at timestamptz
);

create index opportunities_workspace_id_idx on discovery.opportunities (workspace_id);
create index opportunities_prospect_id_idx on discovery.opportunities (prospect_id);
create index opportunities_discovery_definition_id_idx on discovery.opportunities (discovery_definition_id);

create trigger opportunities_set_updated_at
  before update on discovery.opportunities
  for each row execute function discovery.set_updated_at();

alter table discovery.opportunities enable row level security;

create policy "members can view opportunities in their workspaces"
  on discovery.opportunities for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create opportunities in their workspaces"
  on discovery.opportunities for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can update opportunities in their workspaces"
  on discovery.opportunities for update
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can delete opportunities in their workspaces"
  on discovery.opportunities for delete
  using (workspace_id in (select discovery.user_workspace_ids()));
