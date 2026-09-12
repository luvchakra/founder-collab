-- PLATFORM-P0-04.4: "Feature-Level Entitlements" (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
-- §8). "Go beyond module-level licensing" -- a finer axis than PLATFORM-P0-04.3's whole-
-- module toggle: a plan can include a module (e.g. Discovery) while still gating a
-- specific capability within it (e.g. "Advanced Signals") to higher tiers.
--
-- Two tables, not one, because a feature has its own identity independent of any plan
-- (the same "key is a stable identity, separate from a per-plan toggle" shape
-- platform.plan_modules already established against core.modules):
--   platform.features      -- the catalog: what finer-grained capabilities exist, per module
--   platform.plan_features -- which of those a given plan actually entitles
--
-- Distinct from PLATFORM-P0-08's own future `platform.feature_flags` (§12, "Global Feature
-- Flags" -- feature_key/description/enabled/effective_from/effective_to, with a Global/
-- Plan/Module/Country *scope* and its own kill-switch/audit requirements): that is an
-- *operational* on/off control for reliability and staged rollout (08.3 names "AI
-- research", "outbound messaging" as kill-switch examples -- infrastructure concerns), not
-- a *commercial* packaging axis. Both may end up describing similar-sounding capabilities
-- (e.g. "AI Research") for different reasons, but conflating this story's plan-entitlement
-- catalog with that not-yet-built operational kill-switch table would tie two genuinely
-- different concerns (what a customer is allowed to use vs. whether the platform is
-- currently letting anyone use it at all) to one table before either need is actually
-- built out. `platform.features` is scoped to this story's own commercial-entitlement
-- purpose only.
--
-- The doc's own §8.4 per-module feature lists (Discovery: AI Research, Website
-- Understanding, ...; CRM: WhatsApp, Social Inbox, ...; Compliance: India GST, ...) are
-- labelled "Example:", illustrating the shape of the model the same way §8.2's module-
-- inclusion example was (see PLATFORM-P0-04.3's own migration docstring) -- not a literal
-- seed instruction. Nothing is seeded into platform.features here; a superadmin defines
-- real features through the application layer this same story adds.
create table platform.features (
  id uuid primary key default gen_random_uuid(),
  module_key text not null references core.modules (key),
  key text not null check (key ~ '^[a-z0-9_]+$'),
  name text not null check (btrim(name) <> ''),
  description text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,

  unique (module_key, key)
);

create index features_module_key_idx on platform.features (module_key);
create index features_updated_by_idx on platform.features (updated_by);

-- One row per (plan, feature) that has ever been explicitly toggled -- not a full seeded
-- matrix like plan_modules. `enabled` defaults false: a feature-level entitlement is a
-- finer, typically premium/upsell capability ("go beyond module-level licensing"), so
-- absence of a row (or an explicit false row) both mean "not entitled" -- there is no
-- pure-data reason to prefer one representation over the other for a boolean, unlike
-- plan_limits' genuine three-way state, so no DELETE policy is needed here either:
-- toggling `enabled` via UPDATE (upserted from the app layer) covers every mutation this
-- story's own UI needs, the same "don't grant a capability nothing calls" stance
-- plan_modules already established.
create table platform.plan_features (
  plan_id uuid not null references platform.plans (id) on delete cascade,
  feature_id uuid not null references platform.features (id) on delete cascade,
  enabled boolean not null default false,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,

  primary key (plan_id, feature_id)
);

create index plan_features_feature_id_idx on platform.plan_features (feature_id);
create index plan_features_updated_by_idx on platform.plan_features (updated_by);

alter table platform.features enable row level security;
alter table platform.plan_features enable row level security;

-- platform.features: full CRUD for a superadmin -- unlike platform.plans (04.7's "never
-- delete a plan with historical subscribers"), a feature *definition* with no plan
-- entitling it is dead catalog data a superadmin should be able to remove outright; `on
-- delete cascade` on plan_features.feature_id cleans up any now-orphaned entitlement rows
-- in the same statement.
create policy "superadmins can view features" on platform.features for select to authenticated
  using (platform.is_superadmin());
create policy "superadmins can insert features" on platform.features for insert to authenticated
  with check (platform.is_superadmin());
create policy "superadmins can update features" on platform.features for update to authenticated
  using (platform.is_superadmin())
  with check (platform.is_superadmin());
create policy "superadmins can delete features" on platform.features for delete to authenticated
  using (platform.is_superadmin());

grant select, insert, update, delete on platform.features to authenticated;
grant all on platform.features to service_role;

-- platform.plan_features: select/insert/update only -- see the table's own comment above
-- for why no delete grant is needed.
create policy "superadmins can view plan features" on platform.plan_features for select to authenticated
  using (platform.is_superadmin());
create policy "superadmins can insert plan features" on platform.plan_features for insert to authenticated
  with check (platform.is_superadmin());
create policy "superadmins can update plan features" on platform.plan_features for update to authenticated
  using (platform.is_superadmin())
  with check (platform.is_superadmin());

grant select, insert, update on platform.plan_features to authenticated;
grant all on platform.plan_features to service_role;
