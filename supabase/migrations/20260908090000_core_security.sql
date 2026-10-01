-- IT security hardening: a DB-backed rate limiter for the platform's anonymous,
-- unauthenticated entry points (public unsubscribe link, landing-page interest signup,
-- privacy self-service export). 00-MASTER-PLAN.md §5 already names
-- `core.api_rate_limit_counters` as the platform-wide home for rate-limit state
-- ("StockPilot's already-built tables promote to platform-wide") -- this is that table,
-- generalized from per-API-key to any opaque bucket key so the same mechanism serves the
-- public API (SP-7) when it lands.
--
-- A table plus a security-definer function, not Redis (ADR-5's "no Redis" applies here
-- as much as to the event bus). Fixed-window counting: one row per (key, window), an
-- upsert increments it atomically -- concurrent callers serialize on the row lock, so
-- the count can't be raced past the limit.
--
-- Keys never contain a raw IP address or email -- callers hash them first
-- (packages/core/src/security/rate-limit.ts), so this table holds no personal data
-- (GDPR/DPDP data minimization) and the purge below is housekeeping, not erasure.

create table core.api_rate_limit_counters (
  bucket_key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket_key, window_start)
);

create index api_rate_limit_counters_window_start_idx on core.api_rate_limit_counters (window_start);

-- RLS on with zero policies: only the service role (BYPASSRLS) and the security-definer
-- function below ever touch this table. Explicitly revoke the default-privilege grants
-- 20260907120000_grant_schema_privileges.sql gives `authenticated` on every new core table.
alter table core.api_rate_limit_counters enable row level security;
revoke all on core.api_rate_limit_counters from authenticated;

-- Returns true if this hit is within the limit (the caller should proceed), false if the
-- caller has exceeded `p_max` hits in the current `p_window_seconds` window.
create function core.rate_limit_hit(p_bucket_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = core
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_window_seconds <= 0 or p_max <= 0 then
    raise exception 'rate_limit_hit: window and max must be positive';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into core.api_rate_limit_counters (bucket_key, window_start, hits)
  values (p_bucket_key, v_window, 1)
  on conflict (bucket_key, window_start)
  do update set hits = core.api_rate_limit_counters.hits + 1
  returning hits into v_hits;

  return v_hits <= p_max;
end;
$$;

create function core.purge_rate_limit_counters(p_older_than interval default interval '1 day')
returns integer
language sql
security definer
set search_path = core
as $$
  with deleted as (
    delete from core.api_rate_limit_counters where window_start < now() - p_older_than returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke execute on function core.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke execute on function core.purge_rate_limit_counters(interval) from public, anon, authenticated;
grant execute on function core.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function core.purge_rate_limit_counters(interval) to service_role;
