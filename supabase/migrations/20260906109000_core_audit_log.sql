-- Epic 3, story D-10 (closing out Epic 3): core.audit_log + a write helper invoked by
-- every state transition. Columns and indexes match StockPilot's own public.audit_log
-- exactly (read live, 20260907000000_audit_log.sql) -- "StockPilot audit_log promotes
-- to platform-wide" per 00-MASTER-PLAN.md §5 -- with one deliberate deviation:
-- `actor_id` is nullable here, not NOT NULL. StockPilot's triggers always ran inside a
-- real user's session; this platform's own C-4/D-9 already has state transitions that
-- can run with no signed-in user at all (activateLicense() from a billing webhook, the
-- domain-events drain cron) -- auth.uid() is null there, and forcing a NOT NULL
-- constraint would just break those callers rather than describe reality.
--
-- No client-facing INSERT/UPDATE/DELETE policy, matching the live source exactly
-- ("GRANT ALL ON public.audit_log TO service_role" -- everyone else only reads): the one
-- path to a row is core.write_audit_log(), a SECURITY DEFINER function every future
-- state-transition trigger (and any application code that isn't a trigger) calls,
-- rather than each writer reimplementing its own insert.
--
-- Two real triggers wired up now, both on tables that already exist and already have a
-- meaningful status/settings transition worth logging -- mirroring StockPilot's own
-- log_po_status_change()/log_org_settings_change() pattern exactly, generalized to
-- core.documents (any doc_type, not just purchase orders) and core.business_settings.
-- Every future module's own state transitions (inventory stock adjustments, FSM job
-- status, ...) call the same write_audit_log() helper from their own triggers as those
-- tables get built -- this story's job is the shared mechanism, not every future caller.

create table core.audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_business_created_idx on core.audit_log (business_id, created_at desc);
create index audit_log_business_entity_idx on core.audit_log (business_id, entity_type);
create index audit_log_business_actor_idx on core.audit_log (business_id, actor_id);

alter table core.audit_log enable row level security;

create policy "members can view audit log entries in their businesses"
  on core.audit_log for select
  using (business_id in (select core.user_business_ids()));

create function core.write_audit_log(
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

revoke execute on function core.write_audit_log(uuid, uuid, text, text, uuid, jsonb, jsonb) from public, anon;
grant execute on function core.write_audit_log(uuid, uuid, text, text, uuid, jsonb, jsonb) to authenticated;

create function core.log_document_status_change()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if new.status is distinct from old.status then
    perform core.write_audit_log(
      new.business_id, auth.uid(), 'document.status_changed', 'document', new.id,
      jsonb_build_object('status', old.status), jsonb_build_object('status', new.status)
    );
  end if;
  return new;
end;
$$;

create trigger documents_log_status_change
  after update on core.documents
  for each row execute function core.log_document_status_change();

-- The exact field list the PRD's audit-log module calls out for a business's own
-- settings (GSTIN, state, GST registration type, currency, timezone) -- not every
-- business_settings column (slug/plan changes aren't "business settings" in the sense
-- this ticket means, matching StockPilot's own log_org_settings_change() scoping).
create function core.log_business_settings_change()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if new.gstin is distinct from old.gstin
    or new.state is distinct from old.state
    or new.gst_registration_type is distinct from old.gst_registration_type
    or new.currency is distinct from old.currency
    or new.timezone is distinct from old.timezone
  then
    perform core.write_audit_log(
      new.business_id, auth.uid(), 'business_settings.updated', 'business_settings', new.business_id,
      jsonb_build_object(
        'gstin', old.gstin, 'state', old.state, 'gst_registration_type', old.gst_registration_type,
        'currency', old.currency, 'timezone', old.timezone
      ),
      jsonb_build_object(
        'gstin', new.gstin, 'state', new.state, 'gst_registration_type', new.gst_registration_type,
        'currency', new.currency, 'timezone', new.timezone
      )
    );
  end if;
  return new;
end;
$$;

create trigger business_settings_log_change
  after update on core.business_settings
  for each row execute function core.log_business_settings_change();
