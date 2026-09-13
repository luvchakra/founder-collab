-- PLATFORM-P0-14.1/14.2/14.3 ("Platform Policies", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
-- §18) -- CONFIG-ONLY, the same scope every prior `platform.*` policy table in this backlog
-- has used (`platform.ai_feature_policies`, `platform.notification_policies`,
-- `platform.compliance_*`). §18's own text is three flat lists of field names and two
-- one-sentence "must take precedence" warnings about country-specific rules -- no worked
-- example implying a specific enforcement algorithm, so this is not a 09.3/10.2-style
-- stop-and-report case.
--
-- **Entity-ownership check (CLAUDE.md non-negotiable #5)**: grepped the full migration
-- timeline and both `docs/plan/00-MASTER-PLAN.md` §5 and this codebase for
-- "system_polic"/"session_duration"/"password_policy"/"data_retention"/"audit_retention" --
-- zero hits anywhere. Genuinely new. Two real, adjacent-but-distinct concepts already exist
-- and are NOT duplicated by this table:
--   - `core.business_settings.timezone`/`.currency` -- a *specific business's own* setting
--     (defaults `'Asia/Kolkata'`/`'INR'` baked into that table's own column DEFAULT). This
--     migration's `default_timezone`/`default_currency` are the platform-wide default a new
--     business effectively gets today via that same hardcoded column default -- recording the
--     SAME real fact administratively, not inventing a new one, mirrors PLATFORM-P0-13.1's
--     own "seed from the live catalog, not invented" discipline. No runtime code is wired to
--     read this table to actually set a new business's default (see below) -- the existing
--     column DEFAULT keeps doing that job unchanged.
--   - `core.check_api_rate_limit(_business_id, _limit default 120)` -- a real, live,
--     per-business-per-minute API rate limiter, already enforced. `rate_limit_api_per_minute`
--     here mirrors that function's own real hardcoded default (120) for the same reason --
--     this table does NOT replace or get read by that function (see below); a future story
--     wiring the two together is separate, explicitly deferred work.
--   - `apps/web/app/(auth)/actions.ts`'s hardcoded `password.length < 8` (both signup and
--     password-reset) -- `password_min_length` mirrors that real enforced value. This table
--     is not read by that file.
-- No other field in §18's three lists (session duration, password complexity flags, file
-- size limit, AI/webhooks/imports/exports/automation rate limits, data/audit retention) has
-- any existing enforced value anywhere in this codebase to mirror or duplicate -- confirmed
-- by grep, not assumed -- so those columns are left nullable ("not yet configured"), the
-- same "no fabricated ceiling" discipline `platform.ai_feature_policies`' own token/cost/
-- budget columns already established.
--
-- **§18's own two "must take precedence" sentences are a documented, deliberate design
-- constraint, not a story asking for a precedence-resolution engine to be built**: this
-- table's own values are platform-wide *fallback defaults*, never an override of a
-- country/regime-specific rule. `gst.tax_rules` (country/regime-specific tax content) and any
-- future country-specific retention rule remain entirely outside this table's reach --
-- nothing in this migration or its application layer reads, writes, or composes against
-- `gst.*` in any way, matching the file-scope boundary this workstream has held throughout
-- (most recently PLATFORM-P0-13's own entry). Recorded here so a future reader does not
-- mistake the *absence* of a precedence engine for an oversight.
--
-- **Singleton by construction**, the same pattern `platform.branding`/
-- `platform.ai_feature_policies`/`platform.notification_policies` all already use: exactly
-- one platform-wide policy row, never a list.
--
-- **14.1's own "API rate limits" field is superseded, not duplicated, by 14.3's more granular
-- six-field list** (API/AI/webhooks/imports/exports/automation) -- the same "same field, a
-- later section names it more precisely" relationship PLATFORM-P0-09.4/10.1's own "daily
-- budget" field already had with each other, resolved the same way: one column per 14.3's own
-- named domain, not a generic `api_rate_limit` column plus a separate, narrower table. **14.2
-- ("Data Retention Policy") names no field 14.1 doesn't already list** ("data retention
-- defaults, audit retention") -- 14.2's own text ("Configure platform-level defaults... Country
-- ... retention must take precedence") is the identical concept restated with the precedence
-- caveat, not a second table; `data_retention_default_days`/`audit_retention_days` below
-- satisfy both 14.1 and 14.2 at once, the same "one field, two sections naming it" resolution
-- 13.1/13.2's own three-table hierarchy used for its own overlapping doc text.
--
-- **Password policy's own sub-shape (min length + three complexity flags) is this run's own
-- non-security data-modeling judgment call** (this workstream's own task brief marks "which
-- existing pattern to reuse, exact naming" as non-security) -- §18 names "password policy" as
-- one flat item with no sub-fields of its own; min-length-plus-complexity-flags is the
-- ordinary shape this concept takes everywhere else, and mirrors the one real password rule
-- this codebase already enforces (min length) by extension rather than invention.
--
-- **Audited-mutation pattern, mirroring `platform.ai_feature_policies` exactly, not
-- `platform.notification_policies`'s lighter plain-RLS shape**: unlike three notification
-- toggles nobody could weaponize, several of these fields are genuinely security-postured by
-- name (session duration, password complexity) even though none is enforced by any runtime
-- code yet (see above) -- a future reader auditing "who loosened the password policy and why"
-- needs a real trail. No INSERT/UPDATE/DELETE grant to `authenticated` at all; every change
-- goes through `platform.update_system_policies()`, which requires a genuine SUPERADMIN and a
-- non-empty `reason`, and writes one atomic audit-trail row to a dedicated
-- `platform.system_policy_events` table (a policy-wide change doesn't belong in a per-plan or
-- per-provider audit table, the same reasoning every sibling dedicated events table in this
-- backlog already used).
--
-- **No code anywhere reads this table to make a real decision yet.** `session_duration_minutes`
-- does not configure Supabase Auth's own JWT expiry (a project-level setting this table cannot
-- reach); `password_min_length`/the three complexity flags are not read by
-- `apps/web/app/(auth)/actions.ts`; `max_file_size_mb` is not read by any attachment-upload
-- path; none of the six rate-limit columns is read by `core.check_api_rate_limit()` or any
-- AI/webhook/import/export/automation code path; `default_timezone`/`default_currency` do not
-- change what a newly-created `core.business_settings` row gets (its own column DEFAULT still
-- decides that); `data_retention_default_days`/`audit_retention_days` trigger no purge job.
-- Real enforcement of any of this is explicitly out of scope for a "Configure" story, the same
-- "table now, enforcement later" sequencing this entire backlog has used throughout.
create table platform.system_policies (
  id boolean primary key default true check (id),

  session_duration_minutes integer check (session_duration_minutes is null or session_duration_minutes > 0),

  password_min_length integer not null default 8 check (password_min_length > 0),
  password_require_uppercase boolean not null default false,
  password_require_number boolean not null default false,
  password_require_symbol boolean not null default false,

  max_file_size_mb integer check (max_file_size_mb is null or max_file_size_mb > 0),

  default_timezone text not null default 'Asia/Kolkata',
  default_currency text not null default 'INR',

  data_retention_default_days integer check (data_retention_default_days is null or data_retention_default_days > 0),
  audit_retention_days integer check (audit_retention_days is null or audit_retention_days > 0),

  rate_limit_api_per_minute integer not null default 120 check (rate_limit_api_per_minute > 0),
  rate_limit_ai_per_minute integer check (rate_limit_ai_per_minute is null or rate_limit_ai_per_minute > 0),
  rate_limit_webhooks_per_minute integer check (rate_limit_webhooks_per_minute is null or rate_limit_webhooks_per_minute > 0),
  rate_limit_imports_per_hour integer check (rate_limit_imports_per_hour is null or rate_limit_imports_per_hour > 0),
  rate_limit_exports_per_hour integer check (rate_limit_exports_per_hour is null or rate_limit_exports_per_hour > 0),
  rate_limit_automation_per_minute integer check (rate_limit_automation_per_minute is null or rate_limit_automation_per_minute > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- Seed: exactly the real values this codebase already enforces or defaults elsewhere
-- (password_min_length=8, default_timezone/default_currency='Asia/Kolkata'/'INR',
-- rate_limit_api_per_minute=120 -- see the header comment above for each one's real source),
-- everything else left null ("not yet configured") -- no fabricated ceiling.
insert into platform.system_policies (id) values (true);

create index system_policies_updated_by_idx on platform.system_policies (updated_by);

create table platform.system_policy_events (
  id uuid primary key default gen_random_uuid(),
  previous_value jsonb not null,
  new_value jsonb not null,
  reason text not null check (btrim(reason) <> ''),
  performed_by uuid references auth.users (id) on delete set null,
  performed_at timestamptz not null default now()
);

create index system_policy_events_performed_by_idx on platform.system_policy_events (performed_by);

alter table platform.system_policies enable row level security;
alter table platform.system_policy_events enable row level security;

-- SELECT open to any authenticated user, the same "avoid a second widening migration later"
-- reasoning every sibling `platform.*` policy table in this backlog already used: a future
-- enforcement consumer (a signup form displaying live password requirements, an upload
-- dialog checking a file-size ceiling client-side) will most likely need to read this as an
-- ordinary signed-in business member's own request, not exclusively a SUPERADMIN. Nothing
-- secret lives on this table. No INSERT/UPDATE/DELETE grant to `authenticated` at all.
create policy "authenticated users can view the platform system policy" on platform.system_policies
  for select to authenticated
  using (true);

grant select on platform.system_policies to authenticated;
grant all on platform.system_policies to service_role;

-- Sensitive operational history, the same trust level every sibling `platform.*` audit
-- table in this backlog already established -- SUPERADMIN-only SELECT, no direct write
-- grant at all.
create policy "superadmins can view system policy events" on platform.system_policy_events
  for select to authenticated
  using (platform.is_superadmin());

grant select on platform.system_policy_events to authenticated;
grant all on platform.system_policy_events to service_role;

create function platform.update_system_policies(
  p_session_duration_minutes integer,
  p_password_min_length integer,
  p_password_require_uppercase boolean,
  p_password_require_number boolean,
  p_password_require_symbol boolean,
  p_max_file_size_mb integer,
  p_default_timezone text,
  p_default_currency text,
  p_data_retention_default_days integer,
  p_audit_retention_days integer,
  p_rate_limit_api_per_minute integer,
  p_rate_limit_ai_per_minute integer,
  p_rate_limit_webhooks_per_minute integer,
  p_rate_limit_imports_per_hour integer,
  p_rate_limit_exports_per_hour integer,
  p_rate_limit_automation_per_minute integer,
  p_reason text
)
returns platform.system_policies
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_prev platform.system_policies;
  v_row platform.system_policies;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can change platform policies.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to change platform policies.';
  end if;
  if p_password_min_length is null then
    raise exception 'Password minimum length is required.';
  end if;
  if p_default_timezone is null or btrim(p_default_timezone) = '' then
    raise exception 'Default timezone is required.';
  end if;
  if p_default_currency is null or btrim(p_default_currency) = '' then
    raise exception 'Default currency is required.';
  end if;
  if p_rate_limit_api_per_minute is null then
    raise exception 'API rate limit is required.';
  end if;

  select * into v_prev from platform.system_policies where id = true for update;

  update platform.system_policies
  set session_duration_minutes = p_session_duration_minutes,
      password_min_length = p_password_min_length,
      password_require_uppercase = p_password_require_uppercase,
      password_require_number = p_password_require_number,
      password_require_symbol = p_password_require_symbol,
      max_file_size_mb = p_max_file_size_mb,
      default_timezone = btrim(p_default_timezone),
      default_currency = upper(btrim(p_default_currency)),
      data_retention_default_days = p_data_retention_default_days,
      audit_retention_days = p_audit_retention_days,
      rate_limit_api_per_minute = p_rate_limit_api_per_minute,
      rate_limit_ai_per_minute = p_rate_limit_ai_per_minute,
      rate_limit_webhooks_per_minute = p_rate_limit_webhooks_per_minute,
      rate_limit_imports_per_hour = p_rate_limit_imports_per_hour,
      rate_limit_exports_per_hour = p_rate_limit_exports_per_hour,
      rate_limit_automation_per_minute = p_rate_limit_automation_per_minute,
      updated_by = auth.uid(),
      updated_at = now()
  where id = true
  returning * into v_row;

  insert into platform.system_policy_events (previous_value, new_value, reason, performed_by)
  values (to_jsonb(v_prev), to_jsonb(v_row), btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.update_system_policies(
  integer, integer, boolean, boolean, boolean, integer, text, text, integer, integer,
  integer, integer, integer, integer, integer, integer, text
) from public, anon;
grant execute on function platform.update_system_policies(
  integer, integer, boolean, boolean, boolean, integer, text, text, integer, integer,
  integer, integer, integer, integer, integer, integer, text
) to authenticated;
