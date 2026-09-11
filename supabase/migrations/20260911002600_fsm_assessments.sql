-- INT-04.2: "Create FSM Assessment Request" -- the genuinely new FSM-side entity this
-- backlog's own pre-implementation reconnaissance flagged as missing (no
-- "assessment/site-visit" concept exists anywhere in the schema, confirmed against
-- docs/plan/00-MASTER-PLAN.md's entity-ownership map). Modeled as its own lightweight
-- table, not a special fsm.jobs row: a pre-quote assessment is conceptually distinct
-- from the work itself (INT-08's own object-graph example lists "FSM Assessment", "FSM
-- Quote", and "FSM Job" as three separate linked things under one CRM opportunity, not
-- one entity wearing different hats), and unlike a job an assessment has its own small
-- outcome vocabulary (INT-04.3) that doesn't belong on fsm.jobs.
--
-- No column here points back at the originating CRM opportunity -- the established
-- direction throughout this backlog is CRM stores the one pointer (crm.opportunity.
-- assessment_request_id, added in the same migration set) and always reads status live
-- through FSM's own contract, exactly like fsm_opportunity_id/fulfillment_request_id.
-- FSM never needs to know which CRM opportunity asked for this.
create table fsm.assessments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  party_id uuid not null references core.parties (id) on delete restrict,
  primary_contact_id uuid references core.party_contacts (id) on delete set null,
  service_address_id uuid references core.addresses (id) on delete set null,
  -- Defense-in-depth dedup, same shape as fsm.opportunities' own source/source_reference
  -- (CRM-11.1) -- CRM's own createAssessmentRequestForOpportunity() already checks its
  -- stored assessment_request_id first, but this makes the contract function itself
  -- idempotent too, not just its one caller. Bare uuid, no FK -- crm.opportunity lives
  -- in another module's schema.
  source text not null default 'crm',
  source_reference uuid,
  kind text not null check (kind in ('remote', 'on_site', 'technical')),
  requested_scope text,
  customer_notes text,
  -- Discovery research/context, transferred once at creation time (Rule 3: a handoff
  -- transfers context, not ownership) -- a plain text snapshot, not a live pointer back
  -- into discovery.prospects.
  discovery_context text,
  preferred_timing text,
  status text not null default 'requested' check (status in ('requested', 'scheduled', 'completed', 'not_feasible', 'cancelled')),
  outcome text check (outcome in ('scope_confirmed', 'scope_changed', 'additional_work_identified', 'not_feasible', 'customer_unavailable', 'follow_up_required')),
  outcome_notes text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assessments_business_id_idx on fsm.assessments (business_id);
create index assessments_party_id_idx on fsm.assessments (party_id);
create index assessments_primary_contact_id_idx on fsm.assessments (primary_contact_id);
create index assessments_service_address_id_idx on fsm.assessments (service_address_id);
create unique index assessments_business_id_source_reference_key on fsm.assessments (business_id, source, source_reference) where source_reference is not null;

create trigger assessments_set_updated_at before update on fsm.assessments
  for each row execute function core.set_updated_at();

-- Same cross-reference enforcement pattern as every other fsm table (opportunities,
-- jobs, ...) -- reuses the already-existing helper functions, no new ones needed.
create function fsm.enforce_assessments_refs() returns trigger language plpgsql security definer set search_path = fsm as $$
begin
  perform fsm.enforce_party_business_id(new.party_id, new.business_id);
  if new.primary_contact_id is not null then perform fsm.enforce_party_contact_business_id(new.primary_contact_id, new.business_id); end if;
  if new.service_address_id is not null then perform fsm.enforce_address_business_id(new.service_address_id, new.business_id); end if;
  return new;
end; $$;
create trigger assessments_enforce_refs before insert or update on fsm.assessments
  for each row execute function fsm.enforce_assessments_refs();

-- RLS -- `tenant AND licensed` (ADR-4, ADR-8), identical shape to the loop-generated
-- policies for every other fsm table.
alter table fsm.assessments enable row level security;

create policy "members can view assessments in their licensed businesses"
  on fsm.assessments for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('fsm'))
  );

create policy "members can create assessments in their licensed businesses"
  on fsm.assessments for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('fsm'))
  );

create policy "members can update assessments in their licensed businesses"
  on fsm.assessments for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('fsm'))
  );

create policy "members can delete assessments in their licensed businesses"
  on fsm.assessments for delete
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('fsm'))
  );
