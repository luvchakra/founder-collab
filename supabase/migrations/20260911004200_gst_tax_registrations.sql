-- WonderArc Compliance backlog, COMPLY-P0-02.1 (Tax Registration): the generic,
-- multi-registration `TaxRegistration` entity from the backlog's own §4 data model.
--
-- Checked against docs/plan/00-MASTER-PLAN.md §5 before creating this (per backlog rule
-- 1/CLAUDE.md non-negotiable #5): the closest existing things are
-- `core.business_settings.gstin`/`state`/`gst_registration_type` (a single India-only
-- GSTIN value, no history, no support for more than one registration) and
-- `core.tax_identities` (a *party's*, i.e. customer/supplier's, GSTIN -- an entirely
-- different concept: whose registration this is). Neither is this table, and neither is
-- superseded by it yet -- `core.tax_identities` keeps being read for CGST/SGST-vs-IGST
-- splitting on documents against a party; `core.business_settings.gstin` stays in place
-- until COMPLY-P0-04.1 (GSTIN Management) builds the real multi-registration UI on top of
-- this table and explicitly migrates that single-value form over (a decision for that
-- story, not this one -- "one story at a time").
--
-- A business can hold several registrations even within one country/regime (e.g. two
-- Indian GSTINs, one per state of operation) -- `is_primary` marks which registration is
-- the default for a given (business, country, regime) when a caller doesn't need a
-- specific jurisdiction's registration in particular.
--
-- `jurisdiction` (COMPLY-P0-02.2's own concern) is added as a plain nullable text column
-- now rather than a foreign key into a jurisdiction table, because no such table exists
-- yet and this story must not create one implicitly (backlog rule 4) -- COMPLY-P0-02.2
-- adds the validated catalog this column is checked against, in application code, not a
-- schema change.

create table gst.tax_registrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  country text not null check (country ~ '^[A-Z]{2}$'),
  -- State/province/local jurisdiction code, e.g. an Indian state name -- null when the
  -- country/regime has no sub-national jurisdiction concept (COMPLY-P0-02.2 validates
  -- this against a real per-country jurisdiction catalog; this table only stores it).
  jurisdiction text,
  regime text not null,
  registration_number text not null,
  registration_status text not null default 'active'
    check (registration_status in ('active', 'cancelled', 'suspended')),
  registered_from date,
  registered_until date,
  is_primary boolean not null default false,
  -- Regime-specific extra attributes (e.g. India's registration_type
  -- regular/composition/unregistered, return frequency, e-invoice eligibility --
  -- COMPLY-P0-04.2's own "GST Profile" story) live here rather than as bespoke columns on
  -- this generic table, per the backlog's "one generic Compliance domain plus
  -- country/regime packs" design decision -- a new regime never needs a schema migration
  -- just to record one more attribute of its own registrations.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, country, regime, registration_number)
);

create index tax_registrations_business_id_idx on gst.tax_registrations (business_id);

-- At most one primary registration per business/country/regime -- "the default GSTIN for
-- this business's Indian GST registrations," not a global platform-wide default.
create unique index tax_registrations_one_primary_per_regime
  on gst.tax_registrations (business_id, country, regime)
  where is_primary;

create trigger tax_registrations_set_updated_at
  before update on gst.tax_registrations
  for each row execute function core.set_updated_at();

-- Now that gst.tax_registrations exists, wire the FK COMPLY-P0-01.2/01.4's own migration
-- left unconstrained on purpose (see that migration's own comment). `on delete set null`,
-- not cascade -- deleting/deactivating one registration should never destroy the
-- business's whole Compliance profile (country/regime choice); it just leaves the
-- profile without an actively-selected registration until the user picks another.
alter table gst.compliance_profiles
  add constraint compliance_profiles_registration_id_fkey
  foreign key (registration_id) references gst.tax_registrations (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8). Write requires
-- `settings.manage`, same as every other Compliance settings-shaped table
-- (gst.compliance_profiles, gst.*_credentials) -- adding/editing a tax registration is a
-- settings action. No delete policy: a registration is retired via
-- `registration_status = 'cancelled'`, never removed -- the same "cancel never deletes"
-- discipline ADR-9 already requires at the license level applies here at the row level
-- too, since a cancelled GSTIN is still historically relevant to every document/return
-- that referenced it while active.
-- ---------------------------------------------------------------------------

alter table gst.tax_registrations enable row level security;

create policy "business members can view their tax registrations"
  on gst.tax_registrations for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "settings managers can create tax registrations"
  on gst.tax_registrations for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'settings.manage')
  );

create policy "settings managers can update tax registrations"
  on gst.tax_registrations for update
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'settings.manage')
  )
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'settings.manage')
  );

grant select, insert, update on gst.tax_registrations to authenticated;
grant all on gst.tax_registrations to service_role;
