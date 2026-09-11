-- WonderArc Compliance backlog, COMPLY-P0-01.2 (Country Selector) / COMPLY-P0-01.3
-- (Tax Regime Selector) / COMPLY-P0-01.4 (Context Persistence): the `ComplianceProfile`
-- entity from the backlog's own §4 generic data model -- "Persist active
-- business/country/regime/registration" (01.4). This is Epic COMPLY-P0-01's own job
-- ("Compliance Shell & Country Switch") to create, so it is not a duplicate of anything
-- in docs/plan/00-MASTER-PLAN.md §5's entity-ownership map: no existing table holds "which
-- country/regime this business currently operates its Compliance module in" --
-- `core.business_settings.gstin`/`state`/`gst_registration_type` is a single India-only
-- GSTIN value (COMPLY-P0-04.1/04.2 will build the real multi-registration
-- `gst.tax_registrations` table on top of a later story, not this one), and
-- `core.tax_identities` is a *party's* (customer/supplier) GSTIN, an unrelated concept.
--
-- One row per business (a business operates in exactly one active country/regime context
-- at a time -- switching country is changing this row, not adding a second one; a
-- business with registrations in several jurisdictions of the *same* country, e.g. two
-- Indian GSTINs in different states, is COMPLY-P0-04.1's multi-registration concern, not
-- this table's). No row until the module's first use -- defaults to India/GST (this
-- platform's only supported P0 market) so every existing licensed business reads a
-- sensible profile without a backfill.
--
-- `registration_id` is added as a nullable column now, per COMPLY-P0-01.4's own "and
-- registration" -- but left unconstrained (no FK yet) because the `TaxRegistration`
-- table it will eventually reference doesn't exist until COMPLY-P0-02.1/04.1. Backlog
-- rule 4 ("Do not implement future stories implicitly") means this migration must not
-- reach ahead and create that table now; the FK is added in the migration that creates
-- `gst.tax_registrations`, not backfilled speculatively here.

create table gst.compliance_profiles (
  business_id uuid primary key references core.businesses (id) on delete cascade,
  -- ISO 3166-1 alpha-2. 'IN' is the only value any UI lets a user actually choose in P0
  -- (COMPLY-P0-01.5 shows every other country as "planned, not yet supported") -- the
  -- column itself is not constrained to a fixed list so P1 country packs (COMPLY-P1-01
  -- onward) don't need a schema migration just to add a country the application layer
  -- already recognizes.
  country text not null default 'IN' check (country ~ '^[A-Z]{2}$'),
  -- Free-text regime key ('GST', 'VAT', 'SALES_TAX', 'SST', ...), not an enum -- the same
  -- "never hard-code" principle (backlog rule 8) applies to the regime catalogue itself,
  -- which lives in application code (module-gst's own country/regime catalog), not a
  -- database check constraint that would need a migration per new regime.
  regime text not null default 'GST',
  registration_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger compliance_profiles_set_updated_at
  before update on gst.compliance_profiles
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8), same shape as every other
-- gst-schema table with a normal (non-secret) SELECT policy. Write requires
-- `settings.manage` -- choosing a business's active Compliance country/regime is a
-- settings-level action, same permission gate the existing GST-profile/e-Invoice/
-- e-Way-Bill credential forms already use, not the narrower `gst.generate` (which is
-- about generating government documents, an unrelated action).
-- ---------------------------------------------------------------------------

alter table gst.compliance_profiles enable row level security;

create policy "business members can view their compliance profile"
  on gst.compliance_profiles for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "settings managers can create their compliance profile"
  on gst.compliance_profiles for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'settings.manage')
  );

create policy "settings managers can update their compliance profile"
  on gst.compliance_profiles for update
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

-- No delete policy: a business always has exactly one (defaulted or explicit) Compliance
-- profile row once it exists; there is no product action that removes Compliance context
-- entirely short of the license cancellation flow itself (ADR-9's own 30-day-grace/
-- retain-rows rule), which never deletes rows anyway.

grant select, insert, update on gst.compliance_profiles to authenticated;
grant all on gst.compliance_profiles to service_role;
