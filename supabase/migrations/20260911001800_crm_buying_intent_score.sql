-- CRM-12.5 (Epic CRM-12 "AI Relationship Intelligence"): "Buying Intent Score."
-- Deliberately NOT an LLM call -- CLAUDE.md principle 4 ("do not use an LLM for
-- deterministic operations"), and this story's own acceptance criteria (explainable
-- contributing signals, visible source evidence, auditable recalculation) describe a
-- reproducible weighted computation over real CRM/cross-module data, not a generative
-- text response. Same "own small cache table, one row per entity" shape as CRM-12.1's
-- `crm.customer_summary` -- `signals` holds the per-signal points/evidence breakdown
-- (the "explainable contributing signals" / "source evidence" acceptance criteria) as
-- jsonb, one cohesive result always read/written together.
create table crm.buying_intent_score (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  party_id uuid not null references core.parties (id) on delete cascade,
  score integer not null,
  signals jsonb not null,
  calculated_at timestamptz not null default now(),
  unique (business_id, party_id)
);

create index buying_intent_score_business_id_idx on crm.buying_intent_score (business_id);
create index buying_intent_score_party_id_idx on crm.buying_intent_score (party_id);

create function crm.enforce_buying_intent_score_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  perform crm.enforce_party_business_id(new.party_id, new.business_id);
  return new;
end; $$;
create trigger buying_intent_score_enforce_refs before insert or update on crm.buying_intent_score
  for each row execute function crm.enforce_buying_intent_score_refs();

-- Row Level Security -- `tenant AND licensed` (ADR-4, ADR-8), identical shape to every
-- other crm.* table.
alter table crm.buying_intent_score enable row level security;

create policy "members can view buying_intent_score in their licensed businesses"
  on crm.buying_intent_score for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('crm'))
  );
create policy "members can create buying_intent_score in their licensed businesses"
  on crm.buying_intent_score for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );
create policy "members can update buying_intent_score in their licensed businesses"
  on crm.buying_intent_score for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );
create policy "members can delete buying_intent_score in their licensed businesses"
  on crm.buying_intent_score for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('crm'))
  );

grant select, insert, update, delete on crm.buying_intent_score to authenticated, service_role;
