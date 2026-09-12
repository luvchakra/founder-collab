-- PLATFORM-P0-03.5: "Preview Before Publish" (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
-- §7). "Global branding changes should not become active merely because a field was
-- edited" -- until now (03.1/03.3), saving the branding form wrote straight to the live
-- columns every public/consuming surface reads. This adds an unpublished-draft side
-- channel on the same singleton row so Edit and Publish become two separate steps.
--
-- Deliberately one JSONB column, not ~16 mirrored `draft_*` columns for every existing
-- field: the draft is always written by the application after passing through the exact
-- same `platformBrandingInputSchema` Zod validation the live columns' own writer uses
-- (packages/core/src/admin/platform-branding.ts), so Postgres-level per-field CHECK
-- constraints would be redundant defense for a value the app never lets through
-- unvalidated -- unlike the live columns, which (per 03.1's own reasoning) get their own
-- CHECKs as defense-in-depth against a write that bypasses the app entirely (e.g. a
-- future direct-SQL tool). A draft is inherently a "not yet real" holding area, not a
-- second authoritative source of truth needing the same guarantees.
--
-- No new RLS policy: `platform.branding`'s existing "superadmins can view/update platform
-- branding" policies (PLATFORM-P0-03.1) are row-level, not column-level, so they already
-- cover these new columns on the one existing row -- confirmed by re-reading those
-- policies' `using`/`with check` clauses, which reference no column list at all.
alter table platform.branding
  add column draft_data jsonb,
  add column draft_updated_by uuid references auth.users (id) on delete set null,
  add column draft_updated_at timestamptz;

comment on column platform.branding.draft_data is
  'Unpublished PlatformBrandingInput snapshot (PLATFORM-P0-03.5). Null when there is no '
  'pending draft. Copied into the live columns (and cleared) by publishBrandingDraft(); '
  'never read by any public-facing surface -- only getPlatformBranding()/preview.';
