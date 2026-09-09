-- Supabase advisor "unindexed_foreign_keys" -- see 20260909050000_core_unindexed_fkeys.sql's
-- own header for the full rationale; this is the fsm-schema half of the same finding
-- (the largest -- fsm owns 17 of the 29 flagged foreign keys).
create index if not exists expenses_attachment_id_idx on fsm.expenses (attachment_id);
create index if not exists expenses_employee_id_idx on fsm.expenses (employee_id);
create index if not exists expenses_item_id_idx on fsm.expenses (item_id);
create index if not exists expenses_vendor_party_id_idx on fsm.expenses (vendor_party_id);
create index if not exists jobs_primary_contact_id_idx on fsm.jobs (primary_contact_id);
create index if not exists jobs_recurring_template_id_idx on fsm.jobs (recurring_template_id);
create index if not exists jobs_service_address_id_idx on fsm.jobs (service_address_id);
create index if not exists jobs_service_type_id_idx on fsm.jobs (service_type_id);
create index if not exists opportunities_converted_job_id_idx on fsm.opportunities (converted_job_id);
create index if not exists opportunities_primary_contact_id_idx on fsm.opportunities (primary_contact_id);
create index if not exists opportunities_service_address_id_idx on fsm.opportunities (service_address_id);
create index if not exists opportunities_service_type_id_idx on fsm.opportunities (service_type_id);
create index if not exists portal_tokens_document_id_idx on fsm.portal_tokens (document_id);
create index if not exists recurring_templates_party_id_idx on fsm.recurring_templates (party_id);
create index if not exists recurring_templates_service_type_id_idx on fsm.recurring_templates (service_type_id);
create index if not exists signatures_image_attachment_id_idx on fsm.signatures (image_attachment_id);
create index if not exists work_requests_opportunity_id_idx on fsm.work_requests (opportunity_id);
