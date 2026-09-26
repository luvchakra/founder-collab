-- EXP-ADMIN-01..07 / EXP-PLAT-05 -- platform-administration exports are audited like every
-- other export (docs/plan/13-DATA-EXPORT-BACKLOG.md §16), in platform.audit_log, since a
-- platform export has no single business to log against in core.audit_log.
--
-- platform.audit_log only admitted created/updated/deleted: `exported` joins them.
-- platform.write_platform_audit_log() stays revoked from `authenticated` (its own
-- migration explains the forgery it prevented); instead this narrow writer records only
-- an `exported` row, and only the service role may call it -- the export route calls it
-- after its own superadmin check (packages/core/src/exports/platform.ts), so no signed-in
-- user can write a platform audit row of any kind directly.

alter table platform.audit_log drop constraint if exists audit_log_action_check;
alter table platform.audit_log
  add constraint audit_log_action_check check (action in ('created', 'updated', 'deleted', 'exported'));

create function platform.write_export_audit_log(
  p_actor_id uuid,
  p_resource_type text,
  p_new_value jsonb
)
returns uuid
language sql
security definer
set search_path = platform
as $$
  insert into platform.audit_log (actor_id, action, resource_type, severity, new_value)
  values (p_actor_id, 'exported', p_resource_type, 'normal', p_new_value)
  returning id;
$$;

revoke execute on function platform.write_export_audit_log(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function platform.write_export_audit_log(uuid, text, jsonb) to service_role;
