-- Epic 3, story D-1: core.parties/party_roles/party_contacts/party_supplier_attrs --
-- the "any external company or person" model from 00-MASTER-PLAN.md §5, replacing the
-- prospect/customer/supplier triplication. One core.parties row can hold several
-- core.party_roles simultaneously (winning a discovery prospect adds the 'customer'
-- role to the same row rather than copying it -- that backfill is D-3, not this story).
--
-- Tenancy: business_id, not workspace_id -- ADR-4 (a business has one customer ledger
-- regardless of how many discovery workspaces/products it markets). Denormalized onto
-- every table here (not just parties), matching discovery.contacts' own precedent of
-- carrying workspace_id directly rather than joining through prospect_id for RLS.
--
-- No license check in these policies: parties/contacts are core-owned, cross-module data
-- (00-MASTER-PLAN.md §5 lists every consumer as "all"), not a single module's own schema
-- table -- ADR-8's `tenant AND licensed` requirement is for "every module table" (a
-- module's own schema), and the precedent already set by core.business_members/
-- business_settings/employees (C-2) is tenant-only RLS for this kind of shared core data.
--
-- party_supplier_attrs' columns (code, payment_terms, lead_time_days, rating) are ported
-- from stockpilot-ai-ops's live public.suppliers table (read directly, 2026-09-06) --
-- note 00-MASTER-PLAN.md §5 also lists a `min_order_quantity` supplier attr that does not
-- exist on the live table, so it is omitted here per CLAUDE.md's "never implement
-- speculative functionality" and the live-source-wins rule in this repo's own CLAUDE.md.

create table core.parties (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  kind text not null default 'company' check (kind in ('person', 'company')),
  name text not null,
  email text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index parties_business_id_idx on core.parties (business_id);

create trigger parties_set_updated_at
  before update on core.parties
  for each row execute function core.set_updated_at();

create table core.party_roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  party_id uuid not null references core.parties (id) on delete cascade,
  role text not null check (role in ('prospect', 'customer', 'supplier', 'vendor', 'lead')),
  created_at timestamptz not null default now(),
  unique (party_id, role)
);

create index party_roles_business_id_idx on core.party_roles (business_id);
create index party_roles_party_id_idx on core.party_roles (party_id);

create table core.party_contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  party_id uuid not null references core.parties (id) on delete cascade,
  first_name text,
  last_name text,
  job_title text,
  email text,
  phone text,
  linkedin_url text,
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index party_contacts_business_id_idx on core.party_contacts (business_id);
create index party_contacts_party_id_idx on core.party_contacts (party_id);

create trigger party_contacts_set_updated_at
  before update on core.party_contacts
  for each row execute function core.set_updated_at();

create table core.party_supplier_attrs (
  party_id uuid primary key references core.parties (id) on delete cascade,
  business_id uuid not null references core.businesses (id) on delete cascade,
  code text,
  payment_terms text,
  lead_time_days integer not null default 7,
  rating numeric(3, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index party_supplier_attrs_business_id_idx on core.party_supplier_attrs (business_id);

create trigger party_supplier_attrs_set_updated_at
  before update on core.party_supplier_attrs
  for each row execute function core.set_updated_at();

-- business_id is denormalized onto party_roles/party_contacts/party_supplier_attrs for
-- direct RLS filtering (see docstring above), but that leaves a gap RLS alone can't
-- close: RLS on insert only checks that the row's OWN business_id is one the caller
-- belongs to -- nothing stops a member of business B from inserting a party_roles row
-- with business_id=B (their own, passes the with-check) but party_id pointing at a
-- party that actually belongs to business A. SECURITY DEFINER so the lookup sees the
-- real party regardless of the caller's own row visibility -- otherwise a party the
-- caller can't see would resolve to NULL and silently pass the check.
create function core.enforce_party_business_id()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  actual_business_id uuid;
begin
  select business_id into actual_business_id from core.parties where id = new.party_id;
  if actual_business_id is null or actual_business_id <> new.business_id then
    raise exception 'party_id % does not belong to business_id %', new.party_id, new.business_id;
  end if;
  return new;
end;
$$;

create trigger party_roles_enforce_business_id
  before insert or update on core.party_roles
  for each row execute function core.enforce_party_business_id();
create trigger party_contacts_enforce_business_id
  before insert or update on core.party_contacts
  for each row execute function core.enforce_party_business_id();
create trigger party_supplier_attrs_enforce_business_id
  before insert or update on core.party_supplier_attrs
  for each row execute function core.enforce_party_business_id();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table core.parties enable row level security;
alter table core.party_roles enable row level security;
alter table core.party_contacts enable row level security;
alter table core.party_supplier_attrs enable row level security;

create policy "members can view parties in their businesses"
  on core.parties for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create parties in their businesses"
  on core.parties for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update parties in their businesses"
  on core.parties for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete parties in their businesses"
  on core.parties for delete
  using (business_id in (select core.user_business_ids()));

create policy "members can view party roles in their businesses"
  on core.party_roles for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create party roles in their businesses"
  on core.party_roles for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update party roles in their businesses"
  on core.party_roles for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete party roles in their businesses"
  on core.party_roles for delete
  using (business_id in (select core.user_business_ids()));

create policy "members can view party contacts in their businesses"
  on core.party_contacts for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create party contacts in their businesses"
  on core.party_contacts for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update party contacts in their businesses"
  on core.party_contacts for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete party contacts in their businesses"
  on core.party_contacts for delete
  using (business_id in (select core.user_business_ids()));

create policy "members can view party supplier attrs in their businesses"
  on core.party_supplier_attrs for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create party supplier attrs in their businesses"
  on core.party_supplier_attrs for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update party supplier attrs in their businesses"
  on core.party_supplier_attrs for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete party supplier attrs in their businesses"
  on core.party_supplier_attrs for delete
  using (business_id in (select core.user_business_ids()));
