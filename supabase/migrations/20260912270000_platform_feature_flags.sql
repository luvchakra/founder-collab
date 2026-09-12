-- PLATFORM-P0-08.1/08.2/08.3/08.4 ("Feature Flags", docs/plan/09-PLATFORM-ADMIN-PORTAL-
-- BACKLOG.md §12).
--
-- Entity-ownership check (CLAUDE.md non-negotiable #5): no "feature flag" concept exists
-- anywhere in docs/plan/00-MASTER-PLAN.md §5, and `platform.features`/`platform.plan_features`
-- (PLATFORM-P0-04.4) are a *different*, already-documented axis -- that migration's own
-- docstring already named this exact table ("PLATFORM-P0-08's own future
-- `platform.feature_flags`") and drew the distinction in advance: `platform.features` is a
-- *commercial* packaging fact (what a paying plan entitles a customer to use at all);
-- `platform.feature_flags` (this table) is an *operational* on/off control for reliability,
-- staged rollout, and emergency kill switches (§12.3's own examples -- "AI research",
-- "outbound messaging", "WhatsApp integration", "government submission", "expensive
-- external APIs" -- are all infrastructure/safety concerns, not pricing-tier concerns). Both
-- may describe similarly-named capabilities for entirely different reasons; this table does
-- not touch or extend `platform.features`/`platform.plan_features` at all.
--
-- **Scope, read narrowly against this run's own workstream boundary before writing
-- anything**: this run's task assignment explicitly forbids touching `module-discovery`,
-- `module-gst`, or any other workstream's files, and flags §12 in advance as "introducing
-- kill-switch-style wiring across several subsystems (AI research, outbound messaging,
-- WhatsApp, government submission) -- read carefully before assuming scope." §12's own text
-- (08.1-08.4) asks only to (a) create the flag catalog with scope/effective-window fields,
-- (b) support Global/Plan/Module/Country scope, and (c) audit every change -- it never asks
-- for real enforcement wired into any specific subsystem, and no PLATFORM-P0-08.5 "wire kill
-- switches into AI/WhatsApp/government-submission code" story exists in this doc at all (the
-- same "table now, real enforcement in a later, separate story" sequencing
-- `platform.plan_modules.enabled` (04.3) and `platform.modules.enabled/status` (07.1/07.2)
-- both went through). Even if it did, this run's own file-scope restriction would forbid
-- implementing it here regardless, since every one of §12.3's named subsystems lives inside
-- another workstream's module packages. So this migration builds the catalog, scope, and
-- audit trail only -- see `platform-feature-flags.ts` for what the application layer
-- deliberately does not do with it yet.
--
-- **A non-security data-modeling judgment call, decided per this run's own task brief**:
-- §12.2 names four scope kinds (Global/Plan/Module/Country) but not how a single flag row
-- expresses one. Modeled as one `scope_type` discriminator plus three nullable scope-value
-- columns (`scope_plan_id`/`scope_module_key`/`scope_country_code`), with a CHECK enforcing
-- that exactly the one column matching `scope_type` is set and the other two are null -- one
-- flag, one scope, chosen at creation (mirrors §12.1's own singular "Create platform-level
-- flags" framing: a flag is a single row with a description/enabled/window, not a
-- one-to-many targeting table). `scope_country_code` is a plain ISO-3166-1-alpha-2-shaped
-- text column, not an FK -- no country/compliance-pack registry table exists yet (§17,
-- "Country / Compliance Pack Administration," is still "Not started" per this backlog's own
-- progress table), so there is nothing canonical to reference. Business/user-level scope is
-- explicitly named as "P1" by §12.2 itself, so no `scope_business_id`/`scope_user_id` column
-- exists here at all -- adding one now would be exactly the speculative-column shape CLAUDE.md
-- development principle #7 rules out for a scope this doc itself defers.
--
-- **Why every mutation goes through a SECURITY DEFINER function, not a plain RLS-gated
-- `.update()`**: §12.4 is explicit that "every change must record: who, what, old value, new
-- value, reason, timestamp" -- unlike PLATFORM-P0-07.1's own `platform.modules.visible`/
-- `version` (plain, unaudited columns because nothing in that story asked for their changes
-- to be audited), this section asks for audit-of-every-change as a first-class requirement
-- from 08.1 onward, the same bar PLATFORM-P0-07.2's kill switch set for its own single
-- boolean. So `platform.feature_flags` gets no direct INSERT/UPDATE/DELETE grant to
-- `authenticated` at all -- `platform.create_feature_flag()`/`update_feature_flag()`/
-- `delete_feature_flag()` below are the only paths to a row, each requiring a non-empty
-- `reason` unconditionally and writing one atomic `platform.feature_flag_events` row per
-- call, mirroring `platform.set_module_status()`'s own "one function owns every write, reason
-- required every time" shape exactly.
--
-- **Why the audit table stores full JSONB snapshots, not per-column previous/new pairs**:
-- `platform.module_status_events` (07.3) used explicit `previous_status`/`new_status`/
-- `previous_message`/`new_message` columns because that table only ever has two mutable
-- fields. `platform.feature_flags` has five (`description`, `enabled`, `effective_from`,
-- `effective_to`, plus a create/delete's entire row) -- one `previous_value`/`new_value`
-- JSONB pair per event captures §12.4's own singular "old value"/"new value" language for
-- whichever fields actually changed in a given call, without a wide, mostly-null column set.
-- `feature_key` is denormalized onto the event row (not only reachable via `flag_id`) so a
-- flag's history stays readable by key after the flag itself is deleted (`flag_id` is
-- nullable, `on delete set null`, deliberately not `cascade` -- deleting a flag must not also
-- delete the very audit trail that records its own deletion).
--
-- **Scope immutability, decided the same way PLATFORM-P0-04.4 decided against an
-- `updateFeature()`**: `update_feature_flag()` only ever touches `description`/`enabled`/
-- `effective_from`/`effective_to` -- `feature_key` and every `scope_*` column are set once at
-- creation and never changed. A flag's scope is its identity (which businesses it could ever
-- apply to); if a superadmin needs a different scope, deleting and recreating the flag is
-- cheap while this catalog is small, the same "no edit path nothing asked for" reasoning
-- PLATFORM-P0-04.4's own migration already used for `platform.features.key`.
create table platform.feature_flags (
  id uuid primary key default gen_random_uuid(),

  feature_key text not null unique check (feature_key ~ '^[a-z0-9_]+$'),
  description text check (description is null or char_length(description) <= 2000),
  enabled boolean not null default true,

  effective_from timestamptz,
  effective_to timestamptz,
  check (effective_from is null or effective_to is null or effective_to > effective_from),

  scope_type text not null default 'global' check (scope_type in ('global', 'plan', 'module', 'country')),
  scope_plan_id uuid references platform.plans (id) on delete cascade,
  scope_module_key text references core.modules (key),
  scope_country_code text check (scope_country_code is null or scope_country_code ~ '^[A-Z]{2}$'),
  check (
    (scope_type = 'global' and scope_plan_id is null and scope_module_key is null and scope_country_code is null)
    or (scope_type = 'plan' and scope_plan_id is not null and scope_module_key is null and scope_country_code is null)
    or (scope_type = 'module' and scope_module_key is not null and scope_plan_id is null and scope_country_code is null)
    or (scope_type = 'country' and scope_country_code is not null and scope_plan_id is null and scope_module_key is null)
  ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index feature_flags_scope_plan_id_idx on platform.feature_flags (scope_plan_id);
create index feature_flags_scope_module_key_idx on platform.feature_flags (scope_module_key);
create index feature_flags_updated_by_idx on platform.feature_flags (updated_by);

-- Append-only audit trail -- see this migration's own header comment for why JSONB
-- snapshots, not per-column previous/new pairs.
create table platform.feature_flag_events (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null,
  flag_id uuid references platform.feature_flags (id) on delete set null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  previous_value jsonb,
  new_value jsonb,
  reason text not null check (btrim(reason) <> ''),
  performed_by uuid references auth.users (id) on delete set null,
  performed_at timestamptz not null default now()
);

create index feature_flag_events_feature_key_idx on platform.feature_flag_events (feature_key);
create index feature_flag_events_flag_id_idx on platform.feature_flag_events (flag_id);
create index feature_flag_events_performed_by_idx on platform.feature_flag_events (performed_by);

alter table platform.feature_flags enable row level security;
alter table platform.feature_flag_events enable row level security;

-- SELECT open to any authenticated user from the start -- the same "table's own future
-- consumer runs as an ordinary signed-in business member, not a superadmin" reasoning
-- PLATFORM-P0-07.1's own `platform.modules` migration already used (see that migration's
-- own comment), applied here in advance rather than needing a second widening migration
-- later: a kill-switch-style flag is meaningless unless ordinary request-time application
-- code (running as `authenticated`, not `service_role`) can eventually read it. No
-- INSERT/UPDATE/DELETE grant to `authenticated` at all -- every mutation goes through the
-- three functions below.
create policy "authenticated users can view feature flags" on platform.feature_flags
  for select to authenticated
  using (true);

grant select on platform.feature_flags to authenticated;
grant all on platform.feature_flags to service_role;

-- Sensitive operational history, same trust level `platform.module_status_events` already
-- established -- superadmin-only SELECT, no direct write grant to `authenticated` at all.
create policy "superadmins can view feature flag events" on platform.feature_flag_events
  for select to authenticated
  using (platform.is_superadmin());

grant select on platform.feature_flag_events to authenticated;
grant all on platform.feature_flag_events to service_role;

create function platform.create_feature_flag(
  p_feature_key text,
  p_description text,
  p_enabled boolean,
  p_effective_from timestamptz,
  p_effective_to timestamptz,
  p_scope_type text,
  p_scope_plan_id uuid,
  p_scope_module_key text,
  p_scope_country_code text,
  p_reason text
)
returns platform.feature_flags
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_row platform.feature_flags;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can create a feature flag.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to create a feature flag.';
  end if;
  if p_scope_type not in ('global', 'plan', 'module', 'country') then
    raise exception 'Unknown feature flag scope: %', p_scope_type;
  end if;

  insert into platform.feature_flags
    (feature_key, description, enabled, effective_from, effective_to,
     scope_type, scope_plan_id, scope_module_key, scope_country_code, updated_by)
  values
    (p_feature_key, p_description, p_enabled, p_effective_from, p_effective_to,
     p_scope_type, p_scope_plan_id, p_scope_module_key, p_scope_country_code, auth.uid())
  returning * into v_row;

  insert into platform.feature_flag_events (feature_key, flag_id, action, previous_value, new_value, reason, performed_by)
  values (v_row.feature_key, v_row.id, 'created', null, to_jsonb(v_row), btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.create_feature_flag(text, text, boolean, timestamptz, timestamptz, text, uuid, text, text, text) from public, anon;
grant execute on function platform.create_feature_flag(text, text, boolean, timestamptz, timestamptz, text, uuid, text, text, text) to authenticated;

-- Only `description`/`enabled`/`effective_from`/`effective_to` are mutable here -- see this
-- migration's own header comment for why `feature_key` and every `scope_*` column are
-- immutable after creation.
create function platform.update_feature_flag(
  p_id uuid,
  p_description text,
  p_enabled boolean,
  p_effective_from timestamptz,
  p_effective_to timestamptz,
  p_reason text
)
returns platform.feature_flags
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_prev platform.feature_flags;
  v_row platform.feature_flags;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can change a feature flag.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to change a feature flag.';
  end if;

  select * into v_prev from platform.feature_flags where id = p_id for update;
  if not found then
    raise exception 'Unknown feature flag id: %', p_id;
  end if;

  update platform.feature_flags
  set description = p_description,
      enabled = p_enabled,
      effective_from = p_effective_from,
      effective_to = p_effective_to,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_id
  returning * into v_row;

  insert into platform.feature_flag_events (feature_key, flag_id, action, previous_value, new_value, reason, performed_by)
  values (v_row.feature_key, v_row.id, 'updated', to_jsonb(v_prev), to_jsonb(v_row), btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.update_feature_flag(uuid, text, boolean, timestamptz, timestamptz, text) from public, anon;
grant execute on function platform.update_feature_flag(uuid, text, boolean, timestamptz, timestamptz, text) to authenticated;

create function platform.delete_feature_flag(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_prev platform.feature_flags;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can delete a feature flag.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to delete a feature flag.';
  end if;

  select * into v_prev from platform.feature_flags where id = p_id for update;
  if not found then
    raise exception 'Unknown feature flag id: %', p_id;
  end if;

  -- Insert the audit row (flag_id still valid) BEFORE deleting, then delete -- the FK's own
  -- `on delete set null` immediately nulls this same row's `flag_id` once the delete below
  -- commits, which is exactly the intended end state: the event survives, addressable by its
  -- denormalized `feature_key`, with no dangling reference to a now-nonexistent flag.
  insert into platform.feature_flag_events (feature_key, flag_id, action, previous_value, new_value, reason, performed_by)
  values (v_prev.feature_key, v_prev.id, 'deleted', to_jsonb(v_prev), null, btrim(p_reason), auth.uid());

  delete from platform.feature_flags where id = p_id;
end;
$$;

revoke execute on function platform.delete_feature_flag(uuid, text) from public, anon;
grant execute on function platform.delete_feature_flag(uuid, text) to authenticated;
