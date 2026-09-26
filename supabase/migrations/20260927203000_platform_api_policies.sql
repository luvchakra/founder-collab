-- PLATFORM-P1-06.1/06.2/06.3/06.4 ("Platform API Administration",
-- docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §28).
--
-- Entity-ownership check: the per-minute API rate limit already has a home --
-- platform.system_policies.rate_limit_api_per_minute (PLATFORM-P0-14.3) -- and is not
-- duplicated here; this migration adds only what nothing owns yet, and the public API now
-- actually enforces both (packages/core/src/api-v1/policy.ts):
--
--   06.1 API policy: burst_limit_per_second (short spikes, on top of the per-minute limit)
--        and max_payload_kb (request body ceiling, 413 above it).
--   06.3 Webhook policy, for the webhooks WonderArk receives (billing today):
--        webhook_max_retries (how often a failed event is re-processed),
--        webhook_timeout_seconds (an event stuck in received/processing longer than this is
--        treated as timed out and retried), webhook_signature_tolerance_seconds (how old a
--        signed timestamp may be -- replay window). Signatures themselves are always
--        required; there is deliberately no switch to accept unsigned webhooks.
--   06.2 API key management: core.api_keys stays the one API-key table (business-scoped,
--        hashed secrets in core.api_key_secrets). A superadmin can see every business's
--        keys (metadata only -- never a hash) and revoke one with a reason, audited.
--        No separate "platform service key" is created: nothing on the platform calls the
--        public API as the platform itself, so there is no key that is "required" yet.
--   06.4 API usage: core.api_rate_limit_counters already counts requests per business
--        per minute; platform.api_error_counters adds the error side (hourly, per status
--        code, no tenant data), written by the API dispatcher.
--
-- Burst counting needs a per-second window, kept in its own small table so the existing
-- per-minute counter rows (and everything that reads them) are untouched.

