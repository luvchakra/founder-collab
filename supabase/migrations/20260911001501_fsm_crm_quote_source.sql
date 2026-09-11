-- CRM-11.1's other bridge half (see 20260911001500_crm_fsm_quote_bridge.sql for the
-- crm-schema side and full rationale) -- fsm.opportunities needs a `crm` source
-- (alongside its existing manual/contact_form/discovery/import/api values) and a
-- generic source_reference column to hold the crm.opportunity id that created it --
-- source_prospect_id is Discovery-specific by name, so reusing it for a CRM opportunity
-- id would be misleading to a future reader; a new column keeps each source's own
-- reference unambiguous. Same "no FK, validated in application code" reasoning as
-- source_prospect_id's own comment. No new unique index on (business_id, source,
-- source_reference) -- createOpportunityFromWonProspect()'s own sibling idempotency
-- check on (source, source_prospect_id) is app-level only (check-then-insert, no DB
-- constraint), so createFsmQuoteFromCrmOpportunity() follows that same established
-- precedent rather than holding only the new column to a stricter standard.
alter type fsm.opportunity_source add value 'crm';
alter table fsm.opportunities add column source_reference uuid;
