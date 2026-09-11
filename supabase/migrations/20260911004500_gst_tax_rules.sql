-- WonderArc Compliance backlog, COMPLY-P0-02.3 (Versioned Tax Rules): the generic
-- `TaxRule` entity from the backlog's own §4 data model -- "Rules have effective dates
-- and source references," the same `country`/`jurisdiction`/`regime`/`effective_from`/
-- `effective_to`/`version`/`source` shape §4 requires of every country rule.
--
-- Checked against docs/plan/00-MASTER-PLAN.md §5 first (backlog rule 1 / CLAUDE.md
-- non-negotiable #5): the closest existing thing is `core.tax_rates` (5 rows: the GST
-- Council's standard 0/5/12/18/28% ad-valorem slabs, `core.items.tax_rate` picks from
-- it) -- a flat, unversioned, unsourced, single-country constant list shared by
-- inventory/fsm/gst alike. It is NOT this table and is NOT superseded by it: it keeps
-- being the simple India-rate-slab picker `core.items`' own form already uses; this table
-- is the generic, versioned, source-cited, multi-country/regime *rule* engine the
-- Compliance module itself owns (backlog §5: "Compliance owns ... tax rules"), which
-- India's own rate/treatment content (COMPLY-P0-04.5 "GST Tax Determination"/04.7 "GST
-- Rule Versioning") will populate later -- this story only builds the generic, empty
-- table + its versioning behavior, no India-specific rows.
--
-- Unlike gst.compliance_profiles/gst.tax_registrations, this table has NO `business_id`
-- -- a tax rule is a fact about a country/regime's law, not something any one business
-- owns or edits (same "platform-wide, not tenant-scoped" shape as `core.tax_rates`,
-- just module-owned instead of core-owned since it's Compliance-specific regulatory
-- content, per backlog §5). RLS below reflects that: SELECT is gated on the calling
-- user having a `gst`-licensed business (ANY one, not a specific `business_id` match --
-- there is no per-row tenant to match), and there is no INSERT/UPDATE/DELETE grant to
-- `authenticated` at all -- rule content is centrally curated (by whoever ships a
-- country/regime pack), not a business's own settings input, so all writes go through
-- `service_role` only (module-gst's own `db/admin.ts`, same "readable by everyone
-- [licensed], writable by nobody from the client" shape `core.tax_rates`'s own comment
-- already established).
--
-- `rule_key` is free text (e.g. a future 'GST_STANDARD_RATE') -- this generic layer does
-- not define or constrain the vocabulary of what a rule is *about*; that is each
-- regime pack's own concern (COMPLY-P0-04.7 for India), exactly like `regime` itself is
-- validated only against the application-code catalog (`isRegimeSupported`), never a DB
-- enum. `value` is opaque jsonb for the same reason -- COMPLY-P0-02.4 (Tax Treatments)
-- is the next story's job to give some of that jsonb shape a name, not this one's to
-- guess ahead of time (backlog rule 4/5, "don't implement future stories implicitly").
--
-- Versioning: a "rule lineage" is identified by (country, regime, jurisdiction,
-- rule_key). `supersedeTaxRule` (lib/tax-rules/admin-mutations.ts) closes the
-- previously-open version's `effective_to` at the new version's `effective_from` and
-- inserts version+1 -- never updates/deletes a prior version's own row (ADR-9's "cancel
-- never deletes" discipline / backlog rule 13 "preserve historical filing/evidence
-- state" applied here too: a document taxed under an old rule must still be able to look
-- that exact historical version up).
--
-- Known limitation, left as-is rather than engineered around now (no real rule content
-- or consumer exists yet to make the gap concrete): Postgres treats NULL as distinct from
-- itself in a unique index, so two rows sharing (country, regime, rule_key, version) with
-- `jurisdiction` both NULL would not violate the uniqueness constraint below. Not fixed
-- with a sentinel value here because that would contradict `jurisdiction`'s own "null
-- means this regime has no sub-national jurisdiction concept" meaning
-- (gst.tax_registrations' own convention, COMPLY-P0-02.2) for no present benefit; revisit
-- if a real multi-writer admin workflow (COMPLY-P0-04.7 or later) makes the gap matter.

create table gst.tax_rules (
  id uuid primary key default gen_random_uuid(),
  country text not null check (country ~ '^[A-Z]{2}$'),
  -- Same "null = no sub-national jurisdiction concept for this rule" convention as
  -- gst.tax_registrations.jurisdiction (COMPLY-P0-02.2) -- validated in application code
  -- against lib/compliance/jurisdictions.ts, not a DB constraint.
  jurisdiction text,
  regime text not null,
  rule_key text not null check (length(trim(rule_key)) > 0),
  value jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  effective_from date not null,
  -- null = still in effect (the currently-open version of this rule lineage).
  effective_to date,
  -- Citation/reference for where this rule comes from (a notification number, a
  -- statute section, a government portal URL, ...) -- required, not optional: an
  -- unsourced row would be exactly the "claims fact without a traceable regulatory
  -- source" backlog rule 12 warns against distinguishing (regulatory fact vs. software
  -- rule vs. calculated result vs. AI explanation).
  source text not null check (length(trim(source)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from),
  unique (country, regime, jurisdiction, rule_key, version)
);

-- The query this table exists to serve: "the rule in effect for this country/regime/
-- jurisdiction/rule_key as of date X" -- filters on the first four columns, then picks
-- the highest version among rows whose effective range covers X.
create index tax_rules_lookup_idx
  on gst.tax_rules (country, regime, jurisdiction, rule_key, effective_from desc);

create trigger tax_rules_set_updated_at
  before update on gst.tax_rules
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security -- licensed, not tenant (there is no business_id column to scope
-- by -- see this migration's own comment above for why). SELECT requires the calling
-- user to belong to at least one `gst`-licensed business; no write policy at all for
-- `authenticated` -- every write goes through service_role (module-gst's admin client),
-- matching `core.tax_rates`'s own "writable by nobody from the client" shape.
-- ---------------------------------------------------------------------------

alter table gst.tax_rules enable row level security;

create policy "gst-licensed business members can view tax rules"
  on gst.tax_rules for select
  to authenticated
  using (
    exists (
      select 1 from core.user_business_ids() ub
      where ub in (select core.licensed_business_ids('gst'))
    )
  );

grant select on gst.tax_rules to authenticated;
grant all on gst.tax_rules to service_role;
