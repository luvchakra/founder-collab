-- DISC-OFFER-P1-04.1 "Learn From User Edits" -- the doc's own worked example ("AI: Target
-- industry = Retail / User: Target industry = Banking") plus "Store this as structured
-- offering feedback." Checked `00-MASTER-PLAN.md` §5 first: no "feedback"/"correction"
-- concept listed for any module, so this is a genuinely new table, not a duplicate of
-- anything.
--
-- Scoped to the ICP alone, the one entity in this module today whose version history
-- (`icp_profile_versions`, DISC-OFFER-P0-14.2) already tags every snapshot
-- `ai_generated`/`user_edit` -- a real, already-computed signal for "the AI wrote this, a
-- human then changed it," not something requiring new instrumentation elsewhere first. A
-- future story adding a second correctable entity (offering profile, buyer personas...)
-- can widen this table's shape then, against a second real case, rather than guessing at
-- one now (CLAUDE.md dev principle #7 -- no speculative functionality).
--
-- A real foreign key (`icp_id`), not a speculative polymorphic `source_table`/`source_id`
-- pair -- the ICP is the only correctable entity that exists right now. Append-only (no
-- update/delete), the same "history of facts, never rewritten" precedent
-- `icp_profile_versions`/`pipeline_stage_runs`/`discovery.signals` already established --
-- a recorded correction is a fact about what happened, not a live row to edit in place.
create table discovery.offering_feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  icp_id uuid not null references discovery.icp_profiles (id) on delete cascade,
  -- Closed vocabulary, not open-ended free text -- mirrors the exact fourteen content
  -- columns `icp_profiles`/`icp_profile_versions` share (excludes `status`/`confidence`/
  -- `evidence`/`version`, which describe the AI's own confidence or workflow state, not a
  -- value a founder corrects). Kept in sync by hand with `ICP_CONTENT_FIELDS`
  -- (`lib/offerings/offering-feedback.ts`) -- the same "two things must stay in sync by
  -- hand" precedent already accepted for `icp_profiles`/`icp_profile_versions`' own
  -- identical column shape.
  field_name text not null check (
    field_name in (
      'name', 'description', 'industries', 'company_sizes', 'geographies', 'roles',
      'pain_points', 'buying_signals', 'exclusions', 'revenue', 'business_model',
      'technology', 'growth_stage', 'existing_tools'
    )
  ),
  -- jsonb, not text -- ICP fields mix plain strings (name/description) and string arrays
  -- (every other field); jsonb stores either faithfully without this table needing to
  -- know which shape a given `field_name` holds. Both nullable: a field can genuinely be
  -- null/empty on either side of a correction (e.g. a description the AI never filled in
  -- at all, which a founder then wrote for the first time).
  ai_value jsonb,
  user_value jsonb,
  created_at timestamptz not null default now()
);

-- No natural composite unique constraint here (unlike `icp_profile_versions`' own
-- `(workspace_id, version)`) -- a given ICP field can be corrected more than once over
-- its lifetime, and each correction is its own row. Both foreign keys indexed explicitly
-- from the start, the same discipline every sibling table in this schema follows.
create index offering_feedback_workspace_id_idx on discovery.offering_feedback (workspace_id);
create index offering_feedback_icp_id_idx on discovery.offering_feedback (icp_id);

alter table discovery.offering_feedback enable row level security;

-- Same tenant-AND-licensed pattern as every other workspace-scoped table. Select and
-- insert only -- a recorded correction is permanent, matching every other append-only
-- history table in this schema.
create policy "members can view offering feedback in their workspaces"
  on discovery.offering_feedback for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create offering feedback in their workspaces"
  on discovery.offering_feedback for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
