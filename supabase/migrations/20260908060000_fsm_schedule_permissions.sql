-- Epic 5, story F-6: Scheduling. Two permission keys, matching the PRD's own §2
-- "Scheduling" row and §1.7's explicit callout that bulk "Print Work Orders" is its own
-- grantable action distinct from ordinary schedule management ("admin-only by default,
-- grantable") -- same reasoning F-3 used to keep `estimates.edit` distinct from
-- `opportunities.edit` (a future finer-grained role could get one without the other).
-- Both owner/admin only for now, same minimal-role treatment every prior FSM permission
-- has gotten (CLAUDE.md principle 7 bans speculative functionality; no role finer than
-- owner/admin vs viewer exists yet).
insert into core.permissions (key, module, description) values
  ('schedule.manage', 'fsm', 'Create, reschedule, reassign, and cancel schedule events (work, estimate, reminder); designate which business members are technicians'),
  ('schedule.print_work_orders', 'fsm', 'Bulk-print work orders for a day or for selected employees')
on conflict (key) do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'schedule.manage'),
  ('admin', 'schedule.manage'),
  ('owner', 'schedule.print_work_orders'),
  ('admin', 'schedule.print_work_orders')
on conflict (role, permission_key) do nothing;
