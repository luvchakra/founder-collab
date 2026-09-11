-- CRM-12.2 (Epic CRM-12 "AI Relationship Intelligence"): "Conversation Summary" --
-- summary, unresolved questions, promised actions, customer sentiment, next action, for
-- one specific conversation. Same "own small cache table" shape as CRM-12.1's
-- `crm.customer_summary` (20260911001600), just keyed by `conversation_id` (a real FK
-- into `crm.conversation`, same schema -- unlike customer_summary's `party_id`, this one
-- isn't a cross-schema reference, so a plain FK plus the existing
-- `crm.enforce_conversation_business_id()` helper is enough, no new helper needed).
-- `data` holds the structured result (summary/unresolvedQuestions/promisedActions/
-- sentiment/nextAction) as jsonb rather than five separate columns -- the shape is one
-- cohesive AI response, always read/written together, never queried by an individual
-- field.
create table crm.conversation_summary (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  conversation_id uuid not null references crm.conversation (id) on delete cascade,
  data jsonb not null,
  input_hash text not null,
  generated_at timestamptz not null default now(),
  unique (business_id, conversation_id)
);

create index conversation_summary_business_id_idx on crm.conversation_summary (business_id);
create index conversation_summary_conversation_id_idx on crm.conversation_summary (conversation_id);

create function crm.enforce_conversation_summary_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  perform crm.enforce_conversation_business_id(new.conversation_id, new.business_id);
  return new;
end; $$;
create trigger conversation_summary_enforce_refs before insert or update on crm.conversation_summary
  for each row execute function crm.enforce_conversation_summary_refs();

-- Row Level Security -- `tenant AND licensed` (ADR-4, ADR-8), identical shape to every
-- other crm.* table.
alter table crm.conversation_summary enable row level security;

create policy "members can view conversation_summary in their licensed businesses"
  on crm.conversation_summary for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('crm'))
  );
create policy "members can create conversation_summary in their licensed businesses"
  on crm.conversation_summary for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );
create policy "members can update conversation_summary in their licensed businesses"
  on crm.conversation_summary for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );
create policy "members can delete conversation_summary in their licensed businesses"
  on crm.conversation_summary for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );

grant select, insert, update, delete on crm.conversation_summary to authenticated, service_role;
