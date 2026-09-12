-- COMPLY-P0-08.1 follow-up: `mcp__Supabase__get_advisors` (performance) flagged
-- `gst.gstr2b_documents_business_id_fkey` as an unindexed foreign key immediately after
-- applying `20260912140000_gst_gstr2b_statements.sql` -- `statement_id` is already
-- covered (it's the leading column of the table's own `unique(statement_id, section,
-- document_type, supplier_gstin, document_number)` constraint), but `business_id` had no
-- index of its own, unlike every RLS policy on this table (and every future
-- COMPLY-P0-08.2 matching query) which filters by it directly. Same "catch it the same
-- session, fix it as a separate small migration" discipline COMPLY-P0-07.6 already
-- established for its own search-path finding.

create index gstr2b_documents_business_id_idx on gst.gstr2b_documents (business_id);
