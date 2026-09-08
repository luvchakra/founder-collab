-- S-3 (Epic 6): core.threads + core.messages + core.message_templates -- the shared
-- message store any module can read/write (00-MASTER-PLAN.md §5's entity-ownership map;
-- backlog's own framing: "discovery, FSM and CRM all read one message store").
--
-- Scoped to what FSM's Messages tab (F-11) and future CRM tickets actually need first --
-- a generic inbound/outbound message log against a polymorphic entity, plus reusable
-- templates. `discovery.messages`/`discovery.conversations` (D-1-era) are a genuinely
-- different, richer concept discovery already owns: AI-drafted outreach with a
-- classification/recommended_action/provider_message_id/draft-approved-sent workflow.
-- The backlog's own line ("migrate public.messages/conversations onto them") was written
-- before the `discovery` schema rename and before that AI-drafting shape existed in its
-- current form -- per explicit user decision, discovery's tables are left untouched.
-- "One message store" applies going forward to new consumers, not retroactively to a
-- working, tested feature.
--
-- Tenant-only RLS (business_id in core.user_business_ids()), no license gate at this
-- table -- same treatment core.tags/taggings/custom_field_defs/attachments (D-8) already
-- get: the message store itself isn't a licensed feature; whichever module reads/writes
-- it enforces its own license at the route/action layer (same as F-11 will do via `fsm`'s
-- own RLS on the job it's attached to).
--
-- entity_type/entity_id is a bare polymorphic reference (no FK), same pattern
-- core.attachments already uses -- a thread can be attached to a job, an opportunity, a
-- future CRM ticket, etc., none of which core can point a real FK at without importing
-- that module's own schema.

create table core.threads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  subject text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index threads_business_id_idx on core.threads (business_id);
create index threads_entity_idx on core.threads (entity_type, entity_id);

create table core.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  thread_id uuid not null references core.threads (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  channel text not null default 'email' check (channel in ('email', 'sms')),
  from_address text,
  to_address text,
  subject text,
  body text not null,
  status text not null default 'sent' check (status in ('draft', 'sent', 'delivered', 'failed', 'received')),
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index messages_business_id_idx on core.messages (business_id);
create index messages_thread_id_idx on core.messages (thread_id);

create table core.message_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  name text not null,
  subject text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create index message_templates_business_id_idx on core.message_templates (business_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger threads_set_updated_at
  before update on core.threads
  for each row execute function core.set_updated_at();

create trigger message_templates_set_updated_at
  before update on core.message_templates
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cross-tenant reference-smuggling enforcement -- core.messages.thread_id could
-- otherwise point at another business's thread while carrying this business's own
-- business_id, same class of gap every other child-of-parent table in this platform
-- guards against (core.document_lines.document_id, core.enforce_document_line_business_id()).
-- ---------------------------------------------------------------------------

create function core.enforce_message_thread_business_id()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  thread_business_id uuid;
begin
  select business_id into thread_business_id from core.threads where id = new.thread_id;
  if thread_business_id is null or thread_business_id <> new.business_id then
    raise exception 'thread_id % does not belong to business_id %', new.thread_id, new.business_id;
  end if;
  return new;
end;
$$;

create trigger messages_enforce_thread_business_id
  before insert or update on core.messages
  for each row execute function core.enforce_message_thread_business_id();

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant-only, no license gate (see header comment)
-- ---------------------------------------------------------------------------

alter table core.threads enable row level security;
alter table core.messages enable row level security;
alter table core.message_templates enable row level security;

create policy "members can view threads in their businesses"
  on core.threads for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create threads in their businesses"
  on core.threads for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update threads in their businesses"
  on core.threads for update
  using (business_id in (select core.user_business_ids()));

create policy "members can view messages in their businesses"
  on core.messages for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create messages in their businesses"
  on core.messages for insert
  with check (business_id in (select core.user_business_ids()));

create policy "members can view message templates in their businesses"
  on core.message_templates for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create message templates in their businesses"
  on core.message_templates for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update message templates in their businesses"
  on core.message_templates for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete message templates in their businesses"
  on core.message_templates for delete
  using (business_id in (select core.user_business_ids()));
