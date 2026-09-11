-- CRM-05.2: "Every active lead/opportunity may have one prominent next_action." A
-- straight nullable FK rather than a boolean flag on crm.activity -- a plain FK column
-- already guarantees "at most one" for free (no partial unique index needed, unlike
-- CRM-04.5's opportunity_contact primary-contact case, where many rows could otherwise
-- all claim to be primary). Owner/due date come from the linked crm.activity row itself
-- (owner_id, due_at) -- no duplicate columns here.
alter table crm.lead add column next_action_id uuid references crm.activity (id) on delete set null;
alter table crm.opportunity add column next_action_id uuid references crm.activity (id) on delete set null;

create index lead_next_action_id_idx on crm.lead (next_action_id);
create index opportunity_next_action_id_idx on crm.opportunity (next_action_id);

-- Tenant-safety defense in depth, same shape as every other cross-reference these two
-- tables already enforce (owner_id, stage_id, etc.) -- extends the existing functions
-- rather than adding a parallel trigger.
create or replace function crm.enforce_lead_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  perform crm.enforce_party_business_id(new.party_id, new.business_id);
  if new.owner_id is not null then perform crm.enforce_employee_business_id(new.owner_id, new.business_id); end if;
  if new.next_action_id is not null then perform crm.enforce_activity_business_id(new.next_action_id, new.business_id); end if;
  return new;
end; $$;

create or replace function crm.enforce_opportunity_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  perform crm.enforce_party_business_id(new.party_id, new.business_id);
  if new.lead_id is not null then perform crm.enforce_lead_business_id(new.lead_id, new.business_id); end if;
  if new.stage_id is not null then perform crm.enforce_opportunity_stage_business_id(new.stage_id, new.business_id); end if;
  if new.owner_id is not null then perform crm.enforce_employee_business_id(new.owner_id, new.business_id); end if;
  if new.next_action_id is not null then perform crm.enforce_activity_business_id(new.next_action_id, new.business_id); end if;
  return new;
end; $$;
