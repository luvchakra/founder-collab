-- SEC-2: close two ways any signed-in user could forge entries in another business's
-- audit log.
--
-- 1. core.write_audit_log() (D-10) is SECURITY DEFINER, granted to `authenticated`, and
--    checked nothing: a direct RPC call could insert into ANY business's core.audit_log
--    with ANY actor_id -- e.g. attributing a fabricated "invoice.cancelled" to that
--    business's owner. 20260912090000_core_usage_counters.sql already noted the gap
--    ("unlike write_audit_log(), this function itself re-checks tenant membership").
-- 2. core.rbac_audit() (20260926150100_core_rbac_members.sql) is SECURITY DEFINER with
--    no revoke at all, so the PUBLIC default execute grant applied: any signed-in user
--    could call it with any business id.
--
-- The fix keeps every legitimate caller working unchanged:
-- - Triggers (inventory/fsm/gst/core status-change audits) pass values derived from a row
--   the user just wrote, which RLS already authorized -- they're recognized by
--   pg_trigger_depth() > 0 and trusted, so none of those trigger functions is redefined.
-- - The service role / cron paths have no auth.uid() and stay trusted, as before.
-- - A *direct* call by a signed-in user (the ~40 writeAuditLog() call sites in
--   packages/core and module-crm) must be a member of the business, and actor_id is
--   forced to the caller -- every one of those sites already passes the session user's
--   own id, so no correct attribution changes.
-- - RBAC functions authorize themselves (rbac_require) before auditing, including the two
--   cases where the caller isn't an active member at that instant (accepting an
--   invitation, being acted on), so rbac_audit() now appends through the new internal
--   core.append_audit_log(), which no client role can execute. rbac_audit() itself is
--   revoked from client roles; its nine callers are all SECURITY DEFINER and keep
--   working under the owner's privileges.

create function core.append_audit_log(
  p_business_id uuid,
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb default null,
  p_after jsonb default null
)
returns uuid
language sql
security definer
set search_path = core
as $$
  insert into core.audit_log (business_id, actor_id, action, entity_type, entity_id, before, after)
  values (p_business_id, p_actor_id, p_action, p_entity_type, p_entity_id, p_before, p_after)
  returning id;
$$;

revoke execute on function core.append_audit_log(uuid, uuid, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function core.append_audit_log(uuid, uuid, text, text, uuid, jsonb, jsonb) to service_role;

-- Same signature and grants as D-10's definition (create or replace keeps both); only
-- the body changes.
create or replace function core.write_audit_log(
  p_business_id uuid,
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb default null,
  p_after jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = core
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null and pg_trigger_depth() = 0 then
    if p_business_id is null
       or not exists (select 1 from core.user_business_ids() as b(id) where b.id = p_business_id) then
      raise exception 'You can''t write to the audit log of a business you''re not a member of.'
        using errcode = '42501';
    end if;
    p_actor_id := v_uid;
  end if;
  return core.append_audit_log(p_business_id, p_actor_id, p_action, p_entity_type, p_entity_id, p_before, p_after);
end;
$$;

create or replace function core.rbac_audit(
  p_business_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_before jsonb, p_after jsonb
)
returns void
language sql
security definer
set search_path = core
as $$
  select core.append_audit_log(p_business_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after);
$$;

revoke execute on function core.rbac_audit(uuid, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function core.rbac_audit(uuid, text, text, uuid, jsonb, jsonb) to service_role;
