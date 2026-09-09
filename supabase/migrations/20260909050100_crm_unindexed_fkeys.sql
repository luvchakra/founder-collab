-- Supabase advisor "unindexed_foreign_keys" -- see 20260909050000_core_unindexed_fkeys.sql's
-- own header for the full rationale; this is the crm-schema half of the same finding.
create index if not exists routing_rules_assign_to_employee_id_idx on crm.routing_rules (assign_to_employee_id);
create index if not exists routing_rules_channel_id_idx on crm.routing_rules (channel_id);
create index if not exists tickets_assigned_to_idx on crm.tickets (assigned_to);
create index if not exists tickets_channel_id_idx on crm.tickets (channel_id);
create index if not exists tickets_party_id_idx on crm.tickets (party_id);
