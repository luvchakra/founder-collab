-- Epic 5, story F-7: Field execution. Three permission keys, matching Kickserv's own
-- permission matrix (PRD §12) treating "Job charges", "Expenses", "Time entries", and
-- "Notes" as separate categories from "Jobs" itself -- same reasoning F-3 used to keep
-- `estimates.edit` distinct from `opportunities.edit`. Attachments and signature capture
-- have no separate category in that matrix, so they stay gated on the existing
-- `jobs.edit` (a photo or signature is part of the job's own record, same as its
-- description). All three owner/admin only for now, same minimal-role treatment every
-- prior FSM permission has gotten.
insert into core.permissions (key, module, description) values
  ('time_entries.edit', 'fsm', 'Clock in/out and edit time entries on a job'),
  ('expenses.edit', 'fsm', 'Record expenses against a job'),
  ('notes.edit', 'fsm', 'Add notes to a job')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'time_entries.edit'),
  ('admin', 'time_entries.edit'),
  ('owner', 'expenses.edit'),
  ('admin', 'expenses.edit'),
  ('owner', 'notes.edit'),
  ('admin', 'notes.edit')
on conflict (role, permission_key) do nothing;
