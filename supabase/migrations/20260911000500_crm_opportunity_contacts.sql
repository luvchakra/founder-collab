-- CRM-04.5: "Opportunity Contacts" -- an opportunity can have multiple contacts, one
-- primary, with role capturable later without restructuring. This is deliberately its
-- own junction table rather than reusing core.party_contacts.is_primary: that flag is
-- per-party (the company's own primary contact), while an opportunity's chosen primary
-- contact for THIS deal can differ deal to deal. `role` is nullable text from day one so
-- a later story can start writing it without a schema change (CRM-04.5's own acceptance
-- criteria: "contact role can be captured later without restructuring the model").
create table crm.opportunity_contact (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  opportunity_id uuid not null references crm.opportunity (id) on delete cascade,
  party_contact_id uuid not null references core.party_contacts (id) on delete cascade,
  is_primary boolean not null default false,
  role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, party_contact_id)
);

create index opportunity_contact_business_id_idx on crm.opportunity_contact (business_id);
create index opportunity_contact_opportunity_id_idx on crm.opportunity_contact (opportunity_id);
create index opportunity_contact_party_contact_id_idx on crm.opportunity_contact (party_contact_id);

-- "One can be primary": a DB-level guarantee (not just an app-level check-then-write),
-- same reasoning CRM-01.6's idempotency constraints already established for this
-- codebase -- at most one row per opportunity can have is_primary = true.
create unique index opportunity_contact_one_primary_uq on crm.opportunity_contact (opportunity_id) where is_primary;

create trigger opportunity_contact_set_updated_at
  before update on crm.opportunity_contact
  for each row execute function core.set_updated_at();

create function crm.enforce_party_contact_business_id(p_party_contact_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = core as $$
declare v_actual uuid;
begin
  select business_id into v_actual from core.party_contacts where id = p_party_contact_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'party_contact_id % does not belong to business_id %', p_party_contact_id, p_business_id;
  end if;
end; $$;

create function crm.enforce_opportunity_contact_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  perform crm.enforce_opportunity_business_id(new.opportunity_id, new.business_id);
  perform crm.enforce_party_contact_business_id(new.party_contact_id, new.business_id);
  return new;
end; $$;
create trigger opportunity_contact_enforce_refs before insert or update on crm.opportunity_contact
  for each row execute function crm.enforce_opportunity_contact_refs();

-- Row Level Security -- `tenant AND licensed` (ADR-4, ADR-8), identical shape to every
-- other crm.* table.
alter table crm.opportunity_contact enable row level security;

create policy "members can view opportunity_contact in their licensed businesses"
  on crm.opportunity_contact for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('crm'))
  );

create policy "members can create opportunity_contact in their licensed businesses"
  on crm.opportunity_contact for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );

create policy "members can update opportunity_contact in their licensed businesses"
  on crm.opportunity_contact for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );

create policy "members can delete opportunity_contact in their licensed businesses"
  on crm.opportunity_contact for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );

grant select, insert, update, delete on crm.opportunity_contact to authenticated, service_role;
