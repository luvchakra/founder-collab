-- Supabase advisor "unindexed_foreign_keys" -- see 20260909050000_core_unindexed_fkeys.sql's
-- own header for the full rationale; this is the crm backlog-schema half
-- (20260911000000_crm_backlog_schema_baseline.sql) of the same finding, for the
-- foreign-key columns that migration's own hand-picked index list missed.
create index if not exists assignment_assigned_by_idx on crm.assignment (assigned_by);
create index if not exists conversation_participant_party_id_idx on crm.conversation_participant (party_id);
create index if not exists crm_note_author_id_idx on crm.crm_note (author_id);
create index if not exists crm_note_conversation_id_idx on crm.crm_note (conversation_id);
create index if not exists crm_note_lead_id_idx on crm.crm_note (lead_id);
create index if not exists crm_note_opportunity_id_idx on crm.crm_note (opportunity_id);
create index if not exists follow_up_activity_id_idx on crm.follow_up (activity_id);
create index if not exists follow_up_conversation_id_idx on crm.follow_up (conversation_id);
create index if not exists follow_up_lead_id_idx on crm.follow_up (lead_id);
create index if not exists follow_up_opportunity_id_idx on crm.follow_up (opportunity_id);
create index if not exists follow_up_party_id_idx on crm.follow_up (party_id);
create index if not exists interaction_content_reference_idx on crm.interaction (content_reference);
create index if not exists product_interest_conversation_id_idx on crm.product_interest (conversation_id);
create index if not exists product_interest_interaction_id_idx on crm.product_interest (interaction_id);
create index if not exists product_interest_lead_id_idx on crm.product_interest (lead_id);
create index if not exists product_interest_opportunity_id_idx on crm.product_interest (opportunity_id);
create index if not exists product_interest_party_id_idx on crm.product_interest (party_id);
create index if not exists review_item_party_id_idx on crm.review_item (party_id);
