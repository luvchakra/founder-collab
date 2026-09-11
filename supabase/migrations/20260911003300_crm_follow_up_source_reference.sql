-- INT-06.3: same generic "opaque reference into whatever created this row" pair
-- crm.lead and (INT-06.2's own migration) crm.opportunity already carry -- lets the new
-- "recommended parts" follow-up be created idempotently (source_module: 'fsm_job_parts',
-- source_reference: <jobId>), the same dedup shape used everywhere else in this backlog.
alter table crm.follow_up
  add column source_module text,
  add column source_reference text;
