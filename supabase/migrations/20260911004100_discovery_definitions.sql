-- DISC-OFFER-P0-04.1: "Discovery Definition" -- a genuinely new entity: what to watch
-- for and how, distinct from icp_profiles (who to target) and buyer_personas (who's on
-- the buying committee). One-to-many against the offering's workspace, same as
-- buyer_personas -- "multiple definitions per offering" is an explicit acceptance
-- criterion (e.g. one definition watching for "Recently Funded" signals, another for
-- "Hiring Relevant Roles"). icp_id is a soft reference to the ICP this definition was
-- built against at creation time (nullable, set null on delete) -- not a hard dependency,
-- since a definition should keep working (per ADR-10's "no hard cross-entity coupling
-- that breaks on the other side's deletion") even if that ICP is later removed/replaced.
create table discovery.discovery_definitions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  icp_id uuid references discovery.icp_profiles (id) on delete set null,
  name text not null,
  target_geographies text[] not null default '{}',
  target_industries text[] not null default '{}',
  buyer_roles text[] not null default '{}',
  desired_signals text[] not null default '{}',
  excluded_signals text[] not null default '{}',
  disqualifiers text[] not null default '{}',
  minimum_score integer check (minimum_score is null or (minimum_score >= 0 and minimum_score <= 100)),
  monitoring_frequency text not null default 'weekly' check (monitoring_frequency in ('daily', 'weekly', 'monthly', 'manual')),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index discovery_definitions_workspace_id_idx on discovery.discovery_definitions (workspace_id);

create trigger discovery_definitions_set_updated_at
  before update on discovery.discovery_definitions
  for each row execute function discovery.set_updated_at();

alter table discovery.discovery_definitions enable row level security;

create policy "members can view discovery definitions in their workspaces"
  on discovery.discovery_definitions for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create discovery definitions in their workspaces"
  on discovery.discovery_definitions for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can update discovery definitions in their workspaces"
  on discovery.discovery_definitions for update
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can delete discovery definitions in their workspaces"
  on discovery.discovery_definitions for delete
  using (workspace_id in (select discovery.user_workspace_ids()));
