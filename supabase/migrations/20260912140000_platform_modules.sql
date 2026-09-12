-- PLATFORM-P0-07.1: "Module Registry" (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §11).
-- "Manage: enabled, visible, licensed, minimum_plan, status, version" per module.
--
-- Genuinely new table, not a duplicate of anything already in the entity-ownership map
-- (docs/plan/00-MASTER-PLAN.md §5): `core.modules` is the licensing catalog (`key`, `name`,
-- `description` -- the FK target every `core.licenses.module_key` and
-- `platform.plan_modules.module_key` points at); `packages/module-registry` is a
-- compile-time, static manifest for building nav/routes. Neither one is a superadmin's
-- *operational control* over a module across the whole platform (kill switch, maintenance
-- mode) -- that is genuinely new control-plane data, hence `platform` schema, per CLAUDE.md
-- non-negotiable #1's carve-out, one row per `core.modules.key` (cross-schema FK into
-- `core`, never a parallel module-identity list).
--
-- Column-by-column, against §11's own field list:
--   - `enabled`  -- the platform-wide kill switch PLATFORM-P0-07.2 sets. Defaults `true` so
--     every existing module keeps working the moment this table starts existing (same
--     "opt-in override, defaults to today's behavior" stance every prior platform.* table
--     in this backlog has used, e.g. platform_login_branding/plan_modules). This migration
--     only lays the column down; nothing reads it for a real authorization decision yet --
--     that wiring (into the entitlement engine's `hasModule()` and `requireModule()`/the
--     route guard, explicitly NOT into RLS -- see PLATFORM-P0-07.2's own commit for why) is
--     that story's job, the same "table now, real enforcement in the next story" sequencing
--     `platform.plan_modules.enabled` (PLATFORM-P0-04.3) itself went through before
--     PLATFORM-P0-05.x wired anything to it.
--   - `visible`  -- shown in a future module picker/marketing surface even though a module
--     might be enabled-but-not-yet-announced (e.g. crm/gst per CLAUDE.md's own "skeletons
--     for now"). Defaults `true`. Deliberately NOT wired into `module-registry`'s own
--     nav-building today -- that package is a separate, static, compile-time manifest
--     (00-MASTER-PLAN.md §6) and wiring a DB-backed flag into it is real integration work
--     this story doesn't need to do to satisfy "manage" (view/set the flag), the same
--     "no consumer yet" boundary this backlog's Usage & Limits stories (06.1/06.4/06.5) drew
--     repeatedly for their own not-yet-wired fields/components.
--   - `status`   -- PLATFORM-P0-07.3's own four-value enum
--     (available/read_only/maintenance/disabled) is folded into this column's CHECK
--     constraint now, the same way PLATFORM-P0-04.7's plan-lifecycle enum was folded into
--     PLATFORM-P0-04.1's own `platform.plans.status` column rather than left as a placeholder
--     ("a status column with no real lifecycle values would be an incomplete column, not
--     deferred scope" -- that migration's own docstring). 07.3's own remaining scope (the
--     optional customer-facing message column, and wiring read_only/maintenance/disabled
--     into real request-time behavior) is still that story's own commit, not this one's.
--     Default `'available'` -- every existing module keeps working unchanged.
--   - `version`  -- a superadmin-set free-text label, NOT read from any package.json (every
--     module workspace package is pinned at the placeholder `0.0.0`, per ADR-1/ADR-2's "one
--     deployable, modules are packages not independently released services" -- there is no
--     real per-module release version anywhere in this monorepo to read from). Nullable;
--     no default, so an unset module simply shows nothing rather than a fabricated number
--     (this backlog's own repeated "no fabricated data" stance, e.g. PLATFORM-P0-02.1's
--     honest MRR/ARR "--").
--   - `licensed`, `minimum_plan` -- deliberately NOT stored columns. `licensed` is true for
--     every row here by construction (every `core.modules` row is, by definition, a
--     licensable module -- `core.licenses.module_key` already FKs into it); a stored boolean
--     that is always true today and has no independent write path would be exactly the kind
--     of speculative column CLAUDE.md development principle #7 rules out. `minimum_plan` is
--     fully derivable from `platform.plan_modules` (PLATFORM-P0-04.3, already the canonical
--     "which plan includes this module" relationship) joined against `platform.plans.
--     display_order` -- storing it a second time here would create exactly the two
--     independently-writable sources of truth CLAUDE.md non-negotiable #5 ("if the concept
--     is already listed, use the canonical table") warns against; the admin UI's own data
--     layer computes both at read time instead (see `packages/core/src/admin/
--     platform-modules.ts`).
create table platform.modules (
  module_key text primary key references core.modules (key),

  enabled boolean not null default true,
  visible boolean not null default true,
  status text not null default 'available'
    check (status in ('available', 'read_only', 'maintenance', 'disabled')),
  version text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index modules_updated_by_idx on platform.modules (updated_by);

-- Seed: one row per existing core.modules key, every default left as-is (every module
-- enabled, visible, available, no version set) -- mirrors platform.plan_modules' own
-- "cross-schema seed from core.modules" shape exactly.
insert into platform.modules (module_key)
select key from core.modules;

alter table platform.modules enable row level security;

-- Same shape PLATFORM-P0-05.2/05.3's own catalog-widening migration
-- (20260912080000_platform_catalog_authenticated_read.sql) already established for every
-- sibling plan-catalog table: SELECT open to any authenticated user from the start (the
-- route guard/requireModule() enforcement PLATFORM-P0-07.2 adds runs as the signed-in
-- business member, not a superadmin, and needs to read `enabled`/`status` the same way it
-- already reads `core.licenses`) -- INSERT/UPDATE stay superadmin-only. No DELETE
-- policy/grant at all: every module key this table will ever hold arrives via the same
-- migration that adds it to `core.modules`, seeded the same way this migration's own insert
-- above does -- there is no "remove a module from the registry" operation for the app layer
-- to need, the same "don't grant a capability nothing calls" stance
-- platform.admins/platform.plans/platform.plan_modules already established for their own
-- unused paths.
create policy "authenticated users can view the module registry" on platform.modules
  for select to authenticated
  using (true);

create policy "superadmins can insert module registry rows" on platform.modules
  for insert to authenticated
  with check (platform.is_superadmin());

create policy "superadmins can update module registry rows" on platform.modules
  for update to authenticated
  using (platform.is_superadmin())
  with check (platform.is_superadmin());

grant select, insert, update on platform.modules to authenticated;
grant all on platform.modules to service_role;
