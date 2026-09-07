-- Epic 3, story D-2: core.addresses + core.tax_identities (00-MASTER-PLAN.md §5).
--
-- core.addresses covers billing/shipping/service addresses for a party -- "service"
-- addresses are Kickserv's "service locations": 02-FSM-PRD.md §6/§39 models the
-- customer/service-location hierarchy as one core.parties row with several
-- core.addresses(kind='service') rows, not as parent/child customer records. The
-- master plan's column note "(party_id, kind, geo point, parent_id)" is read here as
-- party_id itself being that "parent" reference (per the FSM PRD's own wording,
-- "addresses(kind='service', parent)" where parent = the owning party) rather than a
-- second, address-to-address hierarchy column -- no concrete consumer needs
-- address-to-address nesting yet, and CLAUDE.md says not to build ahead of a real need;
-- revisit if F-1 (FSM service locations) turns out to need one.
--
-- formatted/city/state/postal_code/country + latitude/longitude cover both ends of the
-- two known consumers: StockPilot's customers/suppliers just need one flat address
-- string (03-STOCKPILOT-MIGRATION.md's compat view selects `ba.formatted` directly as
-- `billing_address`), while FSM's service locations need geocoding so a map pin can be
-- rendered and GPS routing works (02-FSM-PRD.md §6).
--
-- core.tax_identities is a party's GSTIN + registration type, one place inventory/fsm/gst
-- can read to compute CGST/SGST/IGST splits (master plan §5). Columns mirror
-- core.business_settings' own gstin/state/gst_registration_type (C-2) for naming
-- consistency within this schema -- the migration plan's compat-view sketch used
-- `state_code` for the equivalent column, but business_settings (already shipped)
-- calls it `state`, and per this repo's CLAUDE.md the live, already-shipped schema wins
-- over the planning doc's sketch.

create table core.addresses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  party_id uuid not null references core.parties (id) on delete cascade,
  kind text not null check (kind in ('billing', 'shipping', 'service')),
  is_primary boolean not null default false,
  formatted text,
  city text,
  state text,
  postal_code text,
  country text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index addresses_business_id_idx on core.addresses (business_id);
create index addresses_party_id_idx on core.addresses (party_id);

-- At most one primary address per party per kind -- the compat views this story exists
-- to support (SP-4) join on `party_id, kind, is_primary` expecting zero-or-one row.
create unique index addresses_one_primary_per_kind
  on core.addresses (party_id, kind)
  where is_primary;

create trigger addresses_set_updated_at
  before update on core.addresses
  for each row execute function core.set_updated_at();

create trigger addresses_enforce_party_business_id
  before insert or update on core.addresses
  for each row execute function core.enforce_party_business_id();

create table core.tax_identities (
  party_id uuid primary key references core.parties (id) on delete cascade,
  business_id uuid not null references core.businesses (id) on delete cascade,
  gstin text,
  state text,
  gst_registration_type text not null default 'regular'
    check (gst_registration_type in ('regular', 'composition', 'unregistered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tax_identities_business_id_idx on core.tax_identities (business_id);

create trigger tax_identities_set_updated_at
  before update on core.tax_identities
  for each row execute function core.set_updated_at();

create trigger tax_identities_enforce_party_business_id
  before insert or update on core.tax_identities
  for each row execute function core.enforce_party_business_id();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table core.addresses enable row level security;
alter table core.tax_identities enable row level security;

create policy "members can view addresses in their businesses"
  on core.addresses for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create addresses in their businesses"
  on core.addresses for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update addresses in their businesses"
  on core.addresses for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete addresses in their businesses"
  on core.addresses for delete
  using (business_id in (select core.user_business_ids()));

create policy "members can view tax identities in their businesses"
  on core.tax_identities for select
  using (business_id in (select core.user_business_ids()));
create policy "members can create tax identities in their businesses"
  on core.tax_identities for insert
  with check (business_id in (select core.user_business_ids()));
create policy "members can update tax identities in their businesses"
  on core.tax_identities for update
  using (business_id in (select core.user_business_ids()));
create policy "members can delete tax identities in their businesses"
  on core.tax_identities for delete
  using (business_id in (select core.user_business_ids()));
