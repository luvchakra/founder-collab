-- DISC-OFFER-P0-06.2: "Offering Research Brief" -- the doc's own field list
-- (Company/Offering Fit/Why Them/Why Now/Likely Buyer/Buying Committee/Problem
-- Hypothesis/Evidence/Potential Objection/Suggested Opening/Recommended Action/
-- Confidence) is mostly satisfied by fields that already exist elsewhere and are
-- referenced, not regenerated here: Company = `prospects.company_name`/`description`;
-- Why Now = `opportunities.why_now` (05.4); Evidence = `prospect_research.evidence`
-- (06.1); Recommended Action = `opportunities.recommended_action` (owned by 07.1, not
-- this story); Likely Buyer/Buying Committee = a deterministic match over
-- `discovery.contacts` x `discovery.buyer_personas` (no storage needed -- see
-- lib/research-briefs/match-committee.ts -- "do not invent people or roles" is
-- structural, not a prompt instruction, since no AI call is involved in this part at
-- all). What's genuinely new: `offering_fit` (also written back into an existing
-- opportunity's own `why_them`, mirroring how 05.4 wrote `why_now`), `problem_hypothesis`,
-- `potential_objection`, `suggested_opening`, and a confidence distinct from any of
-- `prospect_research`/`opportunities`' own confidence fields -- this brief's own
-- overall confidence in its synthesis. One row per prospect, upsertable like
-- `prospect_research` (a re-generated brief replaces the last one, not versioned here --
-- DISC-OFFER-P0-14.2 "Versioned Stage Results" is the later story that formalizes
-- versioning for the full pipeline).
create table discovery.research_briefs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  prospect_id uuid not null unique references discovery.prospects (id) on delete cascade,
  offering_fit text not null,
  problem_hypothesis text not null,
  potential_objection text not null,
  suggested_opening text not null,
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  generated_at timestamptz not null default now()
);

create index research_briefs_workspace_id_idx on discovery.research_briefs (workspace_id);

alter table discovery.research_briefs enable row level security;

-- Same select/insert/update shape as discovery.prospect_research (also a 1:1-per-
-- prospect synthesis that gets upserted on regeneration, not append-only).
create policy "members can view research briefs in their workspaces"
  on discovery.research_briefs for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create research briefs in their workspaces"
  on discovery.research_briefs for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can update research briefs in their workspaces"
  on discovery.research_briefs for update
  using (workspace_id in (select discovery.user_workspace_ids()));
