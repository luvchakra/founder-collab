-- DISC-OFFER-P0-05.4: "Why Now" -- `opportunities.why_now` (05.1) already covers the
-- doc's own `why_now_summary` field (reused, not duplicated under a second column --
-- same aliasing call as 01.1's `description` = `short_description`); `timing_score`
-- (05.2) already has a slot for the numeric component. The two genuinely missing pieces
-- are the human-readable timing label and a why-now-specific confidence, distinct from
-- the opportunity's own overall `confidence` (05.2's, which reflects how *complete* the
-- score's component set is, not how sure Discovery is about the timing claim itself).
alter table discovery.opportunities
  add column timing_strength text check (timing_strength is null or timing_strength in ('low', 'medium', 'high')),
  add column why_now_confidence text not null default 'low' check (why_now_confidence in ('low', 'medium', 'high'));