create table platform.api_policies (
  id boolean primary key default true check (id),
  burst_limit_per_second integer not null default 20 check (burst_limit_per_second between 1 and 1000),
  max_payload_kb integer not null default 1024 check (max_payload_kb between 1 and 10240),
  webhook_max_retries integer not null default 8 check (webhook_max_retries between 0 and 20),
  webhook_timeout_seconds integer not null default 600 check (webhook_timeout_seconds between 60 and 86400),
  webhook_signature_tolerance_seconds integer not null default 300 check (webhook_signature_tolerance_seconds between 30 and 3600),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into platform.api_policies (id) values (true);

create index api_policies_updated_by_idx on platform.api_policies (updated_by);

alter table platform.api_policies enable row level security;

create policy "superadmins can view api policies" on platform.api_policies
  for select to authenticated using (platform.is_superadmin());

grant select on platform.api_policies to authenticated;
grant all on platform.api_policies to service_role;

create function platform.update_api_policies(
  p_burst_limit_per_second integer,
  p_max_payload_kb integer,
  p_webhook_max_retries integer,
  p_webhook_timeout_seconds integer,
  p_webhook_signature_tolerance_seconds integer,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_before platform.api_policies;
  v_after platform.api_policies;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.';
  end if;
  select * into v_before from platform.api_policies where id for update;
  update platform.api_policies set
    burst_limit_per_second = p_burst_limit_per_second,
    max_payload_kb = p_max_payload_kb,
    webhook_max_retries = p_webhook_max_retries,
    webhook_timeout_seconds = p_webhook_timeout_seconds,
    webhook_signature_tolerance_seconds = p_webhook_signature_tolerance_seconds,
    updated_at = now(),
    updated_by = auth.uid()
  where id
  returning * into v_after;
  perform platform.write_platform_audit_log(
    auth.uid(), 'updated', 'api_policies', null, 'high', btrim(p_reason), to_jsonb(v_before) - 'id', to_jsonb(v_after) - 'id'
  );
end;
$$;

revoke execute on function platform.update_api_policies(integer, integer, integer, integer, integer, text) from public, anon;
grant execute on function platform.update_api_policies(integer, integer, integer, integer, integer, text) to authenticated;

-- 06.4 / PLATFORM-P1-07.2: API error counts, hourly, per HTTP status. Platform-wide
-- aggregates only -- no business, key or payload is recorded.
create table platform.api_error_counters (
  hour timestamptz not null,
  status_code integer not null check (status_code between 400 and 599),
  error_count integer not null default 0,
  primary key (hour, status_code)
);

alter table platform.api_error_counters enable row level security;

create policy "superadmins can view api error counters" on platform.api_error_counters
  for select to authenticated using (platform.is_superadmin());

grant select on platform.api_error_counters to authenticated;
grant all on platform.api_error_counters to service_role;

create function platform.record_api_error(p_status_code integer)
returns void
language sql
security definer
set search_path = platform
as $$
  insert into platform.api_error_counters (hour, status_code, error_count)
  values (date_trunc('hour', now()), p_status_code, 1)
  on conflict (hour, status_code) do update set error_count = platform.api_error_counters.error_count + 1;
$$;

revoke execute on function platform.record_api_error(integer) from public, anon, authenticated;
grant execute on function platform.record_api_error(integer) to service_role;

-- 06.1 burst limit: per-business, per-second request counts. Service role only, like
-- core.api_rate_limit_counters; rows older than a minute are pruned as new ones arrive.
create table core.api_burst_counters (
  business_id uuid not null references core.businesses (id) on delete cascade,
  window_second timestamptz not null,
  request_count integer not null default 0,
  primary key (business_id, window_second)
);

alter table core.api_burst_counters enable row level security;
grant all on core.api_burst_counters to service_role;

create function core.check_api_burst_limit(_business_id uuid, _limit integer)
returns boolean
language plpgsql
security definer
set search_path = core
as $$
declare
  _window timestamptz := date_trunc('second', now());
  _count integer;
begin
  delete from core.api_burst_counters where business_id = _business_id and window_second < now() - interval '1 minute';
  insert into core.api_burst_counters (business_id, window_second, request_count)
  values (_business_id, _window, 1)
  on conflict (business_id, window_second)
    do update set request_count = core.api_burst_counters.request_count + 1
  returning request_count into _count;
  return _count <= _limit;
end;
$$;

revoke all on function core.check_api_burst_limit(uuid, integer) from public;
grant execute on function core.check_api_burst_limit(uuid, integer) to service_role;

-- 06.2: a superadmin revokes any business's API key, with a reason, audited. Revocation
-- is the only write (never delete: the key's history and last_used_at stay).
create function platform.revoke_business_api_key(p_key_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_before core.api_keys;
  v_after core.api_keys;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.';
  end if;
  select * into v_before from core.api_keys where id = p_key_id for update;
  if not found then
    raise exception 'Unknown API key.';
  end if;
  if v_before.revoked_at is not null then
    raise exception 'This API key is already revoked.';
  end if;
  update core.api_keys set revoked_at = now() where id = p_key_id returning * into v_after;
  perform platform.write_platform_audit_log(
    auth.uid(), 'updated', 'api_key', p_key_id::text, 'high', btrim(p_reason), to_jsonb(v_before), to_jsonb(v_after)
  );
end;
$$;

revoke execute on function platform.revoke_business_api_key(uuid, text) from public, anon;
grant execute on function platform.revoke_business_api_key(uuid, text) to authenticated;

-- 06.4: the API usage dashboard's aggregate -- requests per business per day over the
-- last p_days, and how many of them were over the per-minute limit (so were refused with
-- 429). Aggregated in SQL rather than paging raw per-minute counter rows into the app.
create function platform.api_usage_daily(p_days integer default 7)
returns table (day date, business_id uuid, requests bigint, rate_limited bigint)
language plpgsql
stable
security definer
set search_path = platform
as $$
declare
  v_limit integer;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select rate_limit_api_per_minute into v_limit from platform.system_policies where id;
  return query
    select (c.window_start at time zone 'UTC')::date, c.business_id,
           sum(c.request_count)::bigint,
           sum(greatest(c.request_count - coalesce(v_limit, 120), 0))::bigint
    from core.api_rate_limit_counters c
    where c.window_start >= date_trunc('day', now()) - make_interval(days => greatest(p_days, 1) - 1)
    group by 1, 2;
end;
$$;

revoke execute on function platform.api_usage_daily(integer) from public, anon;
grant execute on function platform.api_usage_daily(integer) to authenticated;
