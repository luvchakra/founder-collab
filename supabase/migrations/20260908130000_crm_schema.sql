-- Epic 6, story S-1: `crm` schema DDL (docs/plan/00-MASTER-PLAN.md §5's entity-ownership
-- map: "crm module: skeleton: channels, tickets, routing rules"). Structure-only, same
-- split `fsm_schema.sql` (F-1) used for `fsm`: no procedural layer, no dedicated
-- permissions beyond tenant+license RLS -- those come with whichever future story
-- builds the real unified-inbox feature (message ingestion, auto-routing, the CRM's own
-- read of `core.messages`) on top of this schema, not this skeleton story.
--
-- `party_id`/`assigned_to` are bare (no cross-schema FK, per this platform's non-
-- negotiable #1: cross-schema FKs point only into `core`) but still enforced by a
-- dedicated trigger, exactly mirroring `fsm.enforce_party_business_id()`/
-- `enforce_employee_business_id()` (F-1) -- `core.parties`/`core.employees` are core-owned
-- shared data every module reads directly, so each module keeps its own copy of this
-- check rather than importing another module's trigger function.

create schema if not exists crm;

create type crm.channel_kind as enum ('email', 'sms', 'whatsapp', 'social');
create type crm.ticket_status as enum ('open', 'pending', 'closed');

create table crm.channels (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  kind crm.channel_kind not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table crm.tickets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  channel_id uuid references crm.channels (id) on delete set null,
  party_id uuid references core.parties (id) on delete set null,
  assigned_to uuid references core.employees (id) on delete set null,
  subject text,
  status crm.ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table crm.routing_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  name text not null,
  channel_id uuid references crm.channels (id) on delete cascade,
  assign_to_employee_id uuid references core.employees (id) on delete set null,
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index channels_business_id_idx on crm.channels (business_id);
create index tickets_business_id_idx on crm.tickets (business_id);
create index routing_rules_business_id_idx on crm.routing_rules (business_id);

create trigger channels_set_updated_at before update on crm.channels
  for each row execute function core.set_updated_at();
create trigger tickets_set_updated_at before update on crm.tickets
  for each row execute function core.set_updated_at();
create trigger routing_rules_set_updated_at before update on crm.routing_rules
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cross-tenant reference enforcement -- same class of guard every other module-owned
-- table with a bare reference into `core` (or its own schema) already has.
-- ---------------------------------------------------------------------------

create function crm.enforce_channel_business_id(p_channel_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = crm as $$
declare v_actual uuid;
begin
  select business_id into v_actual from crm.channels where id = p_channel_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'channel_id % does not belong to business_id %', p_channel_id, p_business_id;
  end if;
end; $$;

create function crm.enforce_party_business_id(p_party_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = core as $$
declare v_actual uuid;
begin
  select business_id into v_actual from core.parties where id = p_party_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'party_id % does not belong to business_id %', p_party_id, p_business_id;
  end if;
end; $$;

create function crm.enforce_employee_business_id(p_employee_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = core as $$
declare v_actual uuid;
begin
  select business_id into v_actual from core.employees where id = p_employee_id;
  if v_actual is null or v_actual <> p_business_id then
    raise exception 'employee_id % does not belong to business_id %', p_employee_id, p_business_id;
  end if;
end; $$;

create function crm.enforce_tickets_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  if new.channel_id is not null then perform crm.enforce_channel_business_id(new.channel_id, new.business_id); end if;
  if new.party_id is not null then perform crm.enforce_party_business_id(new.party_id, new.business_id); end if;
  if new.assigned_to is not null then perform crm.enforce_employee_business_id(new.assigned_to, new.business_id); end if;
  return new;
end; $$;
create trigger tickets_enforce_refs before insert or update on crm.tickets
  for each row execute function crm.enforce_tickets_refs();

create function crm.enforce_routing_rules_refs() returns trigger language plpgsql security definer set search_path = crm as $$
begin
  if new.channel_id is not null then perform crm.enforce_channel_business_id(new.channel_id, new.business_id); end if;
  if new.assign_to_employee_id is not null then perform crm.enforce_employee_business_id(new.assign_to_employee_id, new.business_id); end if;
  return new;
end; $$;
create trigger routing_rules_enforce_refs before insert or update on crm.routing_rules
  for each row execute function crm.enforce_routing_rules_refs();

-- ---------------------------------------------------------------------------
-- Row Level Security -- `tenant AND licensed` (ADR-4, ADR-8), same pattern as every
-- other module schema in this platform: read follows `core.licensed_business_ids('crm')`
-- (active OR grace), writes follow `core.write_licensed_business_ids('crm')` (active
-- only). No dedicated permission check yet -- same "schema first, fine-grained
-- permissions with the real feature" split F-1 used for `fsm` (its own `opportunities.edit`
-- etc. didn't arrive until F-2 onward).
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['channels', 'tickets', 'routing_rules']
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
  end loop;
end $$;

-- Same three grants every other module schema needs (`crm` didn't exist before this
-- migration) -- see 20260907120000_grant_schema_privileges.sql's own docstring.
grant usage on schema crm to authenticated, service_role;
grant select, insert, update, delete on all tables in schema crm to authenticated, service_role;
alter default privileges in schema crm grant select, insert, update, delete on tables to authenticated, service_role;
grant execute on all functions in schema crm to service_role;
alter default privileges in schema crm grant execute on functions to service_role;

-- PostgREST exposed-schemas list -- see 20260907150000_gst_credentials_schema.sql's own
-- comment on this same gap for `gst`. Guarded by `if exists` for the local/CI harness,
-- which has no `authenticator` role at all.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_schemas = ''public, graphql_public, core, discovery, inventory, gst, fsm, crm''';
  end if;
end $$;
notify pgrst, 'reload config';
