-- WonderArc Compliance backlog, COMPLY-P0-06.2 follow-up: `mcp__Supabase__get_advisors`
-- (performance), re-run after applying 20260912071000_gst_eway_bill_movements.sql against
-- the dev project, flagged `eway_bill_movements_document_id_fkey` as an unindexed foreign
-- key -- the same class of finding COMPLY-P0-02.1's own
-- `20260911004300_gst_compliance_profiles_registration_id_index.sql` fixed with its own
-- follow-up migration, kept as its own file for the same reason: this repo's migration
-- timeline should match exactly what was actually applied, one file per
-- `apply_migration` call, not a silently-edited already-applied migration.

create index eway_bill_movements_document_id_idx on gst.eway_bill_movements (document_id);
