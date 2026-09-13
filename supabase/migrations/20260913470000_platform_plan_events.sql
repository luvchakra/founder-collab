-- PLATFORM-P0-17.1/17.3 ("Configuration Versioning", docs/plan/09-PLATFORM-ADMIN-PORTAL-
-- BACKLOG.md §22). See docs/design/platform-admin-portal-audit.md's own dated entry for
-- this story for the full entity-ownership check and scope reasoning; summarized here:
--
-- Every `platform.*` table built from PLATFORM-P0-07.2 (Module Kill Switch) onward already
-- writes an append-only, JSONB-before/after-snapshot `*_events` table on every mutation --
-- that pre-existing pattern already gives each of those tables real change history, just
-- not yet exposed as a "vN" version number or a restore action. Surfacing that (17.1's
-- version numbers, 17.3's rollback) is this story's own job, built read-side in
-- `packages/core/src/admin/config-history.ts` -- no schema change needed for any table
-- that already has an `*_events` table.
--
-- `platform.plans` is the one glaring exception: it predates that pattern (PLATFORM-P0-04.1
-- was built before PLATFORM-P0-07.2 established it) and is still mutated via a plain,
-- RLS-gated `.update()`/`.insert()` -- no audit trail at all. Since §22's own flagship
-- example is literally "Plan Pro v3", a plan with zero recorded history cannot be
-- versioned -- this migration closes that specific, concrete gap (and only that one; no
-- other pre-existing un-audited table -- `platform.branding`'s live columns,
-- `platform.notification_policies`, `platform.compliance_countries/packs/pack_features`,
-- `platform.modules`' own base row -- is retrofitted this story; each is flagged, not
-- silently fixed, in this story's own audit-log entry as a deferred follow-up).
--
-- Same shape as `platform.feature_flags`/`feature_flag_events` (PLATFORM-P0-08), copied
-- exactly: `platform.plans` loses its direct INSERT/UPDATE grant and RLS policies for
-- `authenticated` (SELECT stays open -- PLATFORM-P0-05.2's own catalog-read widening is
-- untouched); `platform.create_plan()`/`platform.update_plan()` are the only paths to a
-- row from here on, each requiring a non-empty `reason` and writing one atomic
-- `platform.plan_events` row. No delete function -- unchanged from PLATFORM-P0-04.7's own
-- "no delete, ever" stance (a plan no longer offered moves to `status: 'archived'`).
create table platform.plan_events (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  plan_id uuid references platform.plans (id) on delete set null,
  action text not null check (action in ('created', 'updated')),
  previous_value jsonb,
  new_value jsonb,
  reason text not null check (btrim(reason) <> ''),
  performed_by uuid references auth.users (id) on delete set null,
  performed_at timestamptz not null default now()
);

create index plan_events_key_idx on platform.plan_events (key);
create index plan_events_plan_id_idx on platform.plan_events (plan_id);
create index plan_events_performed_by_idx on platform.plan_events (performed_by);

alter table platform.plan_events enable row level security;

-- Sensitive operational history, same trust level every sibling `*_events` table already
-- established -- superadmin-only SELECT, no direct write grant to `authenticated` at all.
create policy "superadmins can view plan events" on platform.plan_events
  for select to authenticated
  using (platform.is_superadmin());

grant select on platform.plan_events to authenticated;
grant all on platform.plan_events to service_role;

-- Tighten platform.plans: drop the direct insert/update RLS policies + grants
-- (PLATFORM-P0-04.1's own original migration) now that every write goes through the two
-- functions below. SELECT (open to any authenticated user, PLATFORM-P0-05.2) is untouched.
drop policy "superadmins can insert plans" on platform.plans;
drop policy "superadmins can update plans" on platform.plans;
revoke insert, update on platform.plans from authenticated;

create function platform.create_plan(
  p_key text,
  p_name text,
  p_description text,
  p_price numeric,
  p_billing_interval text,
  p_currency text,
  p_status text,
  p_display_order integer,
  p_marketing_visible boolean,
  p_reason text
)
returns platform.plans
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_row platform.plans;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can create a plan.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to create a plan.';
  end if;

  insert into platform.plans
    (key, name, description, price, billing_interval, currency, status, display_order, marketing_visible, updated_by)
  values
    (p_key, p_name, p_description, p_price, p_billing_interval, p_currency, p_status, p_display_order, p_marketing_visible, auth.uid())
  returning * into v_row;

  insert into platform.plan_events (key, plan_id, action, previous_value, new_value, reason, performed_by)
  values (v_row.key, v_row.id, 'created', null, to_jsonb(v_row), btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.create_plan(text, text, text, numeric, text, text, text, integer, boolean, text) from public, anon;
grant execute on function platform.create_plan(text, text, text, numeric, text, text, text, integer, boolean, text) to authenticated;

-- Only the fields `updatePlatformPlanSchema` already exposed remain mutable -- `key` stays
-- immutable after creation (PLATFORM-P0-04.1's own original reasoning, unchanged).
create function platform.update_plan(
  p_id uuid,
  p_name text,
  p_description text,
  p_price numeric,
  p_billing_interval text,
  p_currency text,
  p_status text,
  p_display_order integer,
  p_marketing_visible boolean,
  p_reason text
)
returns platform.plans
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_prev platform.plans;
  v_row platform.plans;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can change a plan.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to change a plan.';
  end if;

  select * into v_prev from platform.plans where id = p_id for update;
  if not found then
    raise exception 'Unknown plan id: %', p_id;
  end if;

  update platform.plans
  set name = p_name,
      description = p_description,
      price = p_price,
      billing_interval = p_billing_interval,
      currency = p_currency,
      status = p_status,
      display_order = p_display_order,
      marketing_visible = p_marketing_visible,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_id
  returning * into v_row;

  insert into platform.plan_events (key, plan_id, action, previous_value, new_value, reason, performed_by)
  values (v_row.key, v_row.id, 'updated', to_jsonb(v_prev), to_jsonb(v_row), btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.update_plan(uuid, text, text, numeric, text, text, text, integer, boolean, text) from public, anon;
grant execute on function platform.update_plan(uuid, text, text, numeric, text, text, text, integer, boolean, text) to authenticated;
