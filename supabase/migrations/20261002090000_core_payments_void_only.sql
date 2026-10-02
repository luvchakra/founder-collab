-- SEC-7: a recorded payment is never edited or deleted -- it is voided, with a reason, by
-- someone allowed to, and the ledger follows.
--
-- Until now core.payments and core.payment_allocations (D-7) had member-wide UPDATE and
-- DELETE policies: any member could change a recorded payment's amount or date, or delete
-- it outright, and the receivable it settled silently reopened with no trace of why. For
-- money records that is the control an auditor checks first (SOX ITGC change management;
-- CGST Act s.35/36 record keeping).
--
-- 1. Immutable once recorded. A payment's party, method, amount, date, reference and
--    author can't change; only `notes` may. Allocations can't change at all.
-- 2. Never deleted. The one exception is the cascade when the whole business is deleted
--    (the E2E fixture teardown deletes test accounts) -- recognised by the business row
--    already being gone, which no other delete can arrange.
-- 3. Voided through core.void_payment() only: needs `payments.void` and a reason, and
--    enforces maker-checker -- whoever recorded the payment can't void it themselves
--    unless they're an owner/admin (a one-person business has nobody else to ask).
-- 4. What a void does, in one transaction:
--    - stamps voided_at / voided_by / void_reason on the payment, and keeps a snapshot of
--      what it had settled in `voided_allocations`;
--    - releases its allocations, so every balance reader (core.document_balances,
--      Finance's receivables/payables, the exports) sees the documents as owed again with
--      no change of its own -- the payment row, the snapshot and the audit entry are the
--      record of what was there;
--    - writes a `payment.voided` audit entry with the full before-image;
--    - publishes `payment.voided` (requiredModule 'gst') so Finance reverses the
--      settlement entries it posted for those allocations. Published from the database,
--      in the same transaction, so a void can never happen without its event.
--
-- Recording and allocating payments is unchanged.

-- ---------------------------------------------------------------------------
-- Permission
-- ---------------------------------------------------------------------------

insert into core.permissions (key, module, description) values
  ('payments.void', 'core', 'Void a recorded payment, with a reason')
on conflict (key) do nothing;

insert into core.role_permission_grants (role_id, permission_key)
select r.id, 'payments.void'
from core.roles r
where r.business_id is null and r.key in ('owner', 'admin', 'accountant')
on conflict do nothing;

insert into core.role_permissions (role, permission_key) values
  ('owner', 'payments.void'),
  ('admin', 'payments.void'),
  ('accountant', 'payments.void')
on conflict (role, permission_key) do nothing;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table core.payments add column voided_at timestamptz;
alter table core.payments add column voided_by uuid;
alter table core.payments add column void_reason text;
alter table core.payments add column voided_allocations jsonb;

-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------

-- True only inside core.void_payment() for that payment: the flag it sets, *and* running
-- as the tables' owner (which the SECURITY DEFINER function does). A client role can set
-- the flag itself (`set core.voiding_payment = ...`), but can't become the owner.
create function core.is_voiding_payment(p_payment_id uuid)
returns boolean
language sql
stable
set search_path = core
as $$
  select current_setting('core.voiding_payment', true) = p_payment_id::text
     and current_user = (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'core.payments'::regclass);
$$;

-- Both triggers run with the caller's rights (not SECURITY DEFINER), so that
-- core.is_voiding_payment() sees who is really making the change.
create function core.enforce_payment_immutability()
returns trigger
language plpgsql
set search_path = core
as $$
begin
  if tg_op = 'INSERT' then
    if new.voided_at is not null or new.voided_by is not null or new.void_reason is not null
       or new.voided_allocations is not null then
      raise exception 'A payment can''t be recorded already voided.' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not exists (select 1 from core.businesses where id = old.business_id) then
      return old; -- the business itself is being deleted
    end if;
    raise exception 'Payments are never deleted -- void it instead (core.void_payment).'
      using errcode = 'insufficient_privilege';
  end if;

  if (new.business_id, new.party_id, new.method, new.amount, new.payment_date, new.reference, new.created_by, new.created_at)
     is distinct from
     (old.business_id, old.party_id, old.method, old.amount, old.payment_date, old.reference, old.created_by, old.created_at)
  then
    raise exception 'A recorded payment can''t be changed -- void it and record the correct one.'
      using errcode = 'insufficient_privilege';
  end if;
  if (new.voided_at, new.voided_by, new.void_reason, new.voided_allocations)
     is distinct from (old.voided_at, old.voided_by, old.void_reason, old.voided_allocations)
     and (old.voided_at is not null or not core.is_voiding_payment(old.id))
  then
    raise exception 'A payment is voided once, through core.void_payment().'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger payments_enforce_immutability
  before insert or update or delete on core.payments
  for each row execute function core.enforce_payment_immutability();

create function core.enforce_payment_allocation_immutability()
returns trigger
language plpgsql
set search_path = core
as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from core.payments where id = new.payment_id and voided_at is not null) then
      raise exception 'A voided payment can''t be allocated.' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if core.is_voiding_payment(old.payment_id)
       or not exists (select 1 from core.businesses where id = old.business_id) then
      return old;
    end if;
    raise exception 'Payment allocations are never deleted -- void the payment instead (core.void_payment).'
      using errcode = 'insufficient_privilege';
  end if;

  raise exception 'Payment allocations can''t be changed -- void the payment and record the correct one.'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger payment_allocations_enforce_immutability
  before insert or update or delete on core.payment_allocations
  for each row execute function core.enforce_payment_allocation_immutability();

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
