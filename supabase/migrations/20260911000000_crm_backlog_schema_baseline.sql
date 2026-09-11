-- CRM-01.2 (WonderArc CRM backlog, Epic CRM-01): "Define CRM Schema Baseline" --
-- the 13 initial entities the backlog's own Section 7 sequence calls for next:
-- lead, opportunity, opportunity_stage, activity, interaction, conversation,
-- conversation_participant, channel_connection, follow_up, crm_note, product_interest,
-- review_item, assignment.
--
-- Relationship to the existing crm.channels/crm.tickets/crm.channel_accounts/
-- crm.routing_rules schema (20260908130000_crm_schema.sql onward): per explicit user
-- decision recorded in docs/design/crm-backlog-audit.md, the backlog's provider-neutral
-- interaction/conversation model REPLACES the ticket-based model as the CRM's long-term
-- shape -- but that replacement happens incrementally, one backlog story at a time (e.g.
-- CRM-06.1 "Conversation Object" retires crm.tickets' grouping role, CRM-07.x retires
-- crm.channel_accounts), not as a single cutover here. This migration only adds the new
-- tables; it does not touch or drop any existing crm.* table, so every currently-working
-- feature (inbox, WhatsApp/Meta webhook verification, routing rules) keeps working
-- unmodified until its own replacement story lands. See the audit note for the full
-- reasoning and the story-by-story retirement plan.
--
-- Scope discipline (backlog Section 9 protocol, step 5 "implement only this story"): this
-- migration is schema-only. No contract functions, event publishing, RLS test files, or
-- UI are added here -- those are CRM-01.3/01.4/01.5/01.6 and beyond. Columns are the
-- "minimum" the backlog's own CRM-01.2 acceptance criteria + the fields explicitly listed
-- for CRM-01.5's interaction model call for; fields introduced by later stories (e.g.
-- CRM-04.3's opportunity value/probability/close date, CRM-05.5's SLA config) are left for
-- those stories rather than spec'd speculatively now.
--
-- Reuse over duplication (Section 4's reuse map): `crm.interaction.content_reference`
-- points at `core.messages` (already the platform's one shared message store, S-3/F-11) --
-- CRM does not get its own copy of message bodies. `crm.product_interest.item_id` points
-- at `core.items` directly -- no second product catalog. Party identity is always
-- `core.parties` -- no second customer master. `owner_id`/`assigned_to`/`assigned_by`
-- point at `core.employees`, mirroring every other module's own ownership columns.
--
-- Cross-tenant reference enforcement follows the exact pattern already established by
-- 20260908130000_crm_schema.sql (crm.enforce_channel_business_id et al) and
-- 20260908100000_core_messages.sql (core.enforce_message_thread_business_id): every
-- foreign-business-owned reference gets a dedicated `enforce_*_business_id()` helper the
-- owning table's own `before insert or update` trigger calls, so a bug can never smuggle
-- another business's row in behind this business's own business_id. Two existing helpers
-- (`crm.enforce_party_business_id`, `crm.enforce_employee_business_id`) are reused as-is.
--
-- RLS is the same `tenant AND licensed` shape every other crm.* table already has
-- (ADR-4, ADR-8): read follows `core.licensed_business_ids('crm')` (active OR grace),
-- writes follow `core.write_licensed_business_ids('crm')` (active only).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type crm.channel_type as enum (
  'whatsapp', 'instagram', 'facebook_messenger', 'google_business_messages',
  'email', 'sms', 'website', 'manual', 'other'
);

-- CRM-02.4's exact source-attribution list.
create type crm.source_channel as enum (
  'discovery', 'whatsapp', 'instagram', 'facebook', 'google', 'website',
  'referral', 'manual', 'fsm', 'existing_customer', 'other'
);

-- CRM-04.1's default states plus its named additional states.
create type crm.lead_status as enum (
  'new', 'contacted', 'engaged', 'qualified', 'opportunity', 'won', 'lost',
  'nurture', 'unresponsive', 'disqualified'
);

create type crm.opportunity_status as enum ('open', 'won', 'lost');

-- CRM-05.1's activity type list.
create type crm.activity_type as enum (
  'call', 'meeting', 'note', 'email', 'whatsapp', 'social', 'task',
  'follow_up', 'quote_follow_up', 'service_follow_up'
);

create type crm.interaction_direction as enum ('inbound', 'outbound');
create type crm.interaction_status as enum ('received', 'processing', 'responded', 'failed', 'ignored');

-- CRM-06.1's exact conversation status list.
create type crm.conversation_status as enum ('new', 'open', 'waiting', 'resolved');

-- CRM-15.5's exact required integration-failure states.
create type crm.channel_connection_status as enum (
  'connected', 'degraded', 'reauthorization_required', 'disconnected', 'provider_error'
);

create type crm.follow_up_status as enum ('pending', 'completed', 'snoozed', 'cancelled');
create type crm.review_item_status as enum ('new', 'in_progress', 'responded', 'dismissed');
create type crm.assignable_entity as enum ('lead', 'opportunity', 'conversation');

-- ---------------------------------------------------------------------------
-- Tables (dependency order)
-- ---------------------------------------------------------------------------

-- CRM-04.2: "Stage configuration stored at business level." Seeding a business's default
-- stage set is that story's own concern, not this schema-baseline one -- stage_id is
-- nullable on crm.opportunity below until it exists.
create table crm.opportunity_stage (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  key text not null,
  name text not null,
  sort_order integer not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, key)
);

create table crm.lead (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  party_id uuid not null references core.parties (id) on delete cascade,
  status crm.lead_status not null default 'new',
  source crm.source_channel not null default 'manual',
  -- CRM-03.1's "original Discovery reference remains traceable" -- generic
  -- module+opaque-reference pair, same shape crm.interaction below uses.
  source_module text,
  source_reference text,
  owner_id uuid references core.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table crm.opportunity (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  party_id uuid not null references core.parties (id) on delete cascade,
  lead_id uuid references crm.lead (id) on delete set null,
  stage_id uuid references crm.opportunity_stage (id) on delete set null,
  status crm.opportunity_status not null default 'open',
  source crm.source_channel not null default 'manual',
  owner_id uuid references core.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Supersedes crm.channel_accounts' role once CRM-07.x rebuilds the WhatsApp/Meta
-- connection flow on this table -- `provider` is free text (not an enum) specifically so
-- CRM-16.3 ("additional providers without changing core CRM tables") never needs a
-- migration just to add a BSP.
create table crm.channel_connection (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  channel crm.channel_type not null,
  provider text not null,
  external_account_id text not null,
  status crm.channel_connection_status not null default 'connected',
  access_token_encrypted text,
  refresh_token_encrypted text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, channel, provider, external_account_id)
);

-- CRM-06.1: "A conversation groups related interactions."
create table crm.conversation (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  party_id uuid references core.parties (id) on delete set null,
  primary_channel crm.channel_type not null,
  status crm.conversation_status not null default 'new',
  lead_id uuid references crm.lead (id) on delete set null,
  opportunity_id uuid references crm.opportunity (id) on delete set null,
  assigned_to uuid references core.employees (id) on delete set null,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table crm.conversation_participant (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  conversation_id uuid not null references crm.conversation (id) on delete cascade,
  party_id uuid references core.parties (id) on delete set null,
  external_actor_id text,
  role text not null default 'contact',
  created_at timestamptz not null default now(),
  constraint conversation_participant_identity_present
    check (party_id is not null or external_actor_id is not null)
);

-- CRM-01.5's provider-neutral interaction model, fields exactly as specified.
create table crm.interaction (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  conversation_id uuid not null references crm.conversation (id) on delete cascade,
  party_id uuid references core.parties (id) on delete set null,
  channel crm.channel_type not null,
  external_actor_id text,
  external_message_id text,
  direction crm.interaction_direction not null,
  interaction_type text not null default 'message',
  occurred_at timestamptz not null default now(),
  -- Points at the platform's one shared message store (core.messages, S-3) rather than
  -- CRM keeping its own copy of message bodies -- content_excerpt below is a cached
  -- display value only, per Section 4's "references and cached display values" rule.
  content_reference uuid references core.messages (id) on delete set null,
  content_excerpt text,
  media_reference text,
  status crm.interaction_status not null default 'received',
  requires_response boolean not null default false,
  response_due_at timestamptz,
  responded_at timestamptz,
  intent text,
  intent_confidence numeric(4, 3),
  sentiment text,
  source_module text,
  source_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CRM-01.6: "provider + external_message_id is idempotent where available" -- `channel`
-- is this table's provider-identifying field (interaction has no separate provider
-- column; channel_connection.provider is the vendor detail, out of scope for identifying
-- a specific inbound message). Partial index: most interactions (outbound, manual) have
-- no external_message_id at all and must not collide on that account.
create unique index interaction_channel_external_message_id_uq
  on crm.interaction (business_id, channel, external_message_id)
  where external_message_id is not null;

-- CRM-05.1: "Activity can be attached to party, lead, opportunity or conversation."
create table crm.activity (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  type crm.activity_type not null,
  subject text,
  body text,
  party_id uuid references core.parties (id) on delete set null,
  lead_id uuid references crm.lead (id) on delete set null,
  opportunity_id uuid references crm.opportunity (id) on delete set null,
  conversation_id uuid references crm.conversation (id) on delete set null,
  owner_id uuid references core.employees (id) on delete set null,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_attached_to_something
    check (party_id is not null or lead_id is not null or opportunity_id is not null or conversation_id is not null)
);

create table crm.follow_up (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  party_id uuid references core.parties (id) on delete set null,
  lead_id uuid references crm.lead (id) on delete set null,
  opportunity_id uuid references crm.opportunity (id) on delete set null,
  conversation_id uuid references crm.conversation (id) on delete set null,
  activity_id uuid references crm.activity (id) on delete set null,
  owner_id uuid references core.employees (id) on delete set null,
  due_at timestamptz not null,
  status crm.follow_up_status not null default 'pending',
  snoozed_until timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table crm.crm_note (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  party_id uuid references core.parties (id) on delete set null,
  lead_id uuid references crm.lead (id) on delete set null,
  opportunity_id uuid references crm.opportunity (id) on delete set null,
  conversation_id uuid references crm.conversation (id) on delete set null,
  author_id uuid references core.employees (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CRM-10.1: associates a core.items reference to lead/opportunity/conversation/
-- interaction -- no duplicate product catalog (Section 4).
create table crm.product_interest (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  party_id uuid references core.parties (id) on delete set null,
  lead_id uuid references crm.lead (id) on delete set null,
  opportunity_id uuid references crm.opportunity (id) on delete set null,
  conversation_id uuid references crm.conversation (id) on delete set null,
  interaction_id uuid references crm.interaction (id) on delete set null,
  item_id uuid not null references core.items (id) on delete cascade,
  quantity numeric(14, 2),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CRM-08.9's Google content-retention guard: content_retention_expires_at exists from the
-- start so the eventual cleanup job (that story's own concern) has a column to act on.
create table crm.review_item (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  channel_connection_id uuid references crm.channel_connection (id) on delete set null,
  party_id uuid references core.parties (id) on delete set null,
  provider text not null,
  external_review_id text not null,
  rating integer,
  comment_excerpt text,
  reviewer_name text,
  occurred_at timestamptz not null,
  status crm.review_item_status not null default 'new',
  content_retention_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider, external_review_id)
);

-- CRM-05.4/CRM-06.3: an append-only assignment history/audit trail. "Current" owner is
-- read from the owning table's own owner_id/assigned_to column (fast path); this table
-- answers "who changed it and when" (Definition of Done's audit requirement). entity_id
-- is a bare polymorphic reference, same pattern core.threads.entity_id/core.attachments
-- already use -- no single real FK target exists across lead/opportunity/conversation.
create table crm.assignment (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  entity_type crm.assignable_entity not null,
  entity_id uuid not null,
  owner_id uuid not null references core.employees (id) on delete cascade,
  assigned_by uuid references core.employees (id) on delete set null,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index opportunity_stage_business_id_idx on crm.opportunity_stage (business_id);

create index lead_business_id_idx on crm.lead (business_id);
create index lead_party_id_idx on crm.lead (party_id);
create index lead_owner_id_idx on crm.lead (owner_id);

create index opportunity_business_id_idx on crm.opportunity (business_id);
create index opportunity_party_id_idx on crm.opportunity (party_id);
create index opportunity_lead_id_idx on crm.opportunity (lead_id);
create index opportunity_stage_id_idx on crm.opportunity (stage_id);
create index opportunity_owner_id_idx on crm.opportunity (owner_id);

create index channel_connection_business_id_idx on crm.channel_connection (business_id);

create index conversation_business_id_idx on crm.conversation (business_id);
create index conversation_party_id_idx on crm.conversation (party_id);
create index conversation_lead_id_idx on crm.conversation (lead_id);
create index conversation_opportunity_id_idx on crm.conversation (opportunity_id);
create index conversation_assigned_to_idx on crm.conversation (assigned_to);

create index conversation_participant_business_id_idx on crm.conversation_participant (business_id);
create index conversation_participant_conversation_id_idx on crm.conversation_participant (conversation_id);

create index interaction_business_id_idx on crm.interaction (business_id);
create index interaction_conversation_id_idx on crm.interaction (conversation_id);
create index interaction_party_id_idx on crm.interaction (party_id);
create index interaction_requires_response_idx on crm.interaction (business_id) where requires_response;

create index activity_business_id_idx on crm.activity (business_id);
create index activity_party_id_idx on crm.activity (party_id);
create index activity_lead_id_idx on crm.activity (lead_id);
create index activity_opportunity_id_idx on crm.activity (opportunity_id);
create index activity_conversation_id_idx on crm.activity (conversation_id);
create index activity_owner_id_idx on crm.activity (owner_id);

create index follow_up_business_id_idx on crm.follow_up (business_id);
create index follow_up_owner_id_idx on crm.follow_up (owner_id);
create index follow_up_due_status_idx on crm.follow_up (business_id, status, due_at);

create index crm_note_business_id_idx on crm.crm_note (business_id);
create index crm_note_party_id_idx on crm.crm_note (party_id);

create index product_interest_business_id_idx on crm.product_interest (business_id);
create index product_interest_item_id_idx on crm.product_interest (item_id);

create index review_item_business_id_idx on crm.review_item (business_id);
create index review_item_channel_connection_id_idx on crm.review_item (channel_connection_id);

create index assignment_business_id_idx on crm.assignment (business_id);
create index assignment_entity_idx on crm.assignment (entity_type, entity_id);
create index assignment_owner_id_idx on crm.assignment (owner_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'opportunity_stage', 'lead', 'opportunity', 'channel_connection', 'conversation',
    'interaction', 'activity', 'follow_up', 'crm_note', 'product_interest', 'review_item'
  ]
  loop
    execute format(
      'create trigger %1$I_set_updated_at before update on crm.%1$I for each row execute function core.set_updated_at()',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Cross-tenant reference enforcement
-- ---------------------------------------------------------------------------

create function crm.enforce_lead_business_id(p_lead_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = crm as $$
declare v_actual uuid;
begin
  select business_id into v_actual from crm.lead where id = p_lead_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'lead_id % does not belong to business_id %', p_lead_id, p_business_id;
  end if;
end; $$;

create function crm.enforce_opportunity_business_id(p_opportunity_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = crm as $$
declare v_actual uuid;
begin
  select business_id into v_actual from crm.opportunity where id = p_opportunity_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'opportunity_id % does not belong to business_id %', p_opportunity_id, p_business_id;
  end if;
end; $$;

create function crm.enforce_opportunity_stage_business_id(p_stage_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = crm as $$
declare v_actual uuid;
begin
  select business_id into v_actual from crm.opportunity_stage where id = p_stage_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'stage_id % does not belong to business_id %', p_stage_id, p_business_id;
  end if;
end; $$;

create function crm.enforce_conversation_business_id(p_conversation_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = crm as $$
declare v_actual uuid;
begin
  select business_id into v_actual from crm.conversation where id = p_conversation_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'conversation_id % does not belong to business_id %', p_conversation_id, p_business_id;
  end if;
end; $$;

create function crm.enforce_channel_connection_business_id(p_channel_connection_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = crm as $$
declare v_actual uuid;
begin
  select business_id into v_actual from crm.channel_connection where id = p_channel_connection_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'channel_connection_id % does not belong to business_id %', p_channel_connection_id, p_business_id;
  end if;
end; $$;

create function crm.enforce_activity_business_id(p_activity_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = crm as $$
declare v_actual uuid;
begin
  select business_id into v_actual from crm.activity where id = p_activity_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'activity_id % does not belong to business_id %', p_activity_id, p_business_id;
  end if;
end; $$;

create function crm.enforce_interaction_business_id(p_interaction_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = crm as $$
declare v_actual uuid;
begin
  select business_id into v_actual from crm.interaction where id = p_interaction_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'interaction_id % does not belong to business_id %', p_interaction_id, p_business_id;
  end if;
end; $$;

create function crm.enforce_item_business_id(p_item_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = core as $$
declare v_actual uuid;
begin
  select business_id into v_actual from core.items where id = p_item_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'item_id % does not belong to business_id %', p_item_id, p_business_id;
  end if;
end; $$;

create function crm.enforce_lead_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  perform crm.enforce_party_business_id(new.party_id, new.business_id);
  if new.owner_id is not null then perform crm.enforce_employee_business_id(new.owner_id, new.business_id); end if;
  return new;
end; $$;
create trigger lead_enforce_refs before insert or update on crm.lead
  for each row execute function crm.enforce_lead_refs();

create function crm.enforce_opportunity_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  perform crm.enforce_party_business_id(new.party_id, new.business_id);
  if new.lead_id is not null then perform crm.enforce_lead_business_id(new.lead_id, new.business_id); end if;
  if new.stage_id is not null then perform crm.enforce_opportunity_stage_business_id(new.stage_id, new.business_id); end if;
  if new.owner_id is not null then perform crm.enforce_employee_business_id(new.owner_id, new.business_id); end if;
  return new;
end; $$;
create trigger opportunity_enforce_refs before insert or update on crm.opportunity
  for each row execute function crm.enforce_opportunity_refs();

create function crm.enforce_conversation_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  if new.party_id is not null then perform crm.enforce_party_business_id(new.party_id, new.business_id); end if;
  if new.lead_id is not null then perform crm.enforce_lead_business_id(new.lead_id, new.business_id); end if;
  if new.opportunity_id is not null then perform crm.enforce_opportunity_business_id(new.opportunity_id, new.business_id); end if;
  if new.assigned_to is not null then perform crm.enforce_employee_business_id(new.assigned_to, new.business_id); end if;
  return new;
end; $$;
create trigger conversation_enforce_refs before insert or update on crm.conversation
  for each row execute function crm.enforce_conversation_refs();

create function crm.enforce_conversation_participant_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  perform crm.enforce_conversation_business_id(new.conversation_id, new.business_id);
  if new.party_id is not null then perform crm.enforce_party_business_id(new.party_id, new.business_id); end if;
  return new;
end; $$;
create trigger conversation_participant_enforce_refs before insert or update on crm.conversation_participant
  for each row execute function crm.enforce_conversation_participant_refs();

create function crm.enforce_interaction_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  perform crm.enforce_conversation_business_id(new.conversation_id, new.business_id);
  if new.party_id is not null then perform crm.enforce_party_business_id(new.party_id, new.business_id); end if;
  return new;
end; $$;
create trigger interaction_enforce_refs before insert or update on crm.interaction
  for each row execute function crm.enforce_interaction_refs();

create function crm.enforce_activity_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  if new.party_id is not null then perform crm.enforce_party_business_id(new.party_id, new.business_id); end if;
  if new.lead_id is not null then perform crm.enforce_lead_business_id(new.lead_id, new.business_id); end if;
  if new.opportunity_id is not null then perform crm.enforce_opportunity_business_id(new.opportunity_id, new.business_id); end if;
  if new.conversation_id is not null then perform crm.enforce_conversation_business_id(new.conversation_id, new.business_id); end if;
  if new.owner_id is not null then perform crm.enforce_employee_business_id(new.owner_id, new.business_id); end if;
  return new;
end; $$;
create trigger activity_enforce_refs before insert or update on crm.activity
  for each row execute function crm.enforce_activity_refs();

create function crm.enforce_follow_up_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  if new.party_id is not null then perform crm.enforce_party_business_id(new.party_id, new.business_id); end if;
  if new.lead_id is not null then perform crm.enforce_lead_business_id(new.lead_id, new.business_id); end if;
  if new.opportunity_id is not null then perform crm.enforce_opportunity_business_id(new.opportunity_id, new.business_id); end if;
  if new.conversation_id is not null then perform crm.enforce_conversation_business_id(new.conversation_id, new.business_id); end if;
  if new.activity_id is not null then perform crm.enforce_activity_business_id(new.activity_id, new.business_id); end if;
  if new.owner_id is not null then perform crm.enforce_employee_business_id(new.owner_id, new.business_id); end if;
  return new;
end; $$;
create trigger follow_up_enforce_refs before insert or update on crm.follow_up
  for each row execute function crm.enforce_follow_up_refs();

create function crm.enforce_crm_note_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  if new.party_id is not null then perform crm.enforce_party_business_id(new.party_id, new.business_id); end if;
  if new.lead_id is not null then perform crm.enforce_lead_business_id(new.lead_id, new.business_id); end if;
  if new.opportunity_id is not null then perform crm.enforce_opportunity_business_id(new.opportunity_id, new.business_id); end if;
  if new.conversation_id is not null then perform crm.enforce_conversation_business_id(new.conversation_id, new.business_id); end if;
  if new.author_id is not null then perform crm.enforce_employee_business_id(new.author_id, new.business_id); end if;
  return new;
end; $$;
create trigger crm_note_enforce_refs before insert or update on crm.crm_note
  for each row execute function crm.enforce_crm_note_refs();

create function crm.enforce_product_interest_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  perform crm.enforce_item_business_id(new.item_id, new.business_id);
  if new.party_id is not null then perform crm.enforce_party_business_id(new.party_id, new.business_id); end if;
  if new.lead_id is not null then perform crm.enforce_lead_business_id(new.lead_id, new.business_id); end if;
  if new.opportunity_id is not null then perform crm.enforce_opportunity_business_id(new.opportunity_id, new.business_id); end if;
  if new.conversation_id is not null then perform crm.enforce_conversation_business_id(new.conversation_id, new.business_id); end if;
  if new.interaction_id is not null then perform crm.enforce_interaction_business_id(new.interaction_id, new.business_id); end if;
  return new;
end; $$;
create trigger product_interest_enforce_refs before insert or update on crm.product_interest
  for each row execute function crm.enforce_product_interest_refs();

create function crm.enforce_review_item_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  if new.channel_connection_id is not null then perform crm.enforce_channel_connection_business_id(new.channel_connection_id, new.business_id); end if;
  if new.party_id is not null then perform crm.enforce_party_business_id(new.party_id, new.business_id); end if;
  return new;
end; $$;
create trigger review_item_enforce_refs before insert or update on crm.review_item
  for each row execute function crm.enforce_review_item_refs();

create function crm.enforce_assignment_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  perform crm.enforce_employee_business_id(new.owner_id, new.business_id);
  if new.assigned_by is not null then perform crm.enforce_employee_business_id(new.assigned_by, new.business_id); end if;
  return new;
end; $$;
create trigger assignment_enforce_refs before insert or update on crm.assignment
  for each row execute function crm.enforce_assignment_refs();

-- ---------------------------------------------------------------------------
-- Row Level Security -- `tenant AND licensed` (ADR-4, ADR-8), identical shape to every
-- other crm.* table (20260908130000_crm_schema.sql's own header comment).
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'opportunity_stage', 'lead', 'opportunity', 'channel_connection', 'conversation',
    'conversation_participant', 'interaction', 'activity', 'follow_up', 'crm_note',
    'product_interest', 'review_item', 'assignment'
  ]
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
