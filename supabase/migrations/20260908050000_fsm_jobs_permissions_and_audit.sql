-- Epic 5, story F-5: Jobs. Two permission keys -- `jobs.edit` for ordinary job actions
-- (create, update, start/hold/resume/complete/cancel/duplicate/convert-to-opportunity),
-- and a separate `jobs.reopen` for the one transition the PRD explicitly calls out as
-- admin-only (§4: "completed -> in_progress (reopen, admin only)"). Both owner/admin for
-- now -- no new business_members role (CLAUDE.md principle 7 bans speculative
-- functionality; nothing here needs a role finer than owner/admin vs viewer).
insert into core.permissions (key, module, description) values
  ('jobs.edit', 'fsm', 'Create, update, and transition jobs (start, hold, resume, complete, cancel, duplicate, convert to opportunity)'),
  ('jobs.reopen', 'fsm', 'Reopen a completed job back to in-progress')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'jobs.edit'),
  ('admin', 'jobs.edit'),
  ('owner', 'jobs.reopen'),
  ('admin', 'jobs.reopen')
on conflict (role, permission_key) do nothing;

-- History tab (PRD §5: `/fsm/jobs/[id]` has a "History" tab) reads `core.audit_log`
-- (PRD §3's own "owned by core, used by FSM" list) -- same trigger-on-status-change
-- pattern as `core.log_document_status_change()` (D-10), just scoped to `fsm.jobs`.
create function fsm.log_job_status_change()
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
  return new;
end;
$$;

create trigger jobs_log_status_change
  after update on fsm.jobs
  for each row execute function fsm.log_job_status_change();
