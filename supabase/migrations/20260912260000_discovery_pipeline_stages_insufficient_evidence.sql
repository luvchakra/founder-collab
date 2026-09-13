-- DISC-OFFER-P1-02.1 "Review Required Indicators" -- the doc's own three-symbol legend
-- ("High confidence -- automated" / "Needs review" / "Insufficient evidence"). The
-- original six-state `pipeline_stages.status` vocabulary (20260912070000) already
-- anticipated `needs_review`, with its own comment naming this exact story as the one
-- that decides when a stage's result is uncertain enough to land there instead of
-- `completed`. This story adds the doc's own third, narrower state --
-- `insufficient_evidence`, a stage that ran and genuinely found nothing to work with,
-- a different fact from one that found something but it's weak (05.5's own
-- `insufficient_evidence` vs. `no_relevant_problem` split on negative signals already
-- established this same distinction for a different table) -- as a purely additive
-- widening, the same "widen a check constraint for a real third state" precedent
-- DISC-OFFER-P0-01.1 already established for `products.status`. No existing row's
-- status is touched by this migration; nothing currently in `needs_review` needs to
-- move (there is no producer of either value before this story, per that column's own
-- comment).
alter table discovery.pipeline_stages drop constraint pipeline_stages_status_check;
alter table discovery.pipeline_stages add constraint pipeline_stages_status_check
  check (
    status in (
      'not_started', 'running', 'completed', 'failed', 'needs_review', 'skipped',
      'insufficient_evidence'
    )
  );
