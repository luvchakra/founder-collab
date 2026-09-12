-- WonderArc Compliance backlog, COMPLY-P0-10.3 (Audit Trail).
--
-- Checked the existing implementation first (backlog rule 1) -- `core.write_audit_log()`
-- and `core.audit_log` already exist (Epic 3, story D-10), with two triggers already
-- wired up on `core.documents`/`core.business_settings`, and D-10's own migration
-- comment explicitly says "every future module's own state transitions ... call the same
-- `write_audit_log()` helper from their own triggers as those tables get built -- this
-- story's job is the shared mechanism, not every future caller." `module-inventory`'s own
-- `inventory.log_stock_adjustment()` and `module-fsm`'s own job-permission triggers
-- already did exactly this for their own modules -- checked, and confirmed NO `gst.*`
-- table has ever done so, despite this whole epic having several genuinely meaningful
-- state transitions (a return period moving through its review pipeline, an IMS decision,
-- a reconciliation exception being triaged, a tax registration being cancelled). This
-- migration is `module-gst`'s own turn.
--
-- Scope, deliberately the four MOST compliance-meaningful state changes already built
-- (backlog rule 5, "do not implement future stories implicitly" -- not "every single gst
-- table write ever," which would include routine reads-adjacent inserts with no real
-- decision behind them):
-- - `gst.return_periods` -- `status` (the Draft->...->Filed pipeline) and
--   `payment_status` (COMPLY-P0-07.7) each independently trigger their own audit entry
--   when they change.
-- - `gst.ims_actions` -- every accept/reject/pending decision (insert OR update, since
--   COMPLY-P0-08.4's own `recordImsAction` is an upsert-by-document).
-- - `gst.reconciliation_exceptions` -- `status` (open -> resolved/dismissed).
-- - `gst.tax_registrations` -- `registration_status` (active -> cancelled/suspended), a
--   genuinely compliance-critical change (a business's own GSTIN going inactive affects
--   every downstream determination).
--
-- Every function below follows `core.log_document_status_change()`'s own exact shape:
-- `security definer`, `set search_path`, a plain `if ... is distinct from ...` guard, one
-- `perform core.write_audit_log(...)` call. `actor_id` is `auth.uid()` -- every one of
-- these tables' own writes goes through the request-scoped, RLS-authenticated client (none
-- of COMPLY-P0-07.5/08.4/08.6/04.1's own mutations use the admin client), so this is
-- always a real signed-in user, never null in practice for these four tables specifically
-- (unlike `core.audit_log`'s own nullable `actor_id`, kept nullable at the column level
-- for the cron-driven writers elsewhere in this platform that genuinely have none).

create function gst.log_return_period_status_change()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if new.status is distinct from old.status then
    perform core.write_audit_log(
      new.business_id, auth.uid(), 'return_period.status_changed', 'return_period', new.id,
      jsonb_build_object('status', old.status), jsonb_build_object('status', new.status)
    );
  end if;
  if new.payment_status is distinct from old.payment_status then
    perform core.write_audit_log(
      new.business_id, auth.uid(), 'return_period.payment_status_changed', 'return_period', new.id,
      jsonb_build_object('payment_status', old.payment_status), jsonb_build_object('payment_status', new.payment_status)
    );
  end if;
  return new;
end;
$$;

create trigger return_periods_log_status_change
  after update on gst.return_periods
  for each row execute function gst.log_return_period_status_change();

create function gst.log_ims_action()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if tg_op = 'INSERT' or new.action is distinct from old.action then
    perform core.write_audit_log(
      new.business_id, auth.uid(), 'ims_action.recorded', 'ims_action', new.id,
      case when tg_op = 'UPDATE' then jsonb_build_object('action', old.action) else null end,
      jsonb_build_object('action', new.action, 'gstr2b_document_id', new.gstr2b_document_id)
    );
  end if;
  return new;
end;
$$;

create trigger ims_actions_log_action
  after insert or update on gst.ims_actions
  for each row execute function gst.log_ims_action();

create function gst.log_reconciliation_exception_status_change()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if new.status is distinct from old.status then
    perform core.write_audit_log(
      new.business_id, auth.uid(), 'reconciliation_exception.status_changed', 'reconciliation_exception', new.id,
      jsonb_build_object('status', old.status), jsonb_build_object('status', new.status, 'resolution_note', new.resolution_note)
    );
  end if;
  return new;
end;
$$;

create trigger reconciliation_exceptions_log_status_change
  after update on gst.reconciliation_exceptions
  for each row execute function gst.log_reconciliation_exception_status_change();

create function gst.log_tax_registration_status_change()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if new.registration_status is distinct from old.registration_status then
    perform core.write_audit_log(
      new.business_id, auth.uid(), 'tax_registration.status_changed', 'tax_registration', new.id,
      jsonb_build_object('registration_status', old.registration_status),
      jsonb_build_object('registration_status', new.registration_status)
    );
  end if;
  return new;
end;
$$;

create trigger tax_registrations_log_status_change
  after update on gst.tax_registrations
  for each row execute function gst.log_tax_registration_status_change();
