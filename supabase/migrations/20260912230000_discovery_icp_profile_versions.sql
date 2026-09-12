-- DISC-OFFER-P0-14.2 "Versioned Stage Results" -- the doc's own worked example is
-- literally "ICP v1 / ICP v2 / ICP v3", "Current version is clearly identified", and
-- "User edits and AI-generated changes should be distinguishable". DISC-OFFER-P0-10.2's
-- own `pipeline_stages.version`/`pipeline_stage_runs` already version each *pipeline
-- stage attempt* (an execution counter, incremented only when the "icp" pipeline stage
-- runs via `runIcpStage`), but that is a distinct, narrower concept from this story's
-- own concern -- see that migration's own comment, which already anticipated this one
-- ("14.2 owns snapshotting a stage's actual output *content*... without this table
-- needing to change shape again"). Today, a founder's manual "Save changes" on the ICP
-- page (`updateIcpProfile`) and a manual "Regenerate" (`generateIcp`, also callable
-- outside the pipeline via the ICP page's own button) both silently overwrite the ICP
-- row in place with no record of what the ICP looked like before -- exactly the
-- "silently overwrite prior results" this story exists to close, and neither of those
-- write paths runs through `pipeline_stages` at all (a manual Save/Regenerate on the ICP
-- page never touches that table), so this needed its own version counter on
-- `icp_profiles` itself rather than reusing the pipeline stage's own `version` column.
--
-- Scoped to the ICP alone, matching the doc's own single worked example -- the same
-- "scope to the doc's one worked example, flag the rest explicitly" call
-- DISC-OFFER-P0-11.1 already made for "Editable Pipeline Stages" (a near-identical
-- problem shape). Offering Profile, Buyer Personas and Discovery Strategy each have
-- their own real overwrite exposure too (an offering-profile "Regenerate" replaces
-- `products.product_profile` in place with no history at all), but extending this same
-- treatment to them is left for a future story to build on this table's own pattern,
-- not implied by this one's scope (CLAUDE.md dev principle #7 -- no speculative
-- functionality). Buyer personas and discovery strategy are lower-risk in the meantime:
-- `seedBuyerPersonasFromIcp`/`seedDiscoveryDefinitionFromIcp` (DISC-OFFER-P0-10.1) only
-- ever add or skip, never overwrite existing content, so neither actually loses data
-- today the way ICP regeneration/manual-save do.
alter table discovery.icp_profiles
  add column version integer not null default 0;

-- One immutable snapshot per version an ICP has ever held -- "ICP v1/v2/v3", browsable
-- after the fact, the same "current value on the live row, full history on its own
-- append-only table" pattern `discovery.pipeline_stage_runs` (10.2) and
-- `discovery.prospect_scores` already established in this schema. `icp_profiles.version`
-- (above) is always the *current* version number -- "current version is clearly
-- identified" by reading the live row directly, with no separate "is_current" flag to
-- ever drift out of sync with it.
--
-- `source` is the doc's own explicit "user edits and AI-generated changes should be
-- distinguishable" -- a closed two-value vocabulary (not open-ended free text), mirroring
-- the same closed-enum discipline `pipeline_runs.trigger` (14.1) already established for
-- a comparable "which of a few known things caused this" field. `ai_generated` covers
-- `generateIcp()` (a fresh AI draft, whether from the ICP page's "Generate"/"Regenerate"
-- or the AI Discovery pipeline's own "icp" stage); `user_edit` covers both a founder's
-- manual "Save changes" (`updateIcpProfile`) and cloning another offering's ICP onto this
-- one (`cloneIcpProfileToWorkspace`) -- a clone is a human-initiated action copying
-- already-authored content rather than a new AI generation, so it reads as the human side
-- of this binary rather than a third value the doc never asked for. Approving an ICP
-- (`approveIcpProfile`) changes no field this table snapshots (only `status`), so it does
-- not create a new version -- nothing about approval is at risk of being "silently
-- overwritten".
--
-- Snapshotted columns mirror `icp_profiles` itself exactly (same types/defaults) rather
-- than a jsonb blob, so a version row can be rendered with the exact same field-by-field
-- UI the live ICP form already uses.
create table discovery.icp_profile_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references discovery.workspaces (id) on delete cascade,
  icp_id uuid not null references discovery.icp_profiles (id) on delete cascade,
  version integer not null,
  source text not null check (source in ('ai_generated', 'user_edit')),
  name text not null,
  description text,
  industries text[] not null default '{}',
  company_sizes text[] not null default '{}',
  geographies text[] not null default '{}',
  roles text[] not null default '{}',
  pain_points text[] not null default '{}',
  buying_signals text[] not null default '{}',
  exclusions text[] not null default '{}',
  revenue text[] not null default '{}',
  business_model text[] not null default '{}',
  technology text[] not null default '{}',
  growth_stage text[] not null default '{}',
  existing_tools text[] not null default '{}',
  confidence numeric check (confidence >= 0 and confidence <= 1),
  evidence text[] not null default '{}',
  status text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, version)
);

-- `icp_id` has no leftmost-prefix coverage from the unique constraint above (which leads
-- with `workspace_id`), unlike `pipeline_stage_runs`' own `(workspace_id, stage_key,
-- version)` -- indexed explicitly, same "both FKs indexed from the start" discipline
-- every sibling table in this schema follows.
create index icp_profile_versions_icp_id_idx on discovery.icp_profile_versions (icp_id);

alter table discovery.icp_profile_versions enable row level security;

-- Same tenant-AND-licensed pattern as every other workspace-scoped table. Select and
-- insert only -- a recorded version is permanent (no update/delete), the same
-- append-only treatment `discovery.pipeline_stage_runs`/`discovery.prospect_scores`
-- already established for their own history rows.
create policy "members can view icp profile versions in their workspaces"
  on discovery.icp_profile_versions for select
  using (workspace_id in (select discovery.user_workspace_ids()));
create policy "members can create icp profile versions in their workspaces"
  on discovery.icp_profile_versions for insert
  with check (workspace_id in (select discovery.user_workspace_ids()));
