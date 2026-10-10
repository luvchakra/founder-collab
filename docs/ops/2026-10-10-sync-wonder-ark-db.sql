-- WonderArk: bring the hosted database (project wonder-ark, jazdtomcgqjxjueedmck) in line
-- with main. Paste the whole file into Supabase -> SQL editor -> Run. It is one
-- transaction: it either applies completely or changes nothing.
--
-- 1. SEC-7 (payments): the rest of 20261002090000_core_payments_void_only.sql -- without
--    it "Void payment" fails, because core.void_payment() doesn't exist on the database.
-- 2. SEC-6 (audit log): the rest of 20261001150000_core_audit_log_tamper_evident.sql --
--    the guard that stops audit entries being edited, deleted or truncated.
-- 3. The search_path pin from 20261010090000_pin_function_search_paths.sql (PR #18).
--
-- Rehearsed on a copy of the database's current state: the result matches a database
-- built from the full migrations exactly.

begin;

-- RLS: nobody deletes either table, and allocations are insert-only. The payments update
-- policy stays for `notes`; the trigger above refuses everything else.
drop policy "members can delete payments in their businesses" on core.payments;
drop policy "members can update payment allocations in their businesses" on core.payment_allocations;
drop policy "members can delete payment allocations in their businesses" on core.payment_allocations;
revoke delete on core.payments from authenticated;
revoke update, delete on core.payment_allocations from authenticated;

-- ---------------------------------------------------------------------------
-- Voiding
-- ---------------------------------------------------------------------------

-- Returns what the payment had settled ([{allocation_id, document_id, amount}]), so the
-- caller can refresh whatever status it keeps on those documents.
create function core.void_payment(p_payment_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = core
as $$
declare
  v_uid uuid := auth.uid();
  v_payment core.payments%rowtype;
  v_allocations jsonb;
begin
  select * into v_payment from core.payments where id = p_payment_id for update;
  if not found
     or (v_uid is not null and not exists (
       select 1 from core.user_business_ids() as b(id) where b.id = v_payment.business_id)) then
    raise exception 'Payment not found.' using errcode = 'no_data_found';
  end if;

  if v_uid is not null then
    if not core.has_permission(v_payment.business_id, 'payments.void') then
      raise exception 'You don''t have permission to void payments.' using errcode = '42501';
    end if;
    if v_payment.created_by = v_uid
       and not exists (select 1 from core.user_admin_business_ids() as b(id) where b.id = v_payment.business_id) then
      raise exception 'A payment has to be voided by someone other than the person who recorded it.'
        using errcode = '42501';
    end if;
  end if;

  if v_payment.voided_at is not null then
    raise exception 'This payment is already voided.' using errcode = 'check_violation';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then
    raise exception 'Give a reason for voiding this payment (at least 5 characters).' using errcode = 'check_violation';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('allocation_id', a.id, 'document_id', a.document_id, 'amount', a.amount)
                            order by a.created_at, a.id), '[]'::jsonb)
    into v_allocations
  from core.payment_allocations a
  where a.payment_id = p_payment_id;

  perform set_config('core.voiding_payment', p_payment_id::text, true);
  delete from core.payment_allocations where payment_id = p_payment_id;
  update core.payments
    set voided_at = now(), voided_by = v_uid, void_reason = trim(p_reason), voided_allocations = v_allocations
    where id = p_payment_id;
  perform set_config('core.voiding_payment', '', true);

  perform core.append_audit_log(
    v_payment.business_id, v_uid, 'payment.voided', 'payment', p_payment_id,
    jsonb_build_object(
      'party_id', v_payment.party_id, 'method', v_payment.method, 'amount', v_payment.amount,
      'payment_date', v_payment.payment_date, 'reference', v_payment.reference,
      'created_by', v_payment.created_by, 'allocations', v_allocations
    ),
    jsonb_build_object('reason', trim(p_reason))
  );

  insert into core.domain_events (business_id, type, required_module, payload)
  values (
    v_payment.business_id, 'payment.voided', 'gst',
    jsonb_build_object(
      'paymentId', p_payment_id,
      'allocationIds', coalesce((select jsonb_agg(e -> 'allocation_id') from jsonb_array_elements(v_allocations) e), '[]'::jsonb),
      'documentIds', coalesce((select jsonb_agg(distinct e -> 'document_id') from jsonb_array_elements(v_allocations) e), '[]'::jsonb),
      'amount', v_payment.amount
    )
  );

  return v_allocations;
end;
$$;

revoke execute on function core.void_payment(uuid, text) from public, anon;
grant execute on function core.void_payment(uuid, text) to authenticated, service_role;

alter table core.audit_log drop constraint audit_log_business_id_fkey;

-- Setting the purge flag by hand doesn't help anyone delete a recent row: the age floor
-- is checked here, not in the purge function.
create function core.audit_log_append_only()
returns trigger
language plpgsql
set search_path = core
as $$
begin
  if tg_op = 'DELETE'
    and current_setting('core.audit_retention_purge', true) = 'on'
    and old.created_at < now() - interval '8 years'
  then
    return old;
  end if;
  raise exception 'core.audit_log is append-only (% rejected)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_append_only
  before update or delete on core.audit_log
  for each row execute function core.audit_log_append_only();

create trigger audit_log_no_truncate
  before truncate on core.audit_log
  for each statement execute function core.audit_log_append_only();

revoke update, delete, truncate on core.audit_log from authenticated, service_role;

-- 8 years covers both GST record retention (CGST Act s.36: 72 months from the annual
-- return's due date) and SOX s.802 (7 years). Service role only.
create function core.purge_expired_audit_log()
returns integer
language plpgsql
security definer
set search_path = core
as $$
declare
  v_count integer;
begin
  perform set_config('core.audit_retention_purge', 'on', true);
  delete from core.audit_log where created_at < now() - interval '8 years';
  get diagnostics v_count = row_count;
  perform set_config('core.audit_retention_purge', 'off', true);
  return v_count;
end;
$$;

revoke execute on function core.purge_expired_audit_log() from public, anon, authenticated;
grant execute on function core.purge_expired_audit_log() to service_role;

-- The deletion of a business is itself evidence; with the FK gone, this row survives it.
create function core.log_business_deleted()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  perform core.append_audit_log(
    old.id, auth.uid(), 'business.deleted', 'business', old.id,
    jsonb_build_object('name', old.name, 'account_id', old.account_id), null
  );
  return old;
end;
$$;

create trigger businesses_log_deleted
  after delete on core.businesses
  for each row execute function core.log_business_deleted();

alter function core.module_view_permission(text) set search_path = '';
alter function core.is_read_only_permission(text) set search_path = '';
alter function platform.billing_provider_snapshot(platform.billing_providers) set search_path = '';

commit;

-- Optional check afterwards (every row should say true):
-- select 'void_payment' as item, to_regprocedure('core.void_payment(uuid,text)') is not null as ok
-- union all select 'audit append-only', exists (select 1 from pg_trigger where tgname = 'audit_log_append_only')
-- union all select 'search_path pinned', not exists (select 1 from pg_proc where oid in (
--   'core.module_view_permission(text)'::regprocedure, 'core.is_read_only_permission(text)'::regprocedure)
--   and proconfig is null);
