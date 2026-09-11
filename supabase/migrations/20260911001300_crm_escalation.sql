-- CRM-09.8 (WonderArc CRM backlog, Epic CRM-09): "Escalation Rules" -- a configurable
-- timed ladder (new inquiry -> reminder -> owner escalation -> manager escalation) for
-- an unanswered commercial message. "Do not hard-code times; store business
-- configuration" is this table: `crm.escalation_config` holds each business's own
-- delay minutes (seeded with the backlog's own example -- 15/60/240 -- as column
-- defaults) plus which employee is this business's escalation manager -- a distinct,
-- explicitly-configurable designation, not a reuse of the existing owner/admin RBAC
-- roles (confirmed with the user: those roles mean "can configure the business", not
-- "is the person negative reviews/unresolved inquiries get escalated to"). One row per
-- business, created lazily by the first mutation that needs one -- getEscalationConfig()
-- returns the same defaults even with no row yet, so a business that never customizes
-- anything still gets a working (if manager-less) ladder.
create table crm.escalation_config (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  reminder_delay_minutes integer not null default 15,
  owner_escalation_delay_minutes integer not null default 60,
  manager_escalation_delay_minutes integer not null default 240,
  manager_employee_id uuid references core.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id)
);

create index escalation_config_manager_employee_id_idx on crm.escalation_config (manager_employee_id);

create trigger escalation_config_set_updated_at
  before update on crm.escalation_config
  for each row execute function core.set_updated_at();

create function crm.enforce_escalation_config_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  if new.manager_employee_id is not null then perform crm.enforce_employee_business_id(new.manager_employee_id, new.business_id); end if;
  return new;
end; $$;
create trigger escalation_config_enforce_refs before insert or update on crm.escalation_config
  for each row execute function crm.enforce_escalation_config_refs();

-- CRM-09.8's escalation state, tracked as a `crm.follow_up` row the same way CRM-08.7's
-- review recovery task is -- `crm.follow_up` has no "attached to something" constraint
-- (unlike `crm.activity`), so it's already the right home for "a task the system
-- created", and reusing it means the existing Follow-ups queue surfaces escalating
-- conversations with zero new UI. `interaction_id` identifies which inbound message
-- started the clock (its own `occurred_at` is "New inquiry" from the diagram);
-- `escalation_stage` records how far the ladder has climbed so a re-sweep never
-- re-fires an earlier stage or duplicates a row for the same interaction.
create type crm.escalation_stage as enum ('reminder', 'owner_escalation', 'manager_escalation');

alter table crm.follow_up
  add column interaction_id uuid references crm.interaction (id) on delete cascade,
  add column escalation_stage crm.escalation_stage;

create unique index follow_up_interaction_id_uq on crm.follow_up (business_id, interaction_id) where interaction_id is not null;
create index follow_up_interaction_id_idx on crm.follow_up (interaction_id);

create or replace function crm.enforce_follow_up_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  if new.party_id is not null then perform crm.enforce_party_business_id(new.party_id, new.business_id); end if;
  if new.lead_id is not null then perform crm.enforce_lead_business_id(new.lead_id, new.business_id); end if;
  if new.opportunity_id is not null then perform crm.enforce_opportunity_business_id(new.opportunity_id, new.business_id); end if;
  if new.conversation_id is not null then perform crm.enforce_conversation_business_id(new.conversation_id, new.business_id); end if;
  if new.activity_id is not null then perform crm.enforce_activity_business_id(new.activity_id, new.business_id); end if;
  if new.owner_id is not null then perform crm.enforce_employee_business_id(new.owner_id, new.business_id); end if;
  if new.review_item_id is not null then perform crm.enforce_review_item_business_id(new.review_item_id, new.business_id); end if;
  if new.interaction_id is not null then perform crm.enforce_interaction_business_id(new.interaction_id, new.business_id); end if;
  return new;
end; $$;

-- ---------------------------------------------------------------------------
-- Row Level Security -- `tenant AND licensed` (ADR-4, ADR-8), identical shape to every
-- other crm.* table.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['escalation_config']
  loop
    execute format('alter table crm.%1$I enable row level security', t);
    execute format(
      $sql$create policy "members can view %1$s in their licensed businesses"
        on crm.%1$I for select
        using (
          business_id in (select core.user_business_ids())
          and business_id in (select core.licensed_business_ids('crm'))
        )$sql$,
      t
    );
    execute format(
      $sql$create policy "members can create %1$s in their licensed businesses"
        on crm.%1$I for insert
        with check (
          business_id in (select core.user_business_ids())
          and business_id in (select core.write_licensed_business_ids('crm'))
        )$sql$,
      t
    );
    execute format(
      $sql$create policy "members can update %1$s in their licensed businesses"
        on crm.%1$I for update
        using (
          business_id in (select core.user_business_ids())
          and business_id in (select core.write_licensed_business_ids('crm'))
        )
        with check (
          business_id in (select core.user_business_ids())
          and business_id in (select core.write_licensed_business_ids('crm'))
        )$sql$,
      t
    );
    execute format(
      $sql$create policy "members can delete %1$s in their licensed businesses"
        on crm.%1$I for delete
        using (
          business_id in (select core.user_business_ids())
          and business_id in (select core.write_licensed_business_ids('crm'))
        )$sql$,
      t
    );
    execute format('grant select, insert, update, delete on crm.%1$I to authenticated, service_role', t);
  end loop;
end $$;
