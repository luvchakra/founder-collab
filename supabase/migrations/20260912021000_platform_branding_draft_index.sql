-- PLATFORM-P0-03.5 follow-up: `mcp__Supabase__get_advisors` (performance) flagged
-- `branding_draft_updated_by_fkey` (added by 20260912020000_platform_branding_draft.sql)
-- as an unindexed foreign key immediately after that migration was applied live -- the
-- same class of finding `branding_updated_by_idx` (PLATFORM-P0-03.1) already covers for
-- the live `updated_by` column, just missed for `draft_updated_by` when the draft
-- migration was written. Appended as its own migration rather than editing the earlier
-- file, matching this workstream's own established practice (PLATFORM-P0-03.4's grant
-- fix) of keeping the timeline append-only and each fix visible as its own step.
create index branding_draft_updated_by_idx on platform.branding (draft_updated_by);
