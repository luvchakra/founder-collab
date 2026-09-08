-- Epic 5, story F-2: the one new permission key Opportunities' own write paths need.
-- No new FSM-specific role yet (e.g. a future "dispatcher"/"technician" role) --
-- CLAUDE.md principle 7 bans speculative functionality, and nothing in F-2 itself needs
-- a role finer than owner/admin (full access) vs viewer (read-only, via fsm.opportunities'
-- own tenant-AND-licensed RLS alone -- reads are never permission-gated on top of that,
-- matching inventory's own precedent where even a viewer can read). A later story that
-- genuinely needs a finer role (F-7's field technician, say) extends
-- core.business_members' own role check constraint then, not speculatively here.
insert into core.permissions (key, module, description) values
  ('opportunities.edit', 'fsm', 'Create/update opportunities, mark them lost, tag them, and set custom field values')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'opportunities.edit'),
  ('admin', 'opportunities.edit')
on conflict (role, permission_key) do nothing;
