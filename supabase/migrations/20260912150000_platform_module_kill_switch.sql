-- PLATFORM-P0-07.2: "Platform-Wide Module Kill Switch" (docs/plan/09-PLATFORM-ADMIN-
-- PORTAL-BACKLOG.md §11). "Allow authorized platform operators to disable a module
-- globally. This is a dangerous operation and must require: reason, impact confirmation,
-- explicit confirmation, audit record."
--
-- `platform.modules.enabled` (PLATFORM-P0-07.1) already exists as the flag itself; this
-- migration adds the one thing that story deliberately left out -- a real, atomic mutation
-- path with a mandatory reason and an append-only audit trail, mirroring
-- `core.audit_log`/`core.write_audit_log()`'s own "one SECURITY DEFINER function owns
-- every write, no direct client insert policy" shape (Epic 3, D-10) exactly, adapted for
-- platform-wide (not business-scoped) data.
--
-- `platform.set_module_enabled()` does the flip AND the audit-log insert in one atomic
-- statement -- not two separate client calls -- because this is explicitly named a
-- "dangerous operation": a superadmin's own read of `platform.modules.enabled` must never
-- be able to disagree with what the audit trail says happened, even under a partial
-- failure. It re-checks `platform.is_superadmin()` itself (SECURITY DEFINER bypasses the
-- table's own RLS, so the function is the actual boundary here, the same relationship
-- every other SECURITY DEFINER function in this schema already has to its own RLS-guarded
-- table) and requires a non-empty `reason` -- the "reason" half of §11's own requirement.
-- The "impact confirmation" and "explicit confirmation" halves are UI-layer requirements
-- (showing the real count of businesses currently licensing the module, and a distinct
-- confirm step) -- see `packages/core/src/admin/platform-modules.ts` and the new
-- confirmation dialog for those; this migration lays down the data half only.
create table platform.module_kill_switch_events (
  id uuid primary key default gen_random_uuid(),
  module_key text not null references core.modules (key),
  enabled boolean not null,
  reason text not null check (btrim(reason) <> ''),
  performed_by uuid references auth.users (id) on delete set null,
  performed_at timestamptz not null default now()
);

create index module_kill_switch_events_module_key_idx on platform.module_kill_switch_events (module_key);
create index module_kill_switch_events_performed_by_idx on platform.module_kill_switch_events (performed_by);

alter table platform.module_kill_switch_events enable row level security;

-- Sensitive operational history (who disabled what, and why), not open catalog data like
-- platform.modules' own row state -- SELECT stays superadmin-only, matching every other
-- "audit trail of a dangerous action" table's own instinct in this codebase (as opposed to
-- the open-SELECT catalog tables PLATFORM-P0-05.2/05.3 already widened).
create policy "superadmins can view module kill switch events"
  on platform.module_kill_switch_events for select to authenticated
  using (platform.is_superadmin());

-- No INSERT/UPDATE/DELETE policy or grant to `authenticated` at all -- the only path to a
-- row is `set_module_enabled()`'s own SECURITY DEFINER insert below, exactly
-- `core.write_audit_log()`'s "one function owns every write" pattern.
grant select on platform.module_kill_switch_events to authenticated;
grant all on platform.module_kill_switch_events to service_role;

create function platform.set_module_enabled(p_module_key text, p_enabled boolean, p_reason text)
returns platform.modules
language plpgsql
security definer
set search_path = platform
as $$
declare
  v_row platform.modules;
begin
  if not platform.is_superadmin() then
    raise exception 'Forbidden: only a SUPERADMIN can change a module''s platform-wide enabled state.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to change a module''s platform-wide enabled state.';
  end if;

  update platform.modules
  set enabled = p_enabled, updated_by = auth.uid(), updated_at = now()
  where module_key = p_module_key
  returning * into v_row;

  if not found then
    raise exception 'Unknown module key: %', p_module_key;
  end if;

  insert into platform.module_kill_switch_events (module_key, enabled, reason, performed_by)
  values (p_module_key, p_enabled, btrim(p_reason), auth.uid());

  return v_row;
end;
$$;

revoke execute on function platform.set_module_enabled(text, boolean, text) from public, anon;
grant execute on function platform.set_module_enabled(text, boolean, text) to authenticated;
