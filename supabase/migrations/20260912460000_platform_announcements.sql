-- PLATFORM-P0-15.1/15.2/15.3/15.4 ("Global Announcements / Maintenance",
-- docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §19) -- a platform-wide announcement
-- catalog: type, audience targeting, a publish/expire schedule, and (for maintenance-type
-- announcements) a maintenance window plus affected modules. CONFIG-ONLY, the same scope
-- every prior `platform.*` catalog in this backlog has used.
--
-- **Entity-ownership check (CLAUDE.md non-negotiable #5)**: grepped
-- `docs/plan/00-MASTER-PLAN.md` §5 and the full repo for "announcement" -- no entity exists
-- yet. Two adjacent, genuinely distinct concepts already exist and are NOT duplicated:
--   - `platform.email_templates`'s fixed `system_announcements` purpose (PLATFORM-P0-11.2)
--     is a reusable EMAIL FORMATTING template (subject/body with merge fields) for
--     notifying people about an announcement by email -- a future delivery mechanism, not
--     the announcement's own data. This migration does not read, write, or reference
--     `platform.email_templates` at all; wiring the two together (send an email when an
--     announcement is created) is explicitly out of this story's scope, matching every
--     prior "table now, real wiring later" precedent in this backlog.
--   - `platform.modules.status` (PLATFORM-P0-07.3) already has a per-MODULE `'maintenance'`
--     status value -- an instant, indefinite, manually-toggled access-control state with
--     real enforcement (it blocks routes/writes). This table's own "Maintenance" is a
--     different concept entirely: a scheduled, time-bounded, purely informational
--     announcement (a banner/notice with a start/end and a message), never gating access
--     to anything. Building this does not touch, read, or change `platform.modules` in any
--     way -- confirmed by grep, not assumed.
-- `packages/core/src/admin/platform-dashboard-queries.ts`'s own `getRecentGlobalChanges()`
-- docstring already anticipated this table ("announcements from PLATFORM-P0-15") as a
-- future global-changes-feed source -- not built this story (see "deliberately not built"
-- below); that file is left untouched.
--
-- **15.4's own "message" field is the SAME field as every other announcement's own body,
-- not a maintenance-only extra column** -- the same "one field, two sections naming it"
-- resolution PLATFORM-P0-13/14's own overlapping doc text already used repeatedly in this
-- backlog: `message` exists once, on every announcement regardless of type, and is what
-- 15.4 means by its own "message" when `type = 'maintenance'`.
--
-- **List-shaped, mirroring `platform.feature_flags` exactly, not a singleton** -- an
-- announcement catalog is naturally many rows over time (08.1-08.4's own precedent for
-- "Manage"/"Publish" language describing a growable list, not a fixed config row).
-- Create/update/delete, all through SECURITY DEFINER functions requiring a genuine
-- SUPERADMIN and a non-empty `reason`, writing one atomic JSONB-snapshot audit event per
-- call to `platform.announcement_events` -- the identical shape
-- `platform.feature_flags`/`feature_flag_events` already established, reused rather than
-- re-derived. `type`/`audience_type`/`audience_plan_id`/`audience_country_code` are
-- immutable after creation (an announcement's own audience is its identity, the same
-- "scope immutable after creation" reasoning PLATFORM-P0-08's own migration already used
-- for a feature flag's scope) -- only `title`/`message`/the schedule/the maintenance
-- window/`affected_modules`/`enabled` are ever updated.
--
-- **Audience targeting reuses real catalogs where they now exist**: `audience_plan_id`
-- references `platform.plans` (exactly like `feature_flags.scope_plan_id`).
-- `audience_country_code` references `platform.compliance_countries` (PLATFORM-P0-13.1) --
-- unlike `feature_flags.scope_country_code`, which had to fall back to a plain
-- ISO-alpha-2-shaped text column because no country registry existed yet at the time that
-- migration was written (its own docstring says so explicitly), a real canonical country
-- catalog exists now, so this table references it properly instead of repeating the
-- now-avoidable free-text pattern. `compliance_countries` rows are never deletable (no
-- DELETE grant exists to anyone, per that migration), so this FK's own ON DELETE behavior
-- is inert in practice; declared with no special action for schema clarity regardless.
--
-- **No runtime consumer reads this table yet.** No banner/notice-rendering component
-- exists anywhere in `apps/web`'s customer-facing dashboard; `enabled`/`publish_at`/
-- `expire_at` are not evaluated by any request path; `affected_modules`/the maintenance
-- window do not gate or warn on anything in `requireModule()`/`hasModule()`/
-- `middleware.ts`; no email is sent when an announcement is created. Building a real
-- audience-resolution-and-display system is a materially larger, separate future story,
-- matching this backlog's own "table now, enforcement/wiring later" sequencing throughout.
create table platform.announcements (
  id uuid primary key default gen_random_uuid(),

  type text not null check (type in ('information', 'warning', 'maintenance', 'critical')),
  title text not null check (char_length(btrim(title)) > 0 and char_length(title) <= 200),
  message text not null check (char_length(btrim(message)) > 0 and char_length(message) <= 5000),

  audience_type text not null check (audience_type in ('all_customers', 'all_users', 'specific_plan', 'specific_country')),
  audience_plan_id uuid references platform.plans (id) on delete cascade,
  audience_country_code text references platform.compliance_countries (country_code),
  check (
    (audience_type in ('all_customers', 'all_users') and audience_plan_id is null and audience_country_code is null)
    or (audience_type = 'specific_plan' and audience_plan_id is not null and audience_country_code is null)
    or (audience_type = 'specific_country' and audience_country_code is not null and audience_plan_id is null)
  ),

  publish_at timestamptz,
  expire_at timestamptz,
  check (publish_at is null or expire_at is null or expire_at > publish_at),

  -- Meaningful only when type = 'maintenance' -- enforced below, not merely a convention.
  maintenance_start timestamptz,
  maintenance_end timestamptz,
  check (maintenance_start is null or maintenance_end is null or maintenance_end > maintenance_start),
  affected_modules text[] not null default '{}',
  check (
    type = 'maintenance'
    or (maintenance_start is null and maintenance_end is null and affected_modules = '{}')
  ),

  enabled boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index announcements_audience_plan_id_idx on platform.announcements (audience_plan_id);
create index announcements_audience_country_code_idx on platform.announcements (audience_country_code);
create index announcements_updated_by_idx on platform.announcements (updated_by);

-- Append-only audit trail, same JSONB-snapshot shape as `platform.feature_flag_events` --
-- see this migration's own header comment for why. `title` is denormalized onto the event
-- row (mirroring `feature_flag_events.feature_key`) so history stays readable by name after
-- an announcement is deleted.
create table platform.announcement_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  announcement_id uuid references platform.announcements (id) on delete set null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  previous_value jsonb,
  new_value jsonb,
  reason text not null check (btrim(reason) <> ''),
  performed_by uuid references auth.users (id) on delete set null,
  performed_at timestamptz not null default now()
);

create index announcement_events_announcement_id_idx on platform.announcement_events (announcement_id);
create index announcement_events_performed_by_idx on platform.announcement_events (performed_by);

alter table platform.announcements enable row level security;
alter table platform.announcement_events enable row level security;

-- SELECT open to any authenticated user from the start, the same "a future consumer runs
-- as an ordinary signed-in business member, not a superadmin" reasoning every sibling
-- `platform.*` catalog in this backlog already used -- an announcement is meaningless
-- unless ordinary request-time application code can eventually read it. No
-- INSERT/UPDATE/DELETE grant to `authenticated` at all -- every mutation goes through the
-- three functions below.
create policy "authenticated users can view announcements" on platform.announcements
  for select to authenticated
  using (true);

grant select on platform.announcements to authenticated;
grant all on platform.announcements to service_role;

-- Sensitive operational history, same trust level every sibling `platform.*` audit table
-- in this backlog already established -- superadmin-only SELECT, no direct write grant at
-- all.
create policy "superadmins can view announcement events" on platform.announcement_events
  for select to authenticated
  using (platform.is_superadmin());

grant select on platform.announcement_events to authenticated;
grant all on platform.announcement_events to service_role;

create function platform.create_announcement(
  p_type text,
  p_title text,
  p_message text,
  p_audience_type text,
  p_audience_plan_id uuid,
  p_audience_country_code text,
  p_publish_at timestamptz,
  p_expire_at timestamptz,
  p_maintenance_start timestamptz,
  p_maintenance_end timestamptz,
  p_affected_modules text[],
  p_enabled boolean,
  p_reason text
)
returns platform.announcements
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_row platform.announcements;
  v_modules text[];
  v_module text;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can create an announcement.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to create an announcement.';
  end if;
  if p_type not in ('information', 'warning', 'maintenance', 'critical') then
    raise exception 'Unknown announcement type: %', p_type;
  end if;
  if p_audience_type not in ('all_customers', 'all_users', 'specific_plan', 'specific_country') then
    raise exception 'Unknown announcement audience: %', p_audience_type;
  end if;

  v_modules := coalesce(p_affected_modules, '{}');
  foreach v_module in array v_modules loop
    if not exists (select 1 from core.modules where key = v_module) then
      raise exception 'Unknown module key in affected_modules: %', v_module;
    end if;
  end loop;

  insert into platform.announcements
    (type, title, message, audience_type, audience_plan_id, audience_country_code,
     publish_at, expire_at, maintenance_start, maintenance_end, affected_modules, enabled,
     updated_by)
  values
    (p_type, p_title, p_message, p_audience_type, p_audience_plan_id, p_audience_country_code,
     p_publish_at, p_expire_at, p_maintenance_start, p_maintenance_end, v_modules, p_enabled,
     auth.uid())
  returning * into v_row;

  insert into platform.announcement_events (title, announcement_id, action, previous_value, new_value, reason, performed_by)
  values (v_row.title, v_row.id, 'created', null, to_jsonb(v_row), btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.create_announcement(
  text, text, text, text, uuid, text, timestamptz, timestamptz, timestamptz, timestamptz, text[], boolean, text
) from public, anon;
grant execute on function platform.create_announcement(
  text, text, text, text, uuid, text, timestamptz, timestamptz, timestamptz, timestamptz, text[], boolean, text
) to authenticated;

-- Only `title`/`message`/the schedule/the maintenance window/`affected_modules`/`enabled`
-- are mutable -- see this migration's own header comment for why `type` and every
-- `audience_*` column are immutable after creation.
create function platform.update_announcement(
  p_id uuid,
  p_title text,
  p_message text,
  p_publish_at timestamptz,
  p_expire_at timestamptz,
  p_maintenance_start timestamptz,
  p_maintenance_end timestamptz,
  p_affected_modules text[],
  p_enabled boolean,
  p_reason text
)
returns platform.announcements
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_prev platform.announcements;
  v_row platform.announcements;
  v_modules text[];
  v_module text;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can change an announcement.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to change an announcement.';
  end if;

  select * into v_prev from platform.announcements where id = p_id for update;
  if not found then
    raise exception 'Unknown announcement id: %', p_id;
  end if;

  v_modules := coalesce(p_affected_modules, '{}');
  foreach v_module in array v_modules loop
    if not exists (select 1 from core.modules where key = v_module) then
      raise exception 'Unknown module key in affected_modules: %', v_module;
    end if;
  end loop;

  update platform.announcements
  set title = p_title,
      message = p_message,
      publish_at = p_publish_at,
      expire_at = p_expire_at,
      maintenance_start = p_maintenance_start,
      maintenance_end = p_maintenance_end,
      affected_modules = v_modules,
      enabled = p_enabled,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_id
  returning * into v_row;

  insert into platform.announcement_events (title, announcement_id, action, previous_value, new_value, reason, performed_by)
  values (v_row.title, v_row.id, 'updated', to_jsonb(v_prev), to_jsonb(v_row), btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.update_announcement(
  uuid, text, text, timestamptz, timestamptz, timestamptz, timestamptz, text[], boolean, text
) from public, anon;
grant execute on function platform.update_announcement(
  uuid, text, text, timestamptz, timestamptz, timestamptz, timestamptz, text[], boolean, text
) to authenticated;

create function platform.delete_announcement(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_prev platform.announcements;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can delete an announcement.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to delete an announcement.';
  end if;

  select * into v_prev from platform.announcements where id = p_id for update;
  if not found then
    raise exception 'Unknown announcement id: %', p_id;
  end if;

  -- Insert the audit row (announcement_id still valid) BEFORE deleting -- the FK's own
  -- `on delete set null` nulls this same row's `announcement_id` once the delete below
  -- commits, the identical sequencing `platform.delete_feature_flag()` already established.
  insert into platform.announcement_events (title, announcement_id, action, previous_value, new_value, reason, performed_by)
  values (v_prev.title, v_prev.id, 'deleted', to_jsonb(v_prev), null, btrim(p_reason), auth.uid());

  delete from platform.announcements where id = p_id;
end;
$$;

revoke execute on function platform.delete_announcement(uuid, text) from public, anon;
grant execute on function platform.delete_announcement(uuid, text) to authenticated;
