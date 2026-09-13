-- PLATFORM-P0-13.1/13.2/13.4 ("Country / Compliance Pack Administration",
-- docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §17). PLATFORM-P0-13.3 ("Rule Version") is
-- explicitly NOT built by this migration -- see this story's own audit-log entry
-- (docs/design/platform-admin-portal-audit.md) for why that sub-story was stopped and
-- reported on rather than guessed at: `gst.tax_rules` (COMPLY-P0-02.3, a different,
-- concurrently-running workstream's own schema) already implements a versioned country/
-- regime rule engine with the exact `version`/`effective_from`/`effective_to`/`source`
-- shape 13.3 names, as real, live, actively-seeded production data (India rate slabs, EU
-- VAT rates, US sales tax, CA GST/HST, ...) -- not a compile-time catalog like the one this
-- migration mirrors below. Building a second, platform-owned "rule version" table with the
-- same shape would be exactly the "parallel table for an already-listed concept" CLAUDE.md
-- non-negotiable #5 forbids, and reaching into `gst.tax_rules` directly from `platform`/
-- `apps/web` would cross a module-ownership boundary no prior story in this backlog has
-- crossed. This is a genuine architecture/entity-ownership judgment call the doc's own text
-- does not resolve, so it is left open rather than merged as a guess.
--
-- **Entity-ownership check (CLAUDE.md non-negotiable #5), done first**: checked
-- docs/plan/00-MASTER-PLAN.md §5 -- no "country"/"compliance pack" concept listed there at
-- all. Widened the grep past `packages/`+`supabase/migrations/` per this run's own task
-- brief (the same discipline PLATFORM-P0-12.1-12.4's own entry names): read
-- `packages/module-gst/src/lib/compliance/countries.ts` (read-only reconnaissance --
-- `module-gst` is a different, concurrently-running workstream's files, never edited by
-- this migration or any file this story touches) and grepped `apps/web/` for any existing
-- country-selection or compliance-pack ADMIN UI. Found:
--   - `module-gst`'s own `COUNTRY_CATALOG` -- a compile-time TS constant array recording
--     which countries/regimes this CODEBASE has actually built working support for
--     (`status: "supported"` vs `"planned"`). It answers "what has engineering shipped,"
--     not "what is administratively offered to customers right now" -- no DB table backs
--     it at all, so there is nothing here to duplicate at the schema level (unlike 13.3's
--     `gst.tax_rules` conflict above). This is the exact same relationship
--     `packages/module-registry` (a compile-time, static nav/routes manifest) has to
--     `platform.modules` (PLATFORM-P0-07.1's own DB-backed operational registry) --
--     confirmed against that story's own audit-log entry before writing this one.
--   - `packages/module-gst/src/lib/compliance/queries.ts`/`mutations.ts` -- a BUSINESS's
--     own `gst.compliance_profiles` row (country + regime it has registered under). Tenant
--     data, not a platform-wide administrative concept -- not this table's concern either.
--   - No existing platform-level country/compliance-pack admin UI or table anywhere in
--     `apps/web/`.
-- Conclusion: 13.1 (Country Registry) and 13.2 (Compliance Pack Availability)/13.4
-- (Compliance Feature Flags) name a genuinely new PLATFORM-level administrative registry --
-- one layer of "is this country/regime/capability administratively offered at all,
-- platform-wide" sitting above `module-gst`'s own compile-time "is it built" catalog and
-- above a business's own tenant-scoped `gst.compliance_profiles` selection -- the same
-- three-layer shape (compile-time capability catalog / platform admin registry / tenant
-- data) `platform.modules` already established for whole modules.
--
-- **Seeded from the live `COUNTRY_CATALOG` (CLAUDE.md's "live source wins" over the plan
-- doc's own vaguer "India, EU/member states, US, Canada, Singapore, UAE, Saudi Arabia,
-- Australia, New Zealand, Malaysia, etc." list), not invented** -- `enabled` mirrors
-- `status: "supported"` (a real, working implementation exists) vs `"planned"` (named in
-- the catalog, no working implementation yet, so not yet administratively offered) exactly,
-- the same "computed, not hardcoded" discipline PLATFORM-P0-12.1-12.4's own `ai`/`email`
-- seed used. The EU is seeded as its individual supported/planned member states (DE, FR,
-- BE, PL, IT supported; no other member state appears in the live catalog at all), not as
-- one generic "EU" row -- the plan doc's own "EU/member states" line already anticipates
-- per-state granularity, and inventing member states the live catalog does not name would
-- be exactly the fabricated-data problem this backlog has repeatedly avoided elsewhere
-- (e.g. PLATFORM-P0-02.1's honest MRR/ARR "--").
--
-- **A growable admin catalog, not a fixed enum** -- unlike `platform.modules` (fixed at
-- five, one per module package) or `platform.integrations` (fixed at seven named
-- categories), 13.1's own "Manage" framing plus its list's own trailing "etc." describe an
-- open-ended catalog a superadmin adds to over time as new country/regime packs are built.
-- Modeled after `platform.plans` (PLATFORM-P0-04.1) accordingly: superadmin SELECT/INSERT/
-- UPDATE, no DELETE grant to `authenticated` at all (a country/pack/feature a superadmin no
-- longer wants offered is disabled, never removed -- the same "no delete through the app,
-- ever" stance `platform.plans`' own migration already took, for the same reason: nothing
-- here yet has a real "in use by N businesses" check to gate a safe delete on). No RPC/
-- audit-event ceremony either -- 13.1/13.2/13.4's own text says "Manage"/"Configure"/names
-- an example, never "kill switch"/"emergency disabling" the way 07.2/12.3 do, so this
-- mirrors `platform.plans`/`platform.modules`'s plain, directly-RLS-gated write shape
-- rather than inventing a reason-required ceremony the doc never asks for here.
--
-- Three tables, one hierarchy: a country (13.1) has zero or more compliance packs (13.2,
-- one row per country+regime), each of which has zero or more named feature flags (13.4).
-- `enabled` at each level is independent and NOT composed by this migration (e.g. a
-- disabled country's own packs keep their own `enabled` value as stored) -- no runtime
-- consumer exists yet to need a composed "effective enabled" answer, the same "table now,
-- real enforcement/composition later" sequencing 07.1's `platform.modules.enabled` and
-- 12.1's `platform.integrations` both used; the actual reachable subject of that future
-- wiring is `module-gst`'s own code, which this run's own file-scope boundary forbids
-- touching regardless.

create table platform.compliance_countries (
  country_code text primary key check (country_code ~ '^[A-Z]{2}$'),
  name text not null check (btrim(name) <> ''),
  -- Whether this country is currently offered/administratively available platform-wide at
  -- all. No runtime consumer reads this yet (see header comment) -- a plain administrative
  -- fact, not a kill switch.
  enabled boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index compliance_countries_updated_by_idx on platform.compliance_countries (updated_by);

-- Seeded from packages/module-gst/src/lib/compliance/countries.ts's own COUNTRY_CATALOG
-- (read at migration-authoring time, not imported) -- enabled = true exactly for that
-- catalog's `status: "supported"` entries.
insert into platform.compliance_countries (country_code, name, enabled) values
  ('IN', 'India', true),
  ('US', 'United States', true),
  ('CA', 'Canada', true),
  ('SG', 'Singapore', false),
  ('DE', 'Germany', true),
  ('FR', 'France', true),
  ('BE', 'Belgium', true),
  ('PL', 'Poland', true),
  ('IT', 'Italy', true),
  ('AE', 'United Arab Emirates', false),
  ('SA', 'Saudi Arabia', false),
  ('AU', 'Australia', false),
  ('NZ', 'New Zealand', false),
  ('MY', 'Malaysia', false),
  ('TH', 'Thailand', false),
  ('ID', 'Indonesia', false),
  ('JP', 'Japan', false),
  ('KR', 'South Korea', false);

alter table platform.compliance_countries enable row level security;

-- SELECT open to any authenticated user from the start -- same reasoning
-- `platform.modules`/`platform.feature_flags`/`platform.integrations` each used in advance
-- (this catalog's own eventual consumer, if any, runs as an ordinary signed-in business
-- member, not a superadmin), avoiding a second widening migration later.
create policy "authenticated users can view the compliance country registry" on platform.compliance_countries
  for select to authenticated
  using (true);

create policy "superadmins can insert compliance countries" on platform.compliance_countries
  for insert to authenticated
  with check (platform.is_superadmin());

create policy "superadmins can update compliance countries" on platform.compliance_countries
  for update to authenticated
  using (platform.is_superadmin())
  with check (platform.is_superadmin());

grant select, insert, update on platform.compliance_countries to authenticated;
grant all on platform.compliance_countries to service_role;

create table platform.compliance_packs (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references platform.compliance_countries (country_code),
  -- Machine key for the regime, e.g. 'GST', 'VAT', 'SALES_TAX' -- free text, matching
  -- `gst.tax_rules.regime`'s own "validated only against the application-code catalog,
  -- never a DB enum" convention (this table's own regime values are sourced from the same
  -- `COUNTRY_CATALOG`, not independently invented).
  regime text not null check (btrim(regime) <> ''),
  display_name text not null check (btrim(display_name) <> ''),
  enabled boolean not null default false,
  -- 13.2's own "version" field -- a superadmin-set free-text pack-version label (e.g. "v2
  -- rate schedule"), NOT the fine-grained per-rule versioning `gst.tax_rules` already owns
  -- (see this migration's header comment on 13.3). Nullable with no default, same "no
  -- fabricated number" stance `platform.modules.version` already established -- there is no
  -- real pack-release version anywhere in this codebase to read from instead.
  version text check (version is null or char_length(version) <= 100),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (country_code, regime)
);

create index compliance_packs_country_code_idx on platform.compliance_packs (country_code);
create index compliance_packs_updated_by_idx on platform.compliance_packs (updated_by);

insert into platform.compliance_packs (country_code, regime, display_name, enabled) values
  ('IN', 'GST', 'GST (Goods & Services Tax)', true),
  ('US', 'SALES_TAX', 'Sales Tax', true),
  ('US', 'INFORMATION_RETURNS', '1099 Information Returns', true),
  ('CA', 'GST_HST', 'GST/HST', true),
  ('SG', 'GST', 'GST (Goods & Services Tax)', false),
  ('DE', 'VAT', 'VAT', true),
  ('FR', 'VAT', 'VAT', true),
  ('BE', 'VAT', 'VAT', true),
  ('PL', 'VAT', 'VAT', true),
  ('IT', 'VAT', 'VAT', true),
  ('AE', 'VAT', 'VAT', false),
  ('SA', 'VAT', 'VAT', false),
  ('AU', 'GST', 'GST (Goods & Services Tax)', false),
  ('NZ', 'GST', 'GST (Goods & Services Tax)', false),
  ('MY', 'SST', 'Sales & Service Tax', false),
  ('TH', 'VAT', 'VAT', false),
  ('ID', 'VAT', 'VAT / e-Faktur', false),
  ('JP', 'CONSUMPTION_TAX', 'Consumption Tax', false),
  ('KR', 'VAT', 'VAT', false);

alter table platform.compliance_packs enable row level security;

create policy "authenticated users can view compliance packs" on platform.compliance_packs
  for select to authenticated
  using (true);

create policy "superadmins can insert compliance packs" on platform.compliance_packs
  for insert to authenticated
  with check (platform.is_superadmin());

create policy "superadmins can update compliance packs" on platform.compliance_packs
  for update to authenticated
  using (platform.is_superadmin())
  with check (platform.is_superadmin());

grant select, insert, update on platform.compliance_packs to authenticated;
grant all on platform.compliance_packs to service_role;

create table platform.compliance_pack_features (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references platform.compliance_packs (id) on delete cascade,
  -- Free text, e.g. 'gst', 'einvoice', 'eway_bill', 'ims' -- matches 13.4's own literal
  -- India example. Not constrained to any fixed vocabulary -- a different pack's own
  -- capability names (e.g. a future EU pack's 'oss_ioss') are this same shape.
  feature_key text not null check (btrim(feature_key) <> ''),
  display_name text not null check (btrim(display_name) <> ''),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (pack_id, feature_key)
);

create index compliance_pack_features_pack_id_idx on platform.compliance_pack_features (pack_id);
create index compliance_pack_features_updated_by_idx on platform.compliance_pack_features (updated_by);

-- 13.4's own literal example -- India's GST pack, all four flags enabled. Each corresponds
-- to a real, working module-gst capability confirmed by this migration's own read-only
-- reconnaissance (gst.compliance_profiles/tax_registrations for the base 'gst' capability,
-- gst.einvoice_credentials + einvoicing lib for 'einvoice', gst.eway_bill_credentials +
-- eway-bill lib for 'eway_bill', gst.ims schema for 'ims') -- not a fabricated example. No
-- other pack is seeded with any feature row: the doc names no example for any other
-- country/regime, and inventing a capability taxonomy for the other seven supported packs
-- (US sales tax, Canada GST/HST, the five EU VAT packs) would be exactly the speculative
-- functionality CLAUDE.md development principle #7 rules out for a story that only asks to
-- "configure" (a superadmin can add more rows here later, for any pack, the same way
-- `platform.plans` grows over time).
insert into platform.compliance_pack_features (pack_id, feature_key, display_name, enabled)
select p.id, f.feature_key, f.display_name, true
from platform.compliance_packs p
cross join (values
  ('gst', 'GST'),
  ('einvoice', 'E-Invoice'),
  ('eway_bill', 'E-Way Bill'),
  ('ims', 'IMS')
) as f(feature_key, display_name)
where p.country_code = 'IN' and p.regime = 'GST';

alter table platform.compliance_pack_features enable row level security;

create policy "authenticated users can view compliance pack features" on platform.compliance_pack_features
  for select to authenticated
  using (true);

create policy "superadmins can insert compliance pack features" on platform.compliance_pack_features
  for insert to authenticated
  with check (platform.is_superadmin());

create policy "superadmins can update compliance pack features" on platform.compliance_pack_features
  for update to authenticated
  using (platform.is_superadmin())
  with check (platform.is_superadmin());

grant select, insert, update on platform.compliance_pack_features to authenticated;
grant all on platform.compliance_pack_features to service_role;
