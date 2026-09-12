-- PLATFORM-P0-06.1 ("Usage Counters", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §10)
-- -- decision #3 from this run's own task brief, deferred here specifically for this
-- moment: "Usage counters live in a new shared core.usage_counters table that each
-- module writes to directly, business-scoped, when it performs a countable action."
--
-- `core`, not `platform`: this is a business's own operational data (how much of a
-- resource it has used), the same tenant-scoped category `core.business_settings`/
-- `core.licenses` already sit in -- not platform-operator-authored catalog data like
-- `platform.plan_limits`. Per this run's own task brief: "this is customer-facing
-- billing-adjacent data... so it follows core's own tenant RLS convention, not
-- platform's superadmin-only convention."
--
-- Shape: one row per (business, resource, period). `resource_key` reuses
-- `platform.plan_limits`' own closed 13-value list verbatim (kept in sync by hand, same
-- as `packages/core/src/entitlements/resource-keys.ts` does on the TypeScript side) --
-- a business's usage and its plan's limit must speak the same vocabulary, or
-- `getLimit()` could never honestly compare one against the other once PLATFORM-P0-06.3
-- wires enforcement up.
--
-- `period` is the resource's own accounting window: `'current'` (the default) is the
-- sentinel for a running, never-reset total -- the natural fit for a *standing count of
-- things that exist right now* (businesses, users, products, contacts, prospects,
-- opportunities, business_offerings -- each already has its own canonical table a module
-- could, in principle, COUNT(*) directly; a maintained counter here exists instead so
-- every resource dimension shares one uniform read/write surface, per this run's own task
-- brief, rather than half the dimensions being computed one way and half another). Any
-- other value is a `'YYYY-MM'` calendar-month key (UTC) for a *periodic consumption*
-- dimension that resets each month (ai_runs, ai_credits, whatsapp_conversations,
-- api_calls, automation_runs, storage) -- matching every seeded `platform.plans.billing_interval`
-- today (`'month'`); a year-interval plan's own periodization is left to whichever future
-- story actually sells one (no seeded plan uses `'year'` yet, so inventing that behavior
-- now would be speculative, per CLAUDE.md's "never implement speculative functionality").
--
-- No module writes to this table yet, per this run's own task brief ("you don't need
-- every module to actually start writing to it yet -- that's each module's own future
-- integration work"). This story builds the table, its RLS, and a real read/write query
-- surface (`packages/core/src/usage/`) other modules adopt as their own future stories
-- reach it -- the same "configuration/mechanism exists before anything real reads or
-- writes it" stance `platform.plan_modules`/`plan_features`/`plan_limits` themselves
-- already sat in before PLATFORM-P0-05 started consuming them.
create table core.usage_counters (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  resource_key text not null check (resource_key in (
    'businesses', 'users', 'business_offerings', 'products', 'contacts', 'prospects',
    'opportunities', 'ai_runs', 'ai_credits', 'whatsapp_conversations', 'storage',
    'api_calls', 'automation_runs'
  )),
  period text not null default 'current' check (period = 'current' or period ~ '^\d{4}-\d{2}$'),
  count integer not null default 0 check (count >= 0),

  updated_at timestamptz not null default now(),

  unique (business_id, resource_key, period)
);

create index usage_counters_business_id_idx on core.usage_counters (business_id);

create trigger usage_counters_set_updated_at
  before update on core.usage_counters
  for each row execute function core.set_updated_at();

alter table core.usage_counters enable row level security;

-- Read-only for a business's own members, the same tenant-scoped shape
-- `core.business_settings`/`core.audit_log` already use. No client-facing INSERT/UPDATE/
-- DELETE policy at all -- matching `core.audit_log`'s own "no client-facing write, one
-- SECURITY DEFINER function is the only path to a row" shape exactly (this is billing-
-- adjacent data: a business's own client being able to freely edit its own usage numbers
-- would defeat PLATFORM-P0-06.3's entire future point).
create policy "members can view usage counters for their businesses"
  on core.usage_counters for select
  using (business_id in (select core.user_business_ids()));

-- The one write path: an atomic upsert-and-increment, `security definer` so it runs with
-- the owning role's privileges (bypassing RLS, the same relationship
-- `core.write_audit_log()` already has to `core.audit_log`) -- but, unlike
-- `write_audit_log()`, this function itself re-checks tenant membership before writing
-- (`p_business_id in (select core.user_business_ids())`), since usage data is more
-- consequential to get wrong than an audit trail entry: a caller invoking this for a
-- business it doesn't belong to is rejected outright, not silently trusted the way a
-- lower-stakes logging helper can afford to be.
create function core.increment_usage_counter(
  p_business_id uuid,
  p_resource_key text,
  p_delta integer default 1,
  p_period text default 'current'
)
returns core.usage_counters
language plpgsql
security definer
set search_path = core
as $$
declare
  result core.usage_counters;
begin
  if p_business_id not in (select user_business_ids()) then
    raise exception 'increment_usage_counter: % is not a member of business %', auth.uid(), p_business_id;
  end if;

  insert into core.usage_counters (business_id, resource_key, period, count)
  values (p_business_id, p_resource_key, p_period, greatest(p_delta, 0))
  on conflict (business_id, resource_key, period)
  do update set count = greatest(core.usage_counters.count + p_delta, 0)
  returning * into result;

  return result;
end;
$$;

revoke execute on function core.increment_usage_counter(uuid, text, integer, text) from public, anon;
grant execute on function core.increment_usage_counter(uuid, text, integer, text) to authenticated;
