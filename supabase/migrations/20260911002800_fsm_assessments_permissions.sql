-- INT-04.2. A dedicated permission key rather than reusing opportunities.edit -- an
-- assessment is its own pre-quote artifact, same minimal-role treatment as F-2's/F-3's
-- own permissions (owner/admin only for now, no new business_members role).
insert into core.permissions (key, module, description) values
  ('assessments.manage', 'fsm', 'Create/update pre-quote assessment requests and record their outcome')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'assessments.manage'),
  ('admin', 'assessments.manage')
on conflict (role, permission_key) do nothing;
