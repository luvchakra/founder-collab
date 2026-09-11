-- INT-07.3: "Exception Auto-Close" -- the two exception kinds INT-07.1's Model
-- surfaces already auto-close in the sense that matters most: listCrossModuleExceptions()
-- is a live derivation with no stored exception row of its own, so the moment the
-- underlying condition resolves, the very next read simply stops returning it. What was
-- genuinely missing was a durable record that it ever happened: resolving a shortage or
-- recording an assessment outcome left zero trace in core.audit_log. This migration
-- closes that gap the same way F-5's own job-status-change trigger already does it (D-10's
-- "core.audit_log + a write helper invoked by every state transition" convention) --
-- application code doesn't have to remember to call it, so a second write path (a future
-- admin tool, a direct SQL fix) can't silently skip it.

-- Extends fsm.log_job_status_change() (not a second trigger) -- same "after update" event
-- the status-change logging already fires on, one more condition inside it.
create or replace function fsm.log_job_status_change()
returns trigger
language plpgsql
security definer
set search_path = fsm, core
as $$
begin
  if new.status is distinct from old.status then
    perform core.write_audit_log(
      new.business_id, auth.uid(), 'job.status_changed', 'job', new.id,
      jsonb_build_object('status', old.status), jsonb_build_object('status', new.status)
    );
  end if;
  if new.parts_shortage_resolution is distinct from old.parts_shortage_resolution and new.parts_shortage_resolution is not null then
    perform core.write_audit_log(
      new.business_id, auth.uid(), 'job.parts_shortage_resolved', 'job', new.id,
      jsonb_build_object('parts_shortage_resolution', old.parts_shortage_resolution),
      jsonb_build_object('parts_shortage_resolution', new.parts_shortage_resolution, 'note', new.parts_shortage_resolution_note)
    );
  end if;
  return new;
end;
$$;

-- fsm.assessments had no audit trigger at all before this story.
create function fsm.log_assessment_outcome_recorded()
returns trigger
language plpgsql
security definer
set search_path = fsm, core
as $$
begin
  if new.outcome is distinct from old.outcome and new.outcome is not null then
    perform core.write_audit_log(
      new.business_id, auth.uid(), 'assessment.outcome_recorded', 'assessment', new.id,
      jsonb_build_object('outcome', old.outcome),
      jsonb_build_object('outcome', new.outcome, 'notes', new.outcome_notes)
    );
  end if;
  return new;
end;
$$;

create trigger assessments_log_outcome_recorded
  after update on fsm.assessments
  for each row execute function fsm.log_assessment_outcome_recorded();
