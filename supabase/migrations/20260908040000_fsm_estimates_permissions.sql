-- Epic 5, story F-3: Estimates. A dedicated permission key rather than reusing
-- opportunities.edit -- Kickserv's own permission matrix (PRD §12) separates "Job
-- charges" from "Jobs" as distinct categories, so a future role (e.g. an estimator who
-- may build estimates but not edit an opportunity's own core fields) can be granted one
-- without the other. Same minimal-role treatment as F-2's opportunities.edit: owner/admin
-- only for now, no new business_members role.
insert into core.permissions (key, module, description) values
  ('estimates.edit', 'fsm', 'Add, edit, reorder, and remove estimate charge lines')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'estimates.edit'),
  ('admin', 'estimates.edit')
on conflict (role, permission_key) do nothing;
