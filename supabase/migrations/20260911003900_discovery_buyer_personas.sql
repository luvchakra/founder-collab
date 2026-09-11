-- DISC-OFFER-P0-02.3: "Offering Buyer Persona Definition" -- a genuinely new entity (no
-- existing table/concept covers this; confirmed by grepping for "persona" across
-- lib/components/prompts and every prior migration). Personas belong to the *offering*,
-- i.e. its workspace (ADR-4's discovery tenant boundary), same as icp_profiles --
-- but unlike icp_profiles this is one-to-many: an offering can have several buyer
-- personas (e.g. "CISO -- executive buyer", "IAM Director -- decision maker"), so
-- workspace_id is a plain foreign key here, not unique.
create table discovery.buyer_personas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  title text not null,
  role_in_committee text not null default 'other' check (
    role_in_committee in ('executive_buyer', 'decision_maker', 'influencer', 'budget_stakeholder', 'user', 'other')
  ),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger buyer_personas_set_updated_at
  before update on discovery.buyer_personas
  for each row execute function discovery.set_updated_at();

alter table discovery.buyer_personas enable row level security;

-- Same four-policy pattern as every other workspace-scoped table (product_knowledge,
-- prospect_discovery_locks) against discovery.user_workspace_ids() -- see that
-- function's own comment (line ~388 above) for why it's SECURITY DEFINER.
create policy "members can view buyer personas in their workspaces"
  on discovery.buyer_personas for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create buyer personas in their workspaces"
  on discovery.buyer_personas for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can update buyer personas in their workspaces"
  on discovery.buyer_personas for update
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can delete buyer personas in their workspaces"
  on discovery.buyer_personas for delete
  using (workspace_id in (select discovery.user_workspace_ids()));
