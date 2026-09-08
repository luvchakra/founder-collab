-- Epic 5, story F-11: Messages tab. One permission key -- PRD §9/§12: "All admins see
-- it; staff/techs need the messaging permission" -- owner/admin get it via the seeded
-- cross join (same as every other FSM permission); a business can later grant it to a
-- specific staff/tech role once a role-permissions management UI exists (not this
-- story's own scope -- none exists for any permission yet). View and send share one key,
-- matching the PRD's own singular "the messaging permission" phrasing (no separate
-- view/send split, unlike time_entries.edit's own precedent where Kickserv's matrix
-- genuinely lists view/create-modify/delete separately for that category).
insert into core.permissions (key, module, description) values
  ('messages.manage', 'fsm', 'View and send messages on a job')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'messages.manage'),
  ('admin', 'messages.manage')
on conflict (role, permission_key) do nothing;
