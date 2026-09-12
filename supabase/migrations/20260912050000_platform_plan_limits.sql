-- PLATFORM-P0-04.5/04.6: "Quantity Limits" + "Unlimited Support"
-- (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §8). Folded into one migration the same
-- way PLATFORM-P0-04.7's lifecycle enum was folded into PLATFORM-P0-04.1's own migration:
-- 04.6 is not a separate table, it is the *value semantics* of the one table 04.5 asks
-- for ("Configurable limits... must be data-driven" + "do not represent unlimited as an
-- arbitrary huge number") -- there is no way to build 04.5's table correctly without
-- already deciding 04.6's tri-state representation, so splitting them into two migrations
-- would only mean rewriting the first one moments later.
--
-- "Must be data-driven" is read here as: one generic table with a `resource_key` column,
-- not one column per resource (`max_users int, max_products int, ...`) -- the shape 04.1's
-- own `status`/`billing_interval` columns deliberately did NOT need this treatment
-- (small, genuinely fixed enumerations), but a list of 13 named, independently-evolving
-- resource dimensions is exactly the kind of thing a hardcoded column per dimension would
-- make painful to extend. That does not mean an unbounded free-text key, though: the doc
-- itself enumerates the exact 13 dimensions under "Configurable limits:", a closed list
-- the same way `billing_interval`'s two values or `login_background_style`'s three are
-- closed lists elsewhere in this schema -- enforced here with the same defense-in-depth
-- CHECK constraint pattern this file's own siblings already use, not a free-for-all.
--
-- 04.6's tri-state ("numeric limit / unlimited / disabled") is modelled as a `state`
-- column plus a `limit_value` that a row-level CHECK requires present only when
-- `state = 'limited'` -- so "unlimited" is never a magic number (say, 999999999) that a
-- future report or a naive `usage >= limit` comparison could quietly misinterpret, and
-- "disabled" (the resource is not available at all on this plan) is its own explicit
-- state, not limit_value = 0 (which would be indistinguishable from "allowed, but none
-- left").
--
-- Deliberately NOT seeded with any plan's actual limits: the doc's own §8.5 list is a
-- category list ("businesses, users, business offerings, products, ..."), not specific
-- numbers for Free/Pro/Max the way PLATFORM-P0-04.1's "Initial plans: Free/Pro/Max" line
-- was a literal instruction -- inventing "Free allows 3 businesses" here would be
-- fabricating a real pricing decision nothing in this backlog actually makes.
-- `platform.plan_limits` therefore starts empty; a missing (plan, resource_key) row means
-- "not yet configured," not a default the app should silently assume in either direction
-- -- the same "honestly report unconfigured, never fabricate a number" stance
-- PLATFORM-P0-02's own Configuration Health widget already established. What "no row"
-- should mean to a real authorization decision is explicitly left to PLATFORM-P0-05
-- (Entitlement Engine, "Not started") to decide when it actually wires this table into
-- one -- not invented here ahead of that story's own turn.
create table platform.plan_limits (
  plan_id uuid not null references platform.plans (id) on delete cascade,
  resource_key text not null check (resource_key in (
    'businesses', 'users', 'business_offerings', 'products', 'contacts', 'prospects',
    'opportunities', 'ai_runs', 'ai_credits', 'whatsapp_conversations', 'storage',
    'api_calls', 'automation_runs'
  )),

  state text not null check (state in ('limited', 'unlimited', 'disabled')),
  limit_value integer,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,

  primary key (plan_id, resource_key),
  constraint plan_limits_value_matches_state check (
    (state = 'limited' and limit_value is not null and limit_value >= 0)
    or (state in ('unlimited', 'disabled') and limit_value is null)
  )
);

create index plan_limits_updated_by_idx on platform.plan_limits (updated_by);

alter table platform.plan_limits enable row level security;

-- Superadmin-only select/insert/update/delete via platform.is_superadmin(). DELETE is
-- granted here, unlike platform.plan_modules (04.3) or platform.plans (04.1): those two
-- tables have no meaningful "unconfigured" state for a row's mere absence to represent
-- (every plan x module combo always has a row; a plan's own catalog fields are never
-- optional), but here "no row" is itself one of this table's own valid, intended states
-- ("not yet configured" -- see the docstring above), so a superadmin reverting a resource
-- back to that state genuinely needs to remove the row, not merely flip it to one of the
-- three configured states.
create policy "superadmins can view plan limits" on platform.plan_limits for select to authenticated
  using (platform.is_superadmin());

create policy "superadmins can insert plan limits" on platform.plan_limits for insert to authenticated
  with check (platform.is_superadmin());

create policy "superadmins can update plan limits" on platform.plan_limits for update to authenticated
  using (platform.is_superadmin())
  with check (platform.is_superadmin());

create policy "superadmins can delete plan limits" on platform.plan_limits for delete to authenticated
  using (platform.is_superadmin());

grant select, insert, update, delete on platform.plan_limits to authenticated;
grant all on platform.plan_limits to service_role;
