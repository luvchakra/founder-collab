-- PLATFORM-P0-04.3: "Module Entitlements" (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
-- §8). "Configure which modules each plan includes" -- the first of the three tables
-- PLATFORM-P0-04.1's own migration named as still-open (module entitlements, feature-level
-- entitlements, quantity limits) and that same migration's docstring is explicit that
-- PLATFORM-P0-04.2 ("Plan Entitlements") is the *composite view* of those three tables
-- once they exist, not its own table -- so this migration (and the two siblings that
-- follow it in this same run) come first, in doc order, before any composite UI is built.
--
-- `platform.plan_modules` is a join table between `platform.plans` (PLATFORM-P0-04.1) and
-- `core.modules` (Epic 2 story C-3, the canonical module catalog every license already
-- references via `core.licenses.module_key`) -- the cross-schema FK points into `core`,
-- per CLAUDE.md non-negotiable #1 ("cross-schema foreign keys point only into core"), not
-- a parallel module-identity list invented for `platform`.
--
-- One row per (plan, module) pair, not a sparse "override" table: every plan is seeded
-- with a row for every existing module below, `enabled = true` by default. This is a
-- deliberate, minimal, non-speculative default -- CLAUDE.md's "never implement speculative
-- functionality" cuts the other way just as hard against *inventing* which modules Free
-- vs. Pro vs. Max should actually include (the doc's own §8 example ("Discovery ✓
-- enabled... FSM ✗ disabled") is illustrative of the *shape* of the model, not a literal
-- seed instruction the way PLATFORM-P0-04.1's "Initial plans: Free/Pro/Max" line was --
-- that one was under a plain "Initial plans:" heading, this one is explicitly labelled
-- "Example:"). A real superadmin makes that real pricing decision through the UI this
-- migration's sibling application-layer story adds; defaulting every module to enabled
-- keeps every existing plan's current behavior (every module purchasable) unchanged the
-- moment this table starts existing, exactly like PLATFORM-P0-03.3's own "opt-in override
-- that defaults to today's look" reasoning for login branding.
--
-- Deliberately NOT built here: feature-level entitlements (PLATFORM-P0-04.4) and quantity
-- limits/unlimited support (PLATFORM-P0-04.5/04.6) -- each its own sibling migration,
-- landing in this same run, not folded in here (they are genuinely separate tables with
-- their own shapes, unlike PLATFORM-P0-04.7's "status" enum, which was one column on an
-- already-existing table).
create table platform.plan_modules (
  plan_id uuid not null references platform.plans (id) on delete cascade,
  module_key text not null references core.modules (key),
  enabled boolean not null default true,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,

  primary key (plan_id, module_key)
);

create index plan_modules_module_key_idx on platform.plan_modules (module_key);
create index plan_modules_updated_by_idx on platform.plan_modules (updated_by);

-- Seed: every existing plan x every existing module, enabled. Cross-schema read
-- (core.modules) from a migration that also touches platform -- fine per
-- scripts/lint-migration-schema.mjs's own rule (a migration may touch `core` plus exactly
-- one module/platform schema; this one touches `platform` plus `core`, not two module
-- schemas).
insert into platform.plan_modules (plan_id, module_key, enabled)
select p.id, m.key, true
from platform.plans p
cross join core.modules m;

alter table platform.plan_modules enable row level security;

-- Same shape as platform.plans: platform.is_superadmin() is the actual RLS-backed
-- boundary. Unlike platform.plans (PLATFORM-P0-04.7: never delete a plan with historical
-- subscribers), there is no equivalent "never delete" rule for a module-entitlement row --
-- but no delete policy/grant is added anyway, because every (plan, module) pair already
-- has exactly one row from the seed above (and the application layer inserts one more
-- whenever a new plan is created, see platform-plan-modules.ts) -- toggling `enabled` via
-- UPDATE is the only mutation this story's own UI ever needs, so DELETE is simply never
-- granted, the same "don't grant a capability nothing calls" stance
-- platform.admins/platform.plans already established for their own unused paths.
create policy "superadmins can view plan modules" on platform.plan_modules for select to authenticated
  using (platform.is_superadmin());

create policy "superadmins can insert plan modules" on platform.plan_modules for insert to authenticated
  with check (platform.is_superadmin());

create policy "superadmins can update plan modules" on platform.plan_modules for update to authenticated
  using (platform.is_superadmin())
  with check (platform.is_superadmin());

grant select, insert, update on platform.plan_modules to authenticated;
grant all on platform.plan_modules to service_role;
