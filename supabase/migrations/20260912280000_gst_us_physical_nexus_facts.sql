-- WonderArc Compliance backlog, COMPLY-P1-02.3 (United States -- Physical Nexus Inputs).
-- "Physical nexus" -- a business's own actual physical presence in a state (an employee,
-- an office, a warehouse, inventory stored there, e.g. via a fulfillment network) -- is,
-- alongside economic nexus (COMPLY-P1-02.2), the other real basis a state can require sales
-- tax registration/collection on, and long predates South Dakota v. Wayfair, Inc. (2018):
-- the pre-Wayfair "substantial nexus" doctrine (Quill Corp. v. North Dakota, 504 U.S. 298
-- (1992), overruled by Wayfair only as to the ECONOMIC-nexus question) never went away for
-- physical presence.
--
-- Checked `docs/plan/00-MASTER-PLAN.md` §5 first (backlog rule 1/5, CLAUDE.md
-- non-negotiable #5): nothing existing captures "which US states does this business have a
-- physical presence in" -- `core.addresses` records a PARTY's own addresses (billing/
-- shipping/service), not a WonderArc business's own multi-state footprint, and
-- `gst.tax_registrations` records an ALREADY-obtained registration, not the underlying
-- physical-presence FACT that might justify needing one in the first place. A genuinely new,
-- small, Compliance-owned concept (backlog §5: "Compliance owns ... registrations" --
-- physical-presence facts are the input a registration-obligation determination consumes,
-- the same relationship `gst.tax_registrations` itself has to `gst.compliance_profiles`).
--
-- Deliberately caller-DECLARED, not derived from `core.employees`/`inventory.warehouses`
-- (backlog rule 12, "distinguish regulatory fact/software rule/calculated result" --
-- physical nexus is a LEGAL classification a business or its advisor applies, not a
-- mechanical count of employee/warehouse rows this platform could compute unattended; an
-- employee record in `core.employees` has no state field at all today, and inferring nexus
-- from `inventory.warehouses` would silently ignore the FBA/third-party-fulfillment case
-- entirely, where inventory sits in a state without WonderArc's own warehouse record ever
-- existing). Matches the same "self-declared, not computed" posture
-- COMPLY-P0-04.2's own `eInvoiceEligible` flag and COMPLY-P1-01.3's own
-- `cumulativeEuDistanceSalesEur` input already take.
--
-- `ended_at` (nullable date, null = still present) rather than a hard DELETE for the same
-- "preserve historical filing/evidence state" reasoning (backlog rule 13) `gst
-- .tax_registrations`'s own `registration_status` column already applies: a business that
-- closed a warehouse in a state last year still needs to be able to show it HAD physical
-- nexus there during the period it operated, not have that fact silently vanish. The
-- partial unique index below (only over currently-ACTIVE rows, `ended_at is null`) is the
-- same shape `tax_registrations_one_primary_per_regime` already uses to avoid the
-- documented NULL-in-a-plain-unique-index gap that migration's own sibling
-- (`gst.tax_rules`) still carries -- a partial index sidesteps that gap entirely rather than
-- repeating it here.

create table gst.us_physical_nexus_facts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  -- US state's own two-letter USPS code (lib/compliance/us-states.ts, COMPLY-P1-02.1) --
  -- validated against that catalog in application code, not a DB enum, matching every
  -- other jurisdiction-shaped column in this schema (gst.tax_registrations.jurisdiction).
  state text not null check (state ~ '^[A-Z]{2}$'),
  presence_type text not null check (presence_type in ('employee', 'office', 'warehouse', 'inventory', 'other')),
  notes text,
  declared_at timestamptz not null default now(),
  ended_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index us_physical_nexus_facts_business_id_idx on gst.us_physical_nexus_facts (business_id);

-- At most one ACTIVE (not-yet-ended) declaration per business/state/presence-type -- a
-- partial index, not a plain unique constraint, so re-declaring the same state/type after a
-- prior one was marked ended is allowed (a business that closes and later reopens a
-- warehouse in the same state).
create unique index us_physical_nexus_facts_one_active_per_state_type
  on gst.us_physical_nexus_facts (business_id, state, presence_type)
  where ended_at is null;

create trigger us_physical_nexus_facts_set_updated_at
  before update on gst.us_physical_nexus_facts
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security -- tenant AND licensed (ADR-4/ADR-8), write gated by
-- `settings.manage` -- same shape as `gst.tax_registrations` (declaring a physical-presence
-- fact is a settings-shaped action, the input side of a registration decision, not itself a
-- registration). No delete policy -- a fact is ended via `ended_at`, never removed
-- (backlog rule 13, see above).
-- ---------------------------------------------------------------------------

alter table gst.us_physical_nexus_facts enable row level security;

create policy "business members can view their US physical nexus facts"
  on gst.us_physical_nexus_facts for select
  using (
    business_id in (select core.user_business_ids())
    and business_id in (select core.licensed_business_ids('gst'))
  );

create policy "settings managers can declare US physical nexus facts"
  on gst.us_physical_nexus_facts for insert
  with check (
    business_id in (select core.user_business_ids())
    and business_id in (select core.write_licensed_business_ids('gst'))
    and core.has_permission(business_id, 'settings.manage')
  );

create policy "settings managers can update US physical nexus facts"
  on gst.us_physical_nexus_facts for update
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

grant select, insert, update on gst.us_physical_nexus_facts to authenticated;
grant all on gst.us_physical_nexus_facts to service_role;
