-- PLATFORM-P0-04.1: "Plan Management" (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §8).
-- The platform-wide subscription/pricing catalog -- genuinely new: the entity-ownership
-- map (docs/plan/00-MASTER-PLAN.md §5) lists "License / entitlement" as
-- `core.modules`/`core.licenses`/`core.license_events`, but no "plan" concept at all;
-- PLATFORM-P0-03.1's own audit-log entry already flagged `core.business_settings.plan` as
-- "a free-text label, not a billing entity" -- exactly the gap this table closes. `platform`
-- schema, not `core`: this is platform-operator-authored catalog data (what plans *exist*
-- and what they cost/include), not a business's own tenant-scoped data, matching
-- CLAUDE.md non-negotiable #1's carve-out. PLATFORM-P0-05.4 ("Existing Licensing
-- Integration") is explicit that the entitlement engine must integrate with
-- `core.modules`/`core.licenses` rather than compete with it -- this table is the missing
-- catalog those tables' `module_key` values get priced/bundled against, not a
-- replacement for either.
--
-- Every PLATFORM-P0-04.1 field maps to a column:
--   name, description, price, billing interval, currency, status, display order,
--   marketing visibility
-- plus `key` (a stable machine-readable slug, e.g. 'pro' -- so renaming the display name
-- "Pro" -> "Growth" later never breaks a stored reference, matching `core.modules.key`'s
-- own role for module identity) and `updated_at`/`updated_by` (the same "minimal
-- accountability" scope `platform.branding` already established, still short of a full
-- history -- PLATFORM-P0-16/17's own future job).
--
-- PLATFORM-P0-04.7 ("Plan Lifecycle") is folded in for the `status` column itself, since
-- 04.1's own field list already names "status" and a plan record with no real lifecycle
-- enum would be an incomplete column, not a deferred feature: `draft`/`active`/
-- `deprecated`/`archived`, exactly the four values named. Its other rule -- "do not delete
-- plans that have historical subscribers" -- has no real subject yet (nothing references
-- `platform.plans` from `core.licenses` until PLATFORM-P0-05.4 wires the entitlement
-- engine to it), so this migration's own RLS grants simply never expose a DELETE path to
-- `authenticated` at all -- the same "no delete through the app, ever" pattern
-- `platform.branding`'s singleton row already uses -- rather than building a
-- subscriber-count check against a foreign key that doesn't exist yet.
--
-- Deliberately NOT built here (their own later sub-stories in this same §8 section):
--   - Module entitlements per plan (PLATFORM-P0-04.3)
--   - Feature-level entitlements per plan (PLATFORM-P0-04.4)
--   - Quantity limits, unlimited/disabled support (PLATFORM-P0-04.5/04.6)
--   - PLATFORM-P0-04.2 ("Plan Entitlements") is the composite view of the three tables
--     above once they exist -- not its own table.
--   - Wiring a business's actual license to a plan (PLATFORM-P0-05, Entitlement Engine).
create table platform.plans (
  id uuid primary key default gen_random_uuid(),

  key text not null unique check (key ~ '^[a-z0-9_]+$'),
  name text not null check (btrim(name) <> ''),
  description text,

  price numeric(14, 2) not null default 0 check (price >= 0),
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  currency text not null default 'INR',

  status text not null default 'draft' check (status in ('draft', 'active', 'deprecated', 'archived')),
  display_order integer not null default 0,
  marketing_visible boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index plans_status_display_order_idx on platform.plans (status, display_order);
create index plans_updated_by_idx on platform.plans (updated_by);

-- Initial plans the story names, seeded in ascending display order. `active` (not
-- `draft`) so they behave like a real, already-launched catalog out of the box --
-- PLATFORM-P0-02's own dashboard "Configuration Health" widget already tells a
-- superadmin when a platform-wide config surface is unconfigured; an empty plans table
-- would be exactly that kind of gap, not a deliberate blank slate.
insert into platform.plans (key, name, description, price, billing_interval, currency, status, display_order) values
  ('free', 'Free', 'Get started with core discovery tools at no cost.', 0, 'month', 'INR', 'active', 0),
  ('pro', 'Pro', 'For growing teams that need more usage headroom and every module.', 2999, 'month', 'INR', 'active', 1),
  ('max', 'Max', 'Highest limits and every feature, for teams running at scale.', 9999, 'month', 'INR', 'active', 2);

alter table platform.plans enable row level security;

-- Same shape as platform.branding: platform.is_superadmin() (SECURITY DEFINER) is the
-- actual RLS-backed boundary. Read/write for superadmins now (the story's own ask);
-- no delete policy at all -- see the lifecycle note above.
create policy "superadmins can view plans" on platform.plans for select to authenticated
  using (platform.is_superadmin());

create policy "superadmins can insert plans" on platform.plans for insert to authenticated
  with check (platform.is_superadmin());

create policy "superadmins can update plans" on platform.plans for update to authenticated
  using (platform.is_superadmin())
  with check (platform.is_superadmin());

grant select, insert, update on platform.plans to authenticated;
grant all on platform.plans to service_role;
