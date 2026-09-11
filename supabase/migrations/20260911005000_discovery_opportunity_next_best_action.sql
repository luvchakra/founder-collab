-- DISC-OFFER-P0-07.1: "Next Best Action" -- `recommended_action` (05.1) was left as a
-- free-text placeholder for this story to define. Constrains it to the doc's own
-- seven-item closed vocabulary now that a real rule (`computeNextBestAction`) produces
-- it, the same way `status`/`confidence`/`priority` are already constrained on this
-- table. `discovery.opportunities` has no live callers writing `recommended_action`
-- anywhere in the app yet (05.1-06.3 all deliberately shipped with no UI), so there is
-- no existing data this constraint could conflict with.
alter table discovery.opportunities
  add constraint opportunities_recommended_action_check
  check (recommended_action is null or recommended_action in (
    'research_more', 'find_better_contact', 'draft_message', 'send_to_crm', 'watch', 'wait', 'dismiss'
  ));

-- "Recommendation must be explainable" (doc's own words) -- mirrors `score_reason`'s
-- own precedent (05.2) for carrying a score's plain-English explanation alongside it.
alter table discovery.opportunities add column recommended_action_reason text;
