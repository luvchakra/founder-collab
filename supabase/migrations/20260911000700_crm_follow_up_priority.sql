-- CRM-05.3: "Follow-up Queue" needs a "high-priority" view and a priority filter, which
-- crm.follow_up (built ahead of schedule in CRM-01.2) doesn't carry yet.
create type crm.follow_up_priority as enum ('low', 'normal', 'high');

alter table crm.follow_up
  add column priority crm.follow_up_priority not null default 'normal';
