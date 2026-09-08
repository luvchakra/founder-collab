-- Epic 5, story F-1: `fsm` schema DDL (docs/plan/02-FSM-PRD.md §3) -- built fresh, not
-- ported (Kickserv is reference material only, per the PRD's own framing). Every table
-- carries its own `business_id` (even the pure join/child tables the PRD's own sketch
-- omits it from, e.g. `event_assignees`) so the same `tenant AND licensed` RLS pattern
-- SP-3a established for `inventory` applies directly to every table here, with no
-- derived-via-join RLS anywhere -- consistent with every other module schema in this
-- platform, and with `core.document_lines`/`inventory.stock_transfer_items` already
-- carrying a redundant `business_id` for the exact same reason.
--
-- Every FK that could smuggle another tenant's row into an FSM record (party_id,
-- service_address_id, primary_contact_id, service_type_id, item_id, employee_id, and
-- FSM's own self-references) gets a dedicated cross-tenant enforcement trigger, exactly
-- mirroring `inventory.enforce_warehouse_business_id()`/`enforce_item_business_id()`
-- (SP-3a) -- without it, business A's own authenticated member could wire a job's
-- `party_id` to business B's private party row and leak it straight into A's own UI.
-- This is the same attack surface `test-inventory-rls.mjs` already asserts against for
-- `inventory`, so `test-fsm-rls.mjs` (this story) asserts the same thing here.
--
-- Status/kind/source columns are real Postgres enums, not `text + check` -- these are
-- FSM-owned vocabularies with no cross-module extension need (unlike
-- `core.documents.status`, which SP-3a's own migration comment explains must stay
-- `text + check` specifically so FSM/GST could extend it without an ALTER TYPE; FSM's
-- own opportunity/job/event statuses have no such need, so they get the same real-enum
-- treatment SP-3a gave `inventory.movement_type`/`alert_status`/etc).
--
-- `core.documents`'s `doc_type` check already includes `'estimate'` (D-6) -- no ALTER
-- needed there. FSM's invoices/credit notes reuse inventory's existing
-- `core.number_sequences` scopes ('invoice'/'INV', 'credit_note'/'CN') rather than a
-- separate FSM-prefixed series: GST requires ONE continuous invoice number sequence per
-- business regardless of which module issued it, so sharing the scope (keyed only by
-- `business_id` + `scope` + `fiscal_year`, per D-5) is the correct behavior when a
-- business has both `inventory` and `fsm` licensed, not an oversight. New scopes:
-- 'job'/'JOB', 'opportunity'/'OPP', 'estimate'/'EST' -- FSM-only document kinds with no
-- existing analogue.
--
-- No procedural layer yet (status-transition functions, the discovery handoff consumer,
-- the inventory contract integration): those are F-2 through F-14, deliberately scoped
-- out of this DDL-only story, same split SP-3a/SP-3b used for `inventory`.

create schema if not exists fsm;

create type fsm.opportunity_source as enum ('manual', 'contact_form', 'discovery', 'import', 'api');
create type fsm.opportunity_status as enum ('new', 'estimate_scheduled', 'estimate_sent', 'won', 'lost');
create type fsm.job_status as enum ('unscheduled', 'scheduled', 'in_progress', 'on_hold', 'completed', 'cancelled');
create type fsm.event_kind as enum ('work', 'estimate', 'reminder');
create type fsm.event_status as enum ('scheduled', 'en_route', 'arrived', 'done', 'cancelled');
create type fsm.note_visibility as enum ('internal', 'customer');
create type fsm.work_request_status as enum ('new', 'converted', 'spam');
create type fsm.portal_token_scope as enum ('estimate', 'invoice', 'center');

-- ---------------------------------------------------------------------------
-- Configuration
-- ---------------------------------------------------------------------------

create table fsm.service_types (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create table fsm.job_charge_types (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create table fsm.settings (
  business_id uuid primary key references core.businesses (id) on delete cascade,
  reminder_lead_hours integer not null default 48,
  arrival_window_minutes integer not null default 120,
  auto_invoice_on_complete boolean not null default false,
  default_terms text,
  estimate_expiry_days integer,
  customer_center_enabled boolean not null default false,
  contact_form_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Pipeline -- opportunities and jobs reference each other (won -> converted_job_id,
-- job -> opportunity_id), so opportunities is created without that one FK and it's
-- added by ALTER TABLE once fsm.jobs exists below.
-- ---------------------------------------------------------------------------

create table fsm.opportunities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  number text,
  party_id uuid not null references core.parties (id) on delete restrict,
  primary_contact_id uuid references core.party_contacts (id) on delete set null,
  service_address_id uuid references core.addresses (id) on delete set null,
  service_type_id uuid references fsm.service_types (id) on delete set null,
  description text,
  scope_of_work text,
  source fsm.opportunity_source not null default 'manual',
  -- Bare uuid, no FK -- discovery.prospects lives in another module's schema, and
  -- CLAUDE.md non-negotiable #1 restricts cross-schema FKs to `core` only. Matches the
  -- existing precedent of `inventory.alerts.entity_id` (a polymorphic/cross-module
  -- reference with no formal FK). Resolved and validated in application code by F-13's
  -- discovery handoff consumer, not by the database.
  source_prospect_id uuid,
  status fsm.opportunity_status not null default 'new',
  lost_reason text,
  -- Also bare/no-FK, same reasoning as source_prospect_id -- a discovery marketing
  -- source, not a core-owned concept.
  marketing_source_id uuid,
  converted_job_id uuid,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'lost' or lost_reason is not null)
);

create index opportunities_business_id_idx on fsm.opportunities (business_id);
create index opportunities_party_id_idx on fsm.opportunities (party_id);
create unique index opportunities_business_id_number_key on fsm.opportunities (business_id, number) where number is not null;

create table fsm.jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  number text,
  opportunity_id uuid references fsm.opportunities (id) on delete set null,
  party_id uuid not null references core.parties (id) on delete restrict,
  primary_contact_id uuid references core.party_contacts (id) on delete set null,
  service_address_id uuid references core.addresses (id) on delete set null,
  service_type_id uuid references fsm.service_types (id) on delete set null,
  description text,
  scope_of_work text,
  status fsm.job_status not null default 'unscheduled',
  started_at timestamptz,
  completed_at timestamptz,
  on_hold_reason text,
  recurring_template_id uuid,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_business_id_idx on fsm.jobs (business_id);
create index jobs_opportunity_id_idx on fsm.jobs (opportunity_id);
create index jobs_party_id_idx on fsm.jobs (party_id);
create unique index jobs_business_id_number_key on fsm.jobs (business_id, number) where number is not null;

alter table fsm.opportunities
  add constraint opportunities_converted_job_id_fkey
  foreign key (converted_job_id) references fsm.jobs (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Events -- one calendar table, three kinds (Kickserv's own model, PRD §1)
-- ---------------------------------------------------------------------------

create table fsm.events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  kind fsm.event_kind not null,
  job_id uuid references fsm.jobs (id) on delete cascade,
  opportunity_id uuid references fsm.opportunities (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  description text,
  status fsm.event_status not null default 'scheduled',
  arrival_window_start timestamptz,
  arrival_window_end timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (job_id is not null or opportunity_id is not null),
  check (ends_at is null or ends_at >= starts_at)
);

create index events_business_id_idx on fsm.events (business_id);
create index events_job_id_idx on fsm.events (job_id) where job_id is not null;
create index events_opportunity_id_idx on fsm.events (opportunity_id) where opportunity_id is not null;
create index events_starts_at_idx on fsm.events (business_id, starts_at);

create table fsm.event_assignees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  event_id uuid not null references fsm.events (id) on delete cascade,
  employee_id uuid not null references core.employees (id) on delete cascade,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, employee_id)
);

create index event_assignees_business_id_idx on fsm.event_assignees (business_id);
create index event_assignees_employee_id_idx on fsm.event_assignees (employee_id);

-- ---------------------------------------------------------------------------
-- Execution
-- ---------------------------------------------------------------------------

create table fsm.time_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  job_id uuid not null references fsm.jobs (id) on delete cascade,
  employee_id uuid not null references core.employees (id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes numeric(10, 2) generated always as (
    case when ended_at is null then null
    else extract(epoch from (ended_at - started_at)) / 60.0 end
  ) stored,
  is_billable boolean not null default true,
  hourly_rate numeric(12, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create index time_entries_business_id_idx on fsm.time_entries (business_id);
create index time_entries_job_id_idx on fsm.time_entries (job_id);
create index time_entries_employee_id_idx on fsm.time_entries (employee_id);
-- One open (not-yet-clocked-out) entry per employee at a time, matching Kickserv's own
-- "keeps running when the app is closed" framing (PRD §1.8) -- a tech can't be clocked
-- into two jobs simultaneously.
create unique index time_entries_one_open_per_employee on fsm.time_entries (employee_id) where ended_at is null;

create table fsm.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  job_id uuid not null references fsm.jobs (id) on delete cascade,
  vendor_party_id uuid references core.parties (id) on delete set null,
  item_id uuid references core.items (id) on delete set null,
  description text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  incurred_on date not null default current_date,
  employee_id uuid references core.employees (id) on delete set null,
  attachment_id uuid references core.attachments (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_business_id_idx on fsm.expenses (business_id);
create index expenses_job_id_idx on fsm.expenses (job_id);

create table fsm.notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  job_id uuid references fsm.jobs (id) on delete cascade,
  opportunity_id uuid references fsm.opportunities (id) on delete cascade,
  body text not null,
  visibility fsm.note_visibility not null default 'internal',
  author_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  check (job_id is not null or opportunity_id is not null)
);

create index notes_business_id_idx on fsm.notes (business_id);
create index notes_job_id_idx on fsm.notes (job_id) where job_id is not null;
create index notes_opportunity_id_idx on fsm.notes (opportunity_id) where opportunity_id is not null;

create table fsm.signatures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  document_id uuid references core.documents (id) on delete cascade,
  job_id uuid references fsm.jobs (id) on delete cascade,
  signer_name text not null,
  signed_at timestamptz not null default now(),
  image_attachment_id uuid references core.attachments (id) on delete set null,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now(),
  check (document_id is not null or job_id is not null)
);

create index signatures_business_id_idx on fsm.signatures (business_id);
create index signatures_document_id_idx on fsm.signatures (document_id) where document_id is not null;
create index signatures_job_id_idx on fsm.signatures (job_id) where job_id is not null;

create table fsm.recurring_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  party_id uuid not null references core.parties (id) on delete cascade,
  service_type_id uuid references fsm.service_types (id) on delete set null,
  rrule text not null,
  scope_of_work text,
  next_run_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recurring_templates_business_id_idx on fsm.recurring_templates (business_id);

alter table fsm.jobs
  add constraint jobs_recurring_template_id_fkey
  foreign key (recurring_template_id) references fsm.recurring_templates (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Customer-facing
-- ---------------------------------------------------------------------------

create table fsm.portal_tokens (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  party_id uuid not null references core.parties (id) on delete cascade,
  token_hash text not null,
  scope fsm.portal_token_scope not null,
  document_id uuid references core.documents (id) on delete cascade,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (token_hash)
);

create index portal_tokens_business_id_idx on fsm.portal_tokens (business_id);
create index portal_tokens_party_id_idx on fsm.portal_tokens (party_id);

create table fsm.work_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  raw jsonb not null default '{}'::jsonb,
  name text,
  email text,
  phone text,
  address_text text,
  message text,
  custom_values jsonb not null default '{}'::jsonb,
  status fsm.work_request_status not null default 'new',
  opportunity_id uuid references fsm.opportunities (id) on delete set null,
  created_at timestamptz not null default now()
);

create index work_requests_business_id_idx on fsm.work_requests (business_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers -- reuses core.set_updated_at() (C-1), same as every other schema
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'service_types', 'job_charge_types', 'settings', 'opportunities', 'jobs', 'events',
    'time_entries', 'expenses', 'notes', 'recurring_templates'
  ]
  loop
    execute format(
      'create trigger %1$s_set_updated_at before update on fsm.%1$I for each row execute function core.set_updated_at()',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Cross-tenant reference enforcement -- one dedicated check function per referenced
-- table, exactly mirroring `inventory.enforce_warehouse_business_id()`/
-- `enforce_item_business_id()` (SP-3a). Without these, a business's own authenticated
-- member could wire e.g. a job's `party_id` to a DIFFERENT business's private party row
-- and leak it straight into their own UI via an ordinary join -- RLS on `fsm.jobs`
-- itself doesn't catch this, since the member really does own the job row; it's the
-- *reference* that would point cross-tenant. `core.items`' own check is written fresh
-- here against `core.items` directly rather than reusing `inventory.enforce_item_
-- business_id()` -- calling into another module's schema from FSM's own triggers would
-- be exactly the kind of module-to-module coupling CLAUDE.md non-negotiable #3 bans at
-- the application layer; `core.items` is core-owned shared data both modules may read
-- directly, so each module keeps its own copy of this one check.
-- ---------------------------------------------------------------------------

create function fsm.enforce_party_business_id(p_party_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = core as $$
declare v_actual uuid;
begin
  select business_id into v_actual from core.parties where id = p_party_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'party_id % does not belong to business_id %', p_party_id, p_business_id;
  end if;
end; $$;

create function fsm.enforce_party_contact_business_id(p_contact_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = core as $$
declare v_actual uuid;
begin
  select business_id into v_actual from core.party_contacts where id = p_contact_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'primary_contact_id % does not belong to business_id %', p_contact_id, p_business_id;
  end if;
end; $$;

create function fsm.enforce_address_business_id(p_address_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = core as $$
declare v_actual uuid;
begin
  select business_id into v_actual from core.addresses where id = p_address_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'service_address_id % does not belong to business_id %', p_address_id, p_business_id;
  end if;
end; $$;

create function fsm.enforce_item_business_id(p_item_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = core as $$
declare v_actual uuid;
begin
  select business_id into v_actual from core.items where id = p_item_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'item_id % does not belong to business_id %', p_item_id, p_business_id;
  end if;
end; $$;

create function fsm.enforce_document_business_id(p_document_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = core as $$
declare v_actual uuid;
begin
  select business_id into v_actual from core.documents where id = p_document_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'document_id % does not belong to business_id %', p_document_id, p_business_id;
  end if;
end; $$;

create function fsm.enforce_attachment_business_id(p_attachment_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = core as $$
declare v_actual uuid;
begin
  select business_id into v_actual from core.attachments where id = p_attachment_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'attachment_id % does not belong to business_id %', p_attachment_id, p_business_id;
  end if;
end; $$;

create function fsm.enforce_employee_business_id(p_employee_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = core as $$
declare v_actual uuid;
begin
  select business_id into v_actual from core.employees where id = p_employee_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'employee_id % does not belong to business_id %', p_employee_id, p_business_id;
  end if;
end; $$;

create function fsm.enforce_service_type_business_id(p_service_type_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = fsm as $$
declare v_actual uuid;
begin
  select business_id into v_actual from fsm.service_types where id = p_service_type_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'service_type_id % does not belong to business_id %', p_service_type_id, p_business_id;
  end if;
end; $$;

create function fsm.enforce_opportunity_business_id(p_opportunity_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = fsm as $$
declare v_actual uuid;
begin
  select business_id into v_actual from fsm.opportunities where id = p_opportunity_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'opportunity_id % does not belong to business_id %', p_opportunity_id, p_business_id;
  end if;
end; $$;

create function fsm.enforce_job_business_id(p_job_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = fsm as $$
declare v_actual uuid;
begin
  select business_id into v_actual from fsm.jobs where id = p_job_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'job_id % does not belong to business_id %', p_job_id, p_business_id;
  end if;
end; $$;

create function fsm.enforce_event_business_id(p_event_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = fsm as $$
declare v_actual uuid;
begin
  select business_id into v_actual from fsm.events where id = p_event_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'event_id % does not belong to business_id %', p_event_id, p_business_id;
  end if;
end; $$;

create function fsm.enforce_recurring_template_business_id(p_template_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = fsm as $$
declare v_actual uuid;
begin
  select business_id into v_actual from fsm.recurring_templates where id = p_template_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'recurring_template_id % does not belong to business_id %', p_template_id, p_business_id;
  end if;
end; $$;

-- Per-table trigger functions -- each calls the relevant checks above, skipping any
-- reference column that's null on this row.

create function fsm.enforce_opportunities_refs() returns trigger language plpgsql security definer set search_path = fsm as $$
begin
  perform fsm.enforce_party_business_id(new.party_id, new.business_id);
  if new.primary_contact_id is not null then perform fsm.enforce_party_contact_business_id(new.primary_contact_id, new.business_id); end if;
  if new.service_address_id is not null then perform fsm.enforce_address_business_id(new.service_address_id, new.business_id); end if;
  if new.service_type_id is not null then perform fsm.enforce_service_type_business_id(new.service_type_id, new.business_id); end if;
  if new.converted_job_id is not null then perform fsm.enforce_job_business_id(new.converted_job_id, new.business_id); end if;
  return new;
end; $$;
create trigger opportunities_enforce_refs before insert or update on fsm.opportunities
  for each row execute function fsm.enforce_opportunities_refs();

create function fsm.enforce_jobs_refs() returns trigger language plpgsql security definer set search_path = fsm as $$
begin
  perform fsm.enforce_party_business_id(new.party_id, new.business_id);
  if new.primary_contact_id is not null then perform fsm.enforce_party_contact_business_id(new.primary_contact_id, new.business_id); end if;
  if new.service_address_id is not null then perform fsm.enforce_address_business_id(new.service_address_id, new.business_id); end if;
  if new.service_type_id is not null then perform fsm.enforce_service_type_business_id(new.service_type_id, new.business_id); end if;
  if new.opportunity_id is not null then perform fsm.enforce_opportunity_business_id(new.opportunity_id, new.business_id); end if;
  if new.recurring_template_id is not null then perform fsm.enforce_recurring_template_business_id(new.recurring_template_id, new.business_id); end if;
  return new;
end; $$;
create trigger jobs_enforce_refs before insert or update on fsm.jobs
  for each row execute function fsm.enforce_jobs_refs();

create function fsm.enforce_events_refs() returns trigger language plpgsql security definer set search_path = fsm as $$
begin
  if new.job_id is not null then perform fsm.enforce_job_business_id(new.job_id, new.business_id); end if;
  if new.opportunity_id is not null then perform fsm.enforce_opportunity_business_id(new.opportunity_id, new.business_id); end if;
  return new;
end; $$;
create trigger events_enforce_refs before insert or update on fsm.events
  for each row execute function fsm.enforce_events_refs();

create function fsm.enforce_event_assignees_refs() returns trigger language plpgsql security definer set search_path = fsm as $$
begin
  perform fsm.enforce_event_business_id(new.event_id, new.business_id);
  perform fsm.enforce_employee_business_id(new.employee_id, new.business_id);
  return new;
end; $$;
create trigger event_assignees_enforce_refs before insert or update on fsm.event_assignees
  for each row execute function fsm.enforce_event_assignees_refs();

create function fsm.enforce_time_entries_refs() returns trigger language plpgsql security definer set search_path = fsm as $$
begin
  perform fsm.enforce_job_business_id(new.job_id, new.business_id);
  perform fsm.enforce_employee_business_id(new.employee_id, new.business_id);
  return new;
end; $$;
create trigger time_entries_enforce_refs before insert or update on fsm.time_entries
  for each row execute function fsm.enforce_time_entries_refs();

create function fsm.enforce_expenses_refs() returns trigger language plpgsql security definer set search_path = fsm as $$
begin
  perform fsm.enforce_job_business_id(new.job_id, new.business_id);
  if new.vendor_party_id is not null then perform fsm.enforce_party_business_id(new.vendor_party_id, new.business_id); end if;
  if new.item_id is not null then perform fsm.enforce_item_business_id(new.item_id, new.business_id); end if;
  if new.employee_id is not null then perform fsm.enforce_employee_business_id(new.employee_id, new.business_id); end if;
  if new.attachment_id is not null then perform fsm.enforce_attachment_business_id(new.attachment_id, new.business_id); end if;
  return new;
end; $$;
create trigger expenses_enforce_refs before insert or update on fsm.expenses
  for each row execute function fsm.enforce_expenses_refs();

create function fsm.enforce_notes_refs() returns trigger language plpgsql security definer set search_path = fsm as $$
begin
  if new.job_id is not null then perform fsm.enforce_job_business_id(new.job_id, new.business_id); end if;
  if new.opportunity_id is not null then perform fsm.enforce_opportunity_business_id(new.opportunity_id, new.business_id); end if;
  return new;
end; $$;
create trigger notes_enforce_refs before insert or update on fsm.notes
  for each row execute function fsm.enforce_notes_refs();

create function fsm.enforce_signatures_refs() returns trigger language plpgsql security definer set search_path = fsm as $$
begin
  if new.document_id is not null then perform fsm.enforce_document_business_id(new.document_id, new.business_id); end if;
  if new.job_id is not null then perform fsm.enforce_job_business_id(new.job_id, new.business_id); end if;
  if new.image_attachment_id is not null then perform fsm.enforce_attachment_business_id(new.image_attachment_id, new.business_id); end if;
  return new;
end; $$;
create trigger signatures_enforce_refs before insert or update on fsm.signatures
  for each row execute function fsm.enforce_signatures_refs();

create function fsm.enforce_recurring_templates_refs() returns trigger language plpgsql security definer set search_path = fsm as $$
begin
  perform fsm.enforce_party_business_id(new.party_id, new.business_id);
  if new.service_type_id is not null then perform fsm.enforce_service_type_business_id(new.service_type_id, new.business_id); end if;
  return new;
end; $$;
create trigger recurring_templates_enforce_refs before insert or update on fsm.recurring_templates
  for each row execute function fsm.enforce_recurring_templates_refs();

create function fsm.enforce_portal_tokens_refs() returns trigger language plpgsql security definer set search_path = fsm as $$
begin
  perform fsm.enforce_party_business_id(new.party_id, new.business_id);
  if new.document_id is not null then perform fsm.enforce_document_business_id(new.document_id, new.business_id); end if;
  return new;
end; $$;
create trigger portal_tokens_enforce_refs before insert or update on fsm.portal_tokens
  for each row execute function fsm.enforce_portal_tokens_refs();

create function fsm.enforce_work_requests_refs() returns trigger language plpgsql security definer set search_path = fsm as $$
begin
  if new.opportunity_id is not null then perform fsm.enforce_opportunity_business_id(new.opportunity_id, new.business_id); end if;
  return new;
end; $$;
create trigger work_requests_enforce_refs before insert or update on fsm.work_requests
  for each row execute function fsm.enforce_work_requests_refs();

-- ---------------------------------------------------------------------------
-- Row Level Security -- `tenant AND licensed` (ADR-4, ADR-8), same pattern as
-- `inventory` (SP-3a): read follows `core.licensed_business_ids('fsm')` (active OR
-- grace), writes follow `core.write_licensed_business_ids('fsm')` (active only).
-- `fsm.settings` is included in the same loop despite being keyed by `business_id`
-- directly (not a separate `id`) -- the policies only ever filter on `business_id`, so
-- the generated SQL is identical either way.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'service_types', 'job_charge_types', 'settings', 'opportunities', 'jobs', 'events',
    'event_assignees', 'time_entries', 'expenses', 'notes', 'signatures',
    'recurring_templates', 'portal_tokens', 'work_requests'
  ]
  loop
    execute format('alter table fsm.%1$I enable row level security', t);
    execute format(
      $sql$create policy "members can view %1$s in their licensed businesses"
        on fsm.%1$I for select
        using (
          business_id in (select core.user_business_ids())
          and business_id in (select core.licensed_business_ids('fsm'))
        )$sql$,
      t
    );
    execute format(
      $sql$create policy "members can create %1$s in their licensed businesses"
        on fsm.%1$I for insert
        with check (
          business_id in (select core.user_business_ids())
          and business_id in (select core.write_licensed_business_ids('fsm'))
        )$sql$,
      t
    );
    execute format(
      $sql$create policy "members can update %1$s in their licensed businesses"
        on fsm.%1$I for update
        using (
          business_id in (select core.user_business_ids())
          and business_id in (select core.write_licensed_business_ids('fsm'))
        )$sql$,
      t
    );
    execute format(
      $sql$create policy "members can delete %1$s in their licensed businesses"
        on fsm.%1$I for delete
        using (
          business_id in (select core.user_business_ids())
          and business_id in (select core.write_licensed_business_ids('fsm'))
        )$sql$,
      t
    );
  end loop;
end $$;

-- Matches 20260907120000_grant_schema_privileges.sql's own fix exactly (a schema this
-- platform's own migrations create gets no automatic PostgREST grant, unlike `public`) --
-- `fsm` didn't exist when that migration ran, so it must carry the same three grants
-- itself: schema USAGE, table privileges, and `alter default privileges` so every later
-- FSM story's own new tables (F-2 through F-15) inherit the grant without a fresh
-- statement each time. `service_role` needs this too, for the admin client (F-13's
-- discovery handoff consumer, F-14's inventory contract calls) and the domain-event
-- drain cron, same reasoning as that migration's own comment.
grant usage on schema fsm to authenticated, service_role;
grant select, insert, update, delete on all tables in schema fsm to authenticated, service_role;
alter default privileges in schema fsm grant select, insert, update, delete on tables to authenticated, service_role;

-- Matches 20260907140000_grant_function_execute_to_service_role.sql's own fix, for the
-- same reason and the same schema-didn't-exist-yet gap: `service_role`'s BYPASSRLS does
-- not imply function EXECUTE privilege, which is a separate Postgres mechanism.
grant execute on all functions in schema fsm to service_role;
alter default privileges in schema fsm grant execute on functions to service_role;

-- PostgREST only routes requests to schemas listed in the `authenticator` role's
-- pgrst.db_schemas setting (the Data API "Exposed schemas" list) -- see
-- 20260907150000_gst_credentials_schema.sql's own comment on this same gap for `gst`.
-- Appending `fsm` here so a fresh environment applying this whole timeline actually gets
-- it exposed too, not just a manual fix on this one project. Guarded by `if exists`
-- since the local test harness's throwaway databases have no `authenticator` role at all.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_schemas = ''public, graphql_public, core, discovery, inventory, gst, fsm''';
  end if;
end $$;
notify pgrst, 'reload config';
