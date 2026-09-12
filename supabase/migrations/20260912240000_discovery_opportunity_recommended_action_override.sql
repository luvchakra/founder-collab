-- DISC-OFFER-P0-15.1 "Final Human Action Gate" -- the doc's own worked example shows an
-- "[Edit Recommendation]" button alongside "[Send to CRM]"/"[Watch]"/"[Dismiss]" on a
-- single Top Opportunity decision card. The latter three already map directly onto
-- real, existing mechanisms (`setOpportunityStatus`, `promoteProspectToCrm`) with
-- nothing new to add; "Edit Recommendation" had no equivalent anywhere -- 07.1's own
-- `recommended_action` is purely a system-computed value, freely overwritten every time
-- `computeNextBestAction` reruns, with no way for a founder to pick a different next
-- step that then *stays* picked. That gap is exactly Automation Safety's (§25) own
-- "must NOT... silently overwrite user-approved values" -- a founder's manual choice
-- here must survive the next recomputation, not be clobbered by it.
--
-- A separate `recommended_action_override` column, not a repurposed
-- `recommended_action` (which stays the system's own freely-recomputed guess, unchanged
-- by this migration) -- the same "which column is non-null says which one produced it,
-- no separate flag to drift out of sync" pattern DISC-OFFER-P0-14.2 already established
-- for the ICP's own `source` distinction, applied here via column identity instead of an
-- extra field since there are only ever two possibilities and one already has its own
-- column. See `effectiveRecommendedAction` (next-best-action.ts) for the read-side
-- precedence every UI surface reads through instead of `recommended_action` directly.
-- Same closed seven-value vocabulary as `recommended_action` itself
-- (`opportunities_recommended_action_check`, DISC-OFFER-P0-07.1) -- a founder can only
-- ever choose from the same real next-step vocabulary the system itself can recommend,
-- not free text.
alter table discovery.opportunities
  add column recommended_action_override text
  check (recommended_action_override is null or recommended_action_override in (
    'research_more', 'find_better_contact', 'draft_message', 'send_to_crm', 'watch', 'wait', 'dismiss'
  ));
