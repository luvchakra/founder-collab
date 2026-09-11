-- INT-06.2: "CRM creates suggested opportunity" from an FSM job's own completion
-- outcome, dedup'd idempotently (a replayed/retried domain event must never create a
-- second suggested opportunity for the same job). Mirrors crm.lead's own existing
-- source_module/source_reference pair verbatim -- the same generic "opaque reference
-- into whatever created this row" shape, not a new concept.
alter table crm.opportunity
  add column source_module text,
  add column source_reference text;
