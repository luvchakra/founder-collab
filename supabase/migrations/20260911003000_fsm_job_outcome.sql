-- INT-06.1: "Service Outcome Classification" -- FSM's own structured completion
-- outcome, distinct from job.status ('completed' is the workflow state; outcome is
-- what actually happened commercially). Fixed vocabulary per the story's own explicit
-- "Do not use AI to invent the operational state" -- this is a human's classification
-- at completion time, not an AI-inferred label.
alter table fsm.jobs
  add column outcome text check (
    outcome in (
      'completed_successfully',
      'completed_with_recommendation',
      'additional_work_required',
      'parts_required_later',
      'customer_declined_additional_work',
      'warranty_revisit_required',
      'unresolved'
    )
  ),
  add column outcome_notes text;
