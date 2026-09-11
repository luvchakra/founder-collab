-- INT-06.4: "Warranty / Revisit -> FSM" -- a completed job whose outcome is
-- 'warranty_revisit_required' (INT-06.1) gets a fresh, unscheduled follow-up job
-- created automatically for the same party -- the FSM-side analog of INT-06.2's
-- "suggested CRM opportunity" (the owner reviews/schedules it; nothing auto-sends to
-- the customer). Same-schema self-reference (fsm.jobs -> fsm.jobs) is a real FK, unlike
-- the bare-uuid cross-module pointers used elsewhere in this backlog -- the "cross-
-- schema FKs point only into core" rule doesn't apply within one module's own schema.
--
-- "Do not create a new CRM opportunity unless the outcome represents commercial work"
-- is satisfied structurally: nothing in this story touches crm.* at all, and the new
-- job is already visible on the party's CRM relationship timeline for free --
-- module-crm's listRelationshipTimeline() already reads every fsm.jobs row for the
-- party live (INT-01.1), so no new cross-module mechanism is needed here.
alter table fsm.jobs
  add column revisit_of_job_id uuid references fsm.jobs (id) on delete set null;

create index jobs_revisit_of_job_id_idx on fsm.jobs (revisit_of_job_id);
