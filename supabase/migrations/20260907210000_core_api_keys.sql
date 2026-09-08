-- Public REST API v1, promoted from stockpilot-ai-ops's src/lib/api-v1/* (SP-7's own
-- spec line: "promote public_api_v1 + api-v1 lib to core") -- core.api_keys/
-- api_key_secrets/api_rate_limit_counters, business-scoped instead of org-scoped, plus
-- two service-role-only helper functions the API layer needs and the ordinary
-- authenticated path (core.next_number(), C-7's has_permission()) can't safely serve.
--
-- Design carried over unchanged from the source migration's own header comment: an API
-- key snapshots the issuing user's role's permission set at creation time -- a fixed
-- list of permission keys, not a live pointer to their role -- rather than impersonating
-- that user's JWT per request. Reads (GET) only require a valid, non-revoked key for the
-- business; writes (POST/PATCH) require the specific permission in the key's snapshot,
-- checked in application code (packages/core/src/api-v1/*) since these requests carry no
-- Supabase session for RLS to key off of -- the API layer runs as service_role and is
-- solely responsible for scoping every query to the key's own business_id and for this
-- permission check, mirroring what has_permission()/RLS already enforce for the UI.
--
-- Deliberately core-owned, not module-inventory-owned: an API key's permission snapshot
-- is generic (any permission key from any module could appear in it), so a future
-- module exposing its own public API v1 resources reuses this same table rather than
-- growing a parallel one -- matches the entity-ownership map's "core owns everything
-- cross-module" (00-MASTER-PLAN.md §5). Only inventory resources exist under
-- packages/module-inventory/src/api-v1/resources today; that's a router-level fact, not
-- a schema one.
--
-- No "tenant AND licensed" RLS gate on these tables themselves (non-negotiable #2 is
-- about a *licensed module's* tables -- api_keys isn't one, the same way
-- core.audit_log/core.domain_events aren't). What a key can actually reach IS
-- module-gated: the API layer runs as service_role (bypassing RLS, same situation the
-- admin demo-seed tool already established), so packages/module-inventory/src/api-v1/
-- router.ts explicitly calls core licensing's hasModule() before dispatching to any
-- inventory resource -- an inventory license that lapses stops working through the API
-- exactly like it stops working in the UI, even though a still-valid key can always list
-- itself in Settings.

create table core.api_keys (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  name text not null,
  -- First 12 chars of the raw key (e.g. "sk_live_ab12"), shown in the UI so an admin can
  -- tell keys apart without ever re-displaying the full value after creation.
  key_prefix text not null,
  -- Snapshot of the issuing user's role's permission keys at the moment this key was
  -- created (see header comment).
  permissions text[] not null default '{}',
  created_by uuid not null default auth.uid(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- The actual secret, split into its own table with no client-facing SELECT/UPDATE/DELETE
-- policy at all -- same secrecy pattern as gst.eway_bill_credentials/einvoice_credentials,
-- adapted for a table with many rows instead of one per business. Only ever written once
-- at creation; read back only by the service-role API layer verifying an incoming
-- request's bearer token.
create table core.api_key_secrets (
  api_key_id uuid primary key references core.api_keys (id) on delete cascade,
  key_hash text not null unique
);

create index api_keys_business_id_idx on core.api_keys (business_id);

grant select, insert, update on core.api_keys to authenticated;
grant all on core.api_keys to service_role;
grant insert on core.api_key_secrets to authenticated;
grant all on core.api_key_secrets to service_role;
alter table core.api_keys enable row level security;
alter table core.api_key_secrets enable row level security;

create policy "business read" on core.api_keys for select to authenticated
  using (core.has_permission(business_id, 'settings.manage'));
create policy "business write" on core.api_keys for insert to authenticated
  with check (core.has_permission(business_id, 'settings.manage'));
-- Revoking (and renaming) a key is an UPDATE, not a DELETE -- api_keys stays append-only
-- so Settings can show a full history of every key ever issued, like audit_log.
create policy "business update" on core.api_keys for update to authenticated
  using (core.has_permission(business_id, 'settings.manage'))
  with check (core.has_permission(business_id, 'settings.manage'));

create policy "business write" on core.api_key_secrets for insert to authenticated
  with check (exists (
    select 1 from core.api_keys k
    where k.id = api_key_id and core.has_permission(k.business_id, 'settings.manage')
  ));

-- Per-business, per-minute request counter -- a sane default rate limit. No
-- client-facing policies: only the service-role API layer's check_api_rate_limit() call
-- touches this.
create table core.api_rate_limit_counters (
  business_id uuid not null references core.businesses (id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (business_id, window_start)
);
alter table core.api_rate_limit_counters enable row level security;
grant all on core.api_rate_limit_counters to service_role;

-- Atomic check-and-increment for the current minute's window. Returns false once the
-- business has exceeded `_limit` requests in this window, so the API layer can respond
-- 429 without a separate read-then-write race. SECURITY DEFINER + no authenticated
-- grant: only service_role (the API layer itself) ever calls this.
create function core.check_api_rate_limit(_business_id uuid, _limit integer default 120)
returns boolean language plpgsql security definer set search_path = core as $$
declare
  _window timestamptz := date_trunc('minute', now());
  _count integer;
begin
  insert into core.api_rate_limit_counters (business_id, window_start, request_count)
  values (_business_id, _window, 1)
  on conflict (business_id, window_start)
    do update set request_count = core.api_rate_limit_counters.request_count + 1
  returning request_count into _count;

  return _count <= _limit;
end; $$;
revoke all on function core.check_api_rate_limit(uuid, integer) from public;
grant execute on function core.check_api_rate_limit(uuid, integer) to service_role;

-- core.next_number()'s exact atomic-upsert logic (D-5), minus its
-- `p_business_id in (select core.user_business_ids())` membership check -- that check
-- resolves auth.uid() from the caller's own session, which is null under the
-- service-role client the API layer runs as (there's no session on an incoming API
-- request), so calling core.next_number() itself from here would reject every call.
-- SECURITY DEFINER + service_role-only grant, exactly like check_api_rate_limit() above:
-- a new, narrowly-scoped function rather than loosening core.next_number()'s own
-- authorization for every other caller. Shares the same core.number_sequences counter
-- core.next_number() uses (same business_id/scope/fiscal_year key), so a number minted
-- here continues the identical sequence the UI's own path would have produced -- never a
-- separate, colliding counter.
create function core.next_number_for_api(p_business_id uuid, p_scope text, p_prefix text)
returns text language plpgsql security definer set search_path = core as $$
declare
  v_start_month smallint;
  v_today date := current_date;
  v_fy text;
  v_n integer;
begin
  select fiscal_year_start_month into v_start_month
  from core.business_settings where business_id = p_business_id;
  v_start_month := coalesce(v_start_month, 4);

  if extract(month from v_today) >= v_start_month then
    v_fy := to_char(v_today, 'YY') || '-' || to_char(v_today + interval '1 year', 'YY');
  else
    v_fy := to_char(v_today - interval '1 year', 'YY') || '-' || to_char(v_today, 'YY');
  end if;

  insert into core.number_sequences (business_id, scope, fiscal_year, prefix, next_value)
  values (p_business_id, p_scope, v_fy, p_prefix, 2)
  on conflict (business_id, scope, fiscal_year)
    do update set next_value = core.number_sequences.next_value + 1
  returning next_value - 1 into v_n;

  return p_prefix || '/' || v_fy || '/' || lpad(v_n::text, 4, '0');
end;
$$;
revoke all on function core.next_number_for_api(uuid, text, text) from public;
grant execute on function core.next_number_for_api(uuid, text, text) to service_role;

-- core.has_module() (C-3) is granted to `authenticated` only -- there's no session (so
-- no authenticated role) on an incoming API request, so the service-role API layer
-- needs its own grant to call it. Purely additive: has_module()'s own body has no
-- auth.uid()/session dependency to begin with (it's a plain business_id + module_key +
-- status lookup), so this doesn't change what the function does for any existing
-- caller -- only who else may call it.
grant execute on function core.has_module(uuid, text) to service_role;
