-- Schema foundation for PLATFORM-P0-05.2 onward (Entitlement Precedence), unblocking the
-- stop PLATFORM-P0-05.1's own audit entry left behind: "how does a business get assigned
-- to a `platform.plans` row?" This migration answers that with a real, user-approved
-- decision (2026-09-12, recorded in docs/design/platform-admin-portal-audit.md's own
-- entry for this story) rather than one this codebase invented on its own:
--
--   1. Every business gets a default plan. New businesses are assigned a plan at
--      creation (default: 'free'). Existing businesses are backfilled -- never left
--      unassigned.
--   2. `core.business_settings.plan` becomes a real foreign key into `platform.plans.key`,
--      replacing its previous free-text nature (default 'starter', matching no real seeded
--      plan -- PLATFORM-P0-04.1's and PLATFORM-P0-05.1's own audit entries already flagged
--      this exact gap).
--
-- This is a `core`-schema change made in service of a platform feature -- the one
-- legitimate case CLAUDE.md's own module-boundary rule allows a platform-workstream story
-- to touch `core`, since the FK target is `platform.plans` and the whole point is linking
-- the two (this migration's own task brief is explicit on this). It touches `core` +
-- `platform` only, no other module schema -- one non-core schema touched, satisfying
-- scripts/lint-migration-schema.mjs's own rule.
--
-- Live-data check performed before writing this migration (CLAUDE.md's "live source of
-- truth" rule, and this run's own task brief: "query the live dev project first"): the
-- **dev** project (jazdtomcgqjxjueedmck) has 5 `core.businesses` rows but only 1
-- `core.business_settings` row (plan = 'growth', matching no seeded `platform.plans.key`
-- either) -- confirming both halves of the gap at once: most businesses have no settings
-- row at all today (business_settings has always been created lazily, on a module's first
-- write -- see module-gst/module-inventory's own "no default row per business" comments),
-- and the one row that exists holds a plan value that isn't real. The backfill below fixes
-- both: it creates a settings row (defaulting to the new 'free' default) for every
-- business that doesn't have one, and normalizes every existing plan value that doesn't
-- match a real `platform.plans.key` to 'free' -- preserving any that already do (e.g. a
-- future 'pro'/'max' row), per the user's own instruction.

-- ---------------------------------------------------------------------------
-- 1. Default going forward: 'free', not 'starter' (which never matched a real plan).
-- ---------------------------------------------------------------------------

alter table core.business_settings alter column plan set default 'free';

-- ---------------------------------------------------------------------------
-- 2. Backfill existing data -- normalize unmatched plan values, then create a settings
-- row (using the new default) for every business that doesn't have one yet.
-- ---------------------------------------------------------------------------

update core.business_settings
set plan = 'free'
where plan not in (select key from platform.plans);

insert into core.business_settings (business_id)
select b.id
from core.businesses b
left join core.business_settings s on s.business_id = b.id
where s.business_id is null;

-- ---------------------------------------------------------------------------
-- 3. The FK itself -- only safe to add now that every row's value is guaranteed valid.
-- No ON DELETE/UPDATE action needed: `platform.plans` rows are never deleted (no delete
-- policy/grant exists on that table, per PLATFORM-P0-04.1's own migration) and `key` is
-- immutable after creation (the application layer's updatePlatformPlanSchema omits it,
-- per platform-plans.ts's own docstring) -- there is no real update/delete path this FK
-- would ever need to react to.
-- ---------------------------------------------------------------------------

alter table core.business_settings
  add constraint business_settings_plan_fkey foreign key (plan) references platform.plans (key);

create index business_settings_plan_idx on core.business_settings (plan);

-- ---------------------------------------------------------------------------
-- 4. Default-plan-at-creation, going forward: every new business gets a
-- `core.business_settings` row the moment it's created, not lazily on a module's first
-- write. This is a DB-level guarantee (a trigger on `core.businesses`, the exact
-- auto-provisioning pattern `core.handle_new_user()` already established for
-- accounts/account_members on new-user signup) rather than something added to any one
-- module's own business-creation code path -- `createBusiness()` lives in
-- `module-discovery` (a different workstream's territory this run must not touch), and a
-- DB trigger guarantees the row exists no matter which future path ever creates a
-- business, not just today's one caller.
--
-- `on conflict (business_id) do nothing` makes this safe to run even if a caller (or a
-- future migration) ever inserts a business_settings row itself in the same transaction.
-- SECURITY DEFINER + table-owner privileges bypass RLS the same way handle_new_user()'s
-- insert into core.account_members already does -- this is not a new privilege-escalation
-- pattern, it's the one already in use one migration over.
-- ---------------------------------------------------------------------------

create function core.handle_new_business()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  insert into core.business_settings (business_id)
  values (new.id)
  on conflict (business_id) do nothing;
  return new;
end;
$$;

revoke execute on function core.handle_new_business() from public, anon, authenticated;

create trigger on_core_business_created
  after insert on core.businesses
  for each row execute function core.handle_new_business();
