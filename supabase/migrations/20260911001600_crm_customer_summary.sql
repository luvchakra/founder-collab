-- CRM-12.1 (WonderArc CRM backlog, Epic CRM-12 "AI Relationship Intelligence"): "Customer
-- Summary" -- who they are, what they want, what has happened, open issue/opportunity,
-- next action, generated from the same cross-module data Customer 360 (CRM-02.1)
-- already assembles. Cached on its own row rather than a new column on core.parties
-- (core is shared across every module; a CRM-specific AI artifact doesn't belong there) --
-- same "cache on the entity" discipline crm.review_item.draft_reply already established
-- for CRM-08.6, just as its own small cache table since the entity being summarized
-- (a core.parties row) isn't CRM's own to add a column to.
create table crm.customer_summary (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  party_id uuid not null references core.parties (id) on delete cascade,
  summary text not null,
  -- Same cache-by-input-hash discipline as draftReviewResponse(): unchanged underlying
  -- data means the last summary is returned without a second AI call.
  input_hash text not null,
  generated_at timestamptz not null default now(),
  unique (business_id, party_id)
);

create index customer_summary_business_id_idx on crm.customer_summary (business_id);
create index customer_summary_party_id_idx on crm.customer_summary (party_id);

create function crm.enforce_customer_summary_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  perform crm.enforce_party_business_id(new.party_id, new.business_id);
  return new;
end; $$;
create trigger customer_summary_enforce_refs before insert or update on crm.customer_summary
  for each row execute function crm.enforce_customer_summary_refs();

-- Row Level Security -- `tenant AND licensed` (ADR-4, ADR-8), identical shape to every
-- other crm.* table (20260911000000_crm_backlog_schema_baseline.sql's own loop).
alter table crm.customer_summary enable row level security;

create policy "members can view customer_summary in their licensed businesses"
  on crm.customer_summary for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('crm'))
  );
create policy "members can create customer_summary in their licensed businesses"
  on crm.customer_summary for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );
create policy "members can update customer_summary in their licensed businesses"
  on crm.customer_summary for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );
create policy "members can delete customer_summary in their licensed businesses"
  on crm.customer_summary for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );

grant select, insert, update, delete on crm.customer_summary to authenticated, service_role;
