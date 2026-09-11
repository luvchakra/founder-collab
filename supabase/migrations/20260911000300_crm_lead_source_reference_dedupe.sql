-- CRM-03.1: "CRM lead is not duplicated if already promoted." The application-level
-- check-then-insert in promoteProspectToLead() (lib/leads/mutations.ts) is race-prone on
-- its own -- two concurrent promote attempts for the same prospect could both pass the
-- "does a lead already exist" check before either insert commits. A real unique
-- constraint is the actual guarantee, same as crm.interaction's own
-- (business_id, channel, external_message_id) dedupe index (CRM-01.6) -- the app-level
-- check is just an optimization to avoid the round trip to the database in the common
-- case, not the source of truth.
create unique index lead_source_reference_uq
  on crm.lead (business_id, source_module, source_reference)
  where source_module is not null and source_reference is not null;
