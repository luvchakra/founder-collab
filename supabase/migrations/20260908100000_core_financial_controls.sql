-- Financial-reporting internal controls (SOX ITGC / ICFR-style), applied to the money
-- tables core already owns (core.documents, core.payments, core.payment_allocations,
-- core.audit_log). Platform-wide, so it lives in core: inventory, FSM and GST all post
-- their money documents here (ADR-7), and every one of them inherits these controls
-- without writing their own.
--
-- What this migration enforces, each in the database (ADR-8's reasoning: a control that
-- only lives in application code is bypassed by any other code path):
--
-- 1. Tamper-evident, append-only audit trail. core.audit_log gains a per-business
--    sequence number and a SHA-256 hash chain (each row's hash covers the previous
--    row's hash), so a deleted, altered or reordered entry is detectable by
--    core.verify_audit_chain(). UPDATE/DELETE/TRUNCATE are rejected for every role,
--    service_role included (BYPASSRLS skips policies, not triggers). The only deletion
--    path is the retention purge, and only for rows past the retention period.
--    The business FK is dropped so the trail outlives the business it describes --
--    evidence of a deletion must survive the deletion.
--
-- 2. Audit-log forgery fix. write_audit_log() was SECURITY DEFINER, granted to
--    `authenticated`, and checked nothing: any signed-in user could write an entry into
--    any tenant's log with any actor_id. It now requires membership of the business and
--    forces actor_id = auth.uid() for user callers. Internal triggers use
--    core.append_audit_log(), which no client role can execute.
--
-- 3. Posting. core.documents gains posted_at/posted_by. Once posted, a document's
--    financial fields (party, number, dates, amounts, type) and its lines are immutable;
--    corrections are made with a credit/debit note, never by editing. Posting is
--    explicit (core.post_document()) and also automatic the first time a payment is
--    allocated against an invoice/credit note/debit note -- a paid invoice must not change.
--
-- 4. Numbered tax documents are never deleted. GST requires gap-free invoice numbering
--    (D-5's core.next_number()); deleting INV/0042 would leave a hole and erase the
--    record. Cancellation is a credit note.
--
-- 5. Period close. core.financial_close holds a per-business "books closed through"
--    date. Nothing dated on or before it can be created, changed or deleted: documents,
--    lines, payments. Closing needs finance.close_period; reopening needs a *different*
--    permission, finance.reopen_period, plus a written reason, and both are audited.
--
-- 6. Payments are never edited or deleted, only voided. core.void_payment() needs
--    payments.void and a reason, and enforces maker-checker: the person who recorded a
--    payment can't void it themselves unless they're an owner/admin (a small team may
--    have nobody else). Voided payments drop out of core.document_balances.
--
-- 7. Segregation of duties. New permissions (documents.post, payments.record,
--    payments.void, finance.close_period, finance.reopen_period, audit.view,
--    billing.manage, privacy.manage) are split across roles so no single non-owner role
--    can record, void, close and reopen. Recording payments now needs payments.record;
--    reading the audit log needs audit.view (it contains before/after snapshots of
--    financial and settings data, which not every member should see).
--
-- 8. Access-change and lifecycle auditing. Business membership/role changes (the core
--    ITGC "user access management" evidence), license status changes, payments,
--    allocations, voids, postings, period close/reopen and business deletion all write
--    audit entries from triggers.

-- ---------------------------------------------------------------------------
-- 0. Permissions for segregation of duties
-- ---------------------------------------------------------------------------

insert into core.permissions (key, module, description) values
  ('documents.post', 'core', 'Post (finalize) a financial document, locking its amounts and lines'),
  ('payments.record', 'core', 'Record payments and allocate them to documents'),
  ('payments.void', 'core', 'Void a recorded payment, with a reason'),
  ('finance.close_period', 'core', 'Close the books through a date'),
  ('finance.reopen_period', 'core', 'Reopen closed books, with a reason'),
  ('audit.view', 'core', 'View the audit log and verify its integrity'),
  ('billing.manage', 'core', 'Manage module subscriptions and payment gateway settings'),
  ('privacy.manage', 'core', 'Handle data-principal (GDPR/DPDP) requests about the business''s customers and contacts');

insert into core.role_permissions (role, permission_key)
select r, k
from unnest(array['owner', 'admin']) as r,
     unnest(array[
       'documents.post', 'payments.record', 'payments.void', 'finance.close_period',
       'finance.reopen_period', 'audit.view', 'billing.manage', 'privacy.manage'
     ]) as k;

-- accountant: can record, void, post and close -- but not reopen (SoD: whoever closes the
-- books can't quietly reopen them to change history).
insert into core.role_permissions (role, permission_key) values
  ('accountant', 'documents.post'),
  ('accountant', 'payments.record'),
  ('accountant', 'payments.void'),
  ('accountant', 'finance.close_period'),
  ('accountant', 'audit.view'),
  ('sales_manager', 'documents.post'),
  ('sales_manager', 'payments.record');

-- ---------------------------------------------------------------------------
-- 1 + 2. Audit log: hash chain, append-only, forgery fix
-- ---------------------------------------------------------------------------

alter table core.audit_log drop constraint audit_log_business_id_fkey;
alter table core.audit_log add column seq bigint;
alter table core.audit_log add column prev_hash text;
alter table core.audit_log add column row_hash text;

-- Canonical serialization of every audited field. jsonb::text is canonical (jsonb
-- normalizes key order and whitespace) and the timestamp is rendered in UTC at
-- microsecond precision, so the same row always hashes the same way.
create function core.audit_log_row_hash(r core.audit_log)
returns text
language sql
immutable
set search_path = core
as $$
  select encode(sha256(convert_to(concat_ws('|',
    r.prev_hash, r.seq::text, r.id::text, r.business_id::text, coalesce(r.actor_id::text, ''),
    r.action, r.entity_type, coalesce(r.entity_id::text, ''),
    coalesce(r.before::text, ''), coalesce(r.after::text, ''),
    to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
  ), 'UTF8')), 'hex');
$$;

-- Backfill the chain for any rows written before this migration, per business in
-- (created_at, id) order.
do $$
declare
  r core.audit_log%rowtype;
  v_business uuid := null;
  v_seq bigint;
  v_prev text;
begin
  for r in select * from core.audit_log order by business_id, created_at, id loop
    if v_business is distinct from r.business_id then
      v_business := r.business_id;
      v_seq := 0;
      v_prev := 'GENESIS';
    end if;
    v_seq := v_seq + 1;
    r.seq := v_seq;
    r.prev_hash := v_prev;
    r.row_hash := core.audit_log_row_hash(r);
    update core.audit_log set seq = r.seq, prev_hash = r.prev_hash, row_hash = r.row_hash where id = r.id;
    v_prev := r.row_hash;
  end loop;
end $$;

alter table core.audit_log alter column seq set not null;
alter table core.audit_log alter column prev_hash set not null;
alter table core.audit_log alter column row_hash set not null;
create unique index audit_log_business_seq_key on core.audit_log (business_id, seq);

-- Every insert -- from write_audit_log(), a trigger, or a service-role client -- is
-- chained here, so no write path can skip it. The per-business advisory lock
-- serializes concurrent writers to one business's chain (different businesses never
-- contend). created_at is forced to the transaction time so an entry can't be backdated.
create function core.audit_log_chain()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  v_last core.audit_log%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('core.audit_log:' || new.business_id::text, 0));
  select * into v_last from core.audit_log
  where business_id = new.business_id
  order by seq desc
  limit 1;

  new.id := coalesce(new.id, gen_random_uuid());
  new.created_at := now();
  new.seq := coalesce(v_last.seq, 0) + 1;
  new.prev_hash := coalesce(v_last.row_hash, 'GENESIS');
  new.row_hash := core.audit_log_row_hash(new);
  return new;
end;
$$;

create trigger audit_log_chain
  before insert on core.audit_log
  for each row execute function core.audit_log_chain();

-- Retention purge is the one sanctioned delete (GDPR/DPDP storage limitation vs.
-- financial-record retention -- see core.purge_expired_audit_log() below), and even it
-- can only remove rows older than the retention floor. Setting the flag by hand doesn't
-- help an attacker delete anything recent.
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

-- Internal append, used by every trigger below. Not executable by any client role.
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

-- Same signature as before (callers unchanged); now authorizes user callers. A
-- service-role/trigger-less caller (auth.uid() is null -- the admin client, cron) is
-- trusted, as it already bypasses RLS everywhere else.
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
  if v_uid is not null then
    if p_business_id not in (select core.user_business_ids()) then
      raise exception 'Not a member of business %', p_business_id using errcode = 'insufficient_privilege';
    end if;
    p_actor_id := v_uid;
  end if;
  return core.append_audit_log(p_business_id, p_actor_id, p_action, p_entity_type, p_entity_id, p_before, p_after);
end;
$$;

-- The two D-10 triggers predate append_audit_log() -- repoint them so the after-delete
-- and service-role paths below never hit write_audit_log()'s membership check.
create or replace function core.log_document_status_change()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if new.status is distinct from old.status then
    perform core.append_audit_log(
      new.business_id, auth.uid(), 'document.status_changed', 'document', new.id,
      jsonb_build_object('status', old.status), jsonb_build_object('status', new.status)
    );
  end if;
  return new;
end;
$$;

-- Read access: audit.view only (C-7 permission), not every member.
drop policy "members can view audit log entries in their businesses" on core.audit_log;
create policy "audit viewers can view audit log entries in their businesses"
  on core.audit_log for select
  using (
    business_id in (select core.user_business_ids())
    and core.has_permission(business_id, 'audit.view')
  );

-- Walks one business's chain in seq order, recomputing every hash. Returns the first
-- broken entry, if any: a recomputed hash that doesn't match (row altered), a prev_hash
-- that doesn't match the previous row (row deleted or reordered), or a gap in seq
-- (row deleted). The very first surviving row's prev_hash is taken as given, since the
-- retention purge legitimately removes the oldest rows.
create function core.verify_audit_chain(p_business_id uuid)
returns table (valid boolean, entries_checked bigint, first_invalid_seq bigint, reason text)
language plpgsql
stable
security definer
set search_path = core
as $$
declare
  r core.audit_log%rowtype;
  v_prev_hash text := null;
  v_prev_seq bigint := null;
  v_count bigint := 0;
begin
  if auth.uid() is not null and not core.has_permission(p_business_id, 'audit.view') then
    raise exception 'Missing audit.view permission' using errcode = 'insufficient_privilege';
  end if;

  for r in select * from core.audit_log where business_id = p_business_id order by seq loop
    v_count := v_count + 1;
    if v_prev_seq is not null and r.seq <> v_prev_seq + 1 then
      return query select false, v_count, r.seq, 'sequence gap: an entry is missing'::text;
      return;
    end if;
    if v_prev_hash is not null and r.prev_hash <> v_prev_hash then
      return query select false, v_count, r.seq, 'chain broken: previous entry was altered or removed'::text;
      return;
    end if;
    if core.audit_log_row_hash(r) <> r.row_hash then
      return query select false, v_count, r.seq, 'hash mismatch: entry was altered'::text;
      return;
    end if;
    v_prev_hash := r.row_hash;
    v_prev_seq := r.seq;
  end loop;

  return query select true, v_count, null::bigint, null::text;
end;
$$;

revoke execute on function core.verify_audit_chain(uuid) from public, anon;
grant execute on function core.verify_audit_chain(uuid) to authenticated, service_role;

-- Financial records: CGST Act s.36 requires 72 months from the due date of the year's
-- annual return (up to ~8 years from the start of that financial year); SOX s.802 requires
-- 7 years for audit records. 8 years covers both.
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

-- ---------------------------------------------------------------------------
-- 5. Period close (defined before the document/payment triggers that read it)
-- ---------------------------------------------------------------------------

create table core.financial_close (
  business_id uuid primary key references core.businesses (id) on delete cascade,
  closed_through date not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table core.financial_close enable row level security;

create policy "members can view their business's close date"
  on core.financial_close for select
  using (business_id in (select core.user_business_ids()));
-- No write policy: only close_books_through()/reopen_books() below change it.
revoke insert, update, delete on core.financial_close from authenticated;

create function core.closed_through(p_business_id uuid)
returns date
language sql
stable
security definer
set search_path = core
as $$
  select closed_through from core.financial_close where business_id = p_business_id;
$$;

revoke execute on function core.closed_through(uuid) from public, anon;
grant execute on function core.closed_through(uuid) to authenticated, service_role;

create function core.assert_period_open(p_business_id uuid, p_date date, p_what text)
returns void
language plpgsql
stable
security definer
set search_path = core
as $$
declare
  v_closed date := core.closed_through(p_business_id);
begin
  if v_closed is not null and p_date is not null and p_date <= v_closed then
    raise exception 'Books are closed through % -- % dated % can''t be created, changed or deleted', v_closed, p_what, p_date
      using errcode = 'check_violation';
  end if;
end;
$$;

create function core.close_books_through(p_business_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = core
as $$
declare
  v_old date := core.closed_through(p_business_id);
begin
  if not core.has_permission(p_business_id, 'finance.close_period') then
    raise exception 'Missing finance.close_period permission' using errcode = 'insufficient_privilege';
  end if;
  if p_date > current_date then
    raise exception 'Can''t close a period that hasn''t ended yet (%)', p_date;
  end if;
  if v_old is not null and p_date <= v_old then
    raise exception 'Books are already closed through % -- use reopen_books() to move the date back', v_old;
  end if;

  insert into core.financial_close (business_id, closed_through, updated_by, updated_at)
  values (p_business_id, p_date, auth.uid(), now())
  on conflict (business_id) do update
    set closed_through = excluded.closed_through, updated_by = excluded.updated_by, updated_at = now();

  perform core.append_audit_log(
    p_business_id, auth.uid(), 'finance.books_closed', 'financial_close', p_business_id,
    jsonb_build_object('closed_through', v_old), jsonb_build_object('closed_through', p_date)
  );
end;
$$;

create function core.reopen_books(p_business_id uuid, p_date date, p_reason text)
returns void
language plpgsql
security definer
set search_path = core
as $$
declare
  v_old date := core.closed_through(p_business_id);
begin
  if not core.has_permission(p_business_id, 'finance.reopen_period') then
    raise exception 'Missing finance.reopen_period permission' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 10 then
    raise exception 'A reason (at least 10 characters) is required to reopen closed books';
  end if;
  if v_old is null or (p_date is not null and p_date >= v_old) then
    raise exception 'Reopening must move the close date earlier than %', v_old;
  end if;

  if p_date is null then
    delete from core.financial_close where business_id = p_business_id;
  else
    update core.financial_close
      set closed_through = p_date, updated_by = auth.uid(), updated_at = now()
      where business_id = p_business_id;
  end if;

  perform core.append_audit_log(
    p_business_id, auth.uid(), 'finance.books_reopened', 'financial_close', p_business_id,
    jsonb_build_object('closed_through', v_old),
    jsonb_build_object('closed_through', p_date, 'reason', p_reason)
  );
end;
$$;

revoke execute on function core.close_books_through(uuid, date) from public, anon;
revoke execute on function core.reopen_books(uuid, date, text) from public, anon;
grant execute on function core.close_books_through(uuid, date) to authenticated;
grant execute on function core.reopen_books(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3 + 4. Documents: posting, immutability, no deletion of numbered tax documents
-- ---------------------------------------------------------------------------

alter table core.documents add column posted_at timestamptz;
alter table core.documents add column posted_by uuid;

-- The fields that make up a document's financial substance. Anything else (status,
-- payment_status, notes, expected_date, source_ref) is workflow metadata and stays
-- editable after posting -- e.g. inventory's sales_invoices compat view sets
-- payment_status on an invoice that's long been issued.
create function core.document_financials_changed(o core.documents, n core.documents)
returns boolean
language sql
immutable
as $$
  select (o.business_id, o.doc_type, o.source_module, o.party_id, o.number, o.doc_date, o.due_date,
          o.subtotal, o.discount_amount, o.cgst_amount, o.sgst_amount, o.igst_amount,
          o.shipping_amount, o.total_amount)
    is distinct from
         (n.business_id, n.doc_type, n.source_module, n.party_id, n.number, n.doc_date, n.due_date,
          n.subtotal, n.discount_amount, n.cgst_amount, n.sgst_amount, n.igst_amount,
          n.shipping_amount, n.total_amount);
$$;

create function core.enforce_document_financial_controls()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if tg_op = 'INSERT' then
    perform core.assert_period_open(new.business_id, new.doc_date, 'a document');
    if new.posted_at is not null then
      new.posted_by := coalesce(new.posted_by, auth.uid());
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.posted_at is not null then
      raise exception 'Document % is posted and can''t be deleted -- issue a credit note instead', coalesce(old.number, old.id::text)
        using errcode = 'check_violation';
    end if;
    if old.doc_type in ('invoice', 'credit_note', 'debit_note') and old.number is not null then
      raise exception 'Numbered tax document % can''t be deleted (GST numbering must stay gap-free) -- issue a credit note instead', old.number
        using errcode = 'check_violation';
    end if;
    perform core.assert_period_open(old.business_id, old.doc_date, 'a document');
    return old;
  end if;

  -- UPDATE
  if old.posted_at is not null and new.posted_at is null then
    raise exception 'A posted document can''t be unposted' using errcode = 'check_violation';
  end if;
  if old.posted_at is not null and (new.posted_at <> old.posted_at or new.posted_by is distinct from old.posted_by) then
    raise exception 'posted_at/posted_by can''t be changed once set' using errcode = 'check_violation';
  end if;
  if core.document_financials_changed(old, new) then
    if old.posted_at is not null then
      raise exception 'Document % is posted -- its amounts, party, number and dates are locked; issue a credit/debit note to correct it', coalesce(old.number, old.id::text)
        using errcode = 'check_violation';
    end if;
    perform core.assert_period_open(old.business_id, old.doc_date, 'a document');
    perform core.assert_period_open(new.business_id, new.doc_date, 'a document');
  end if;
  if old.posted_at is null and new.posted_at is not null then
    new.posted_by := coalesce(new.posted_by, auth.uid());
  end if;
  return new;
end;
$$;

create trigger documents_enforce_financial_controls
  before insert or update or delete on core.documents
  for each row execute function core.enforce_document_financial_controls();

create function core.enforce_document_line_financial_controls()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  v_doc core.documents%rowtype;
begin
  select * into v_doc from core.documents where id = coalesce(new.document_id, old.document_id);
  -- Not found: the parent is being deleted in this same statement (cascade) and its own
  -- trigger already decided that's allowed.
  if found then
    if v_doc.posted_at is not null then
      raise exception 'Document % is posted -- its lines are locked', coalesce(v_doc.number, v_doc.id::text)
        using errcode = 'check_violation';
    end if;
    perform core.assert_period_open(v_doc.business_id, v_doc.doc_date, 'a document line');
  end if;
  if tg_op = 'UPDATE' and new.document_id <> old.document_id then
    select * into v_doc from core.documents where id = new.document_id;
    if v_doc.posted_at is not null then
      raise exception 'Document % is posted -- its lines are locked', coalesce(v_doc.number, v_doc.id::text);
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger document_lines_enforce_financial_controls
  before insert or update or delete on core.document_lines
  for each row execute function core.enforce_document_line_financial_controls();

create function core.post_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = core
as $$
declare
  v_doc core.documents%rowtype;
begin
  select * into v_doc from core.documents where id = p_document_id;
  if not found then
    raise exception 'Document not found';
  end if;
  if auth.uid() is not null and not core.has_permission(v_doc.business_id, 'documents.post') then
    raise exception 'Missing documents.post permission' using errcode = 'insufficient_privilege';
  end if;
  if v_doc.posted_at is not null then
    return;
  end if;
  if v_doc.number is null then
    raise exception 'A document must be numbered before it can be posted';
  end if;

  update core.documents set posted_at = now(), posted_by = auth.uid() where id = p_document_id;
  perform core.append_audit_log(
    v_doc.business_id, auth.uid(), 'document.posted', 'document', p_document_id, null,
    jsonb_build_object('doc_type', v_doc.doc_type, 'number', v_doc.number, 'total_amount', v_doc.total_amount)
  );
end;
$$;

revoke execute on function core.post_document(uuid) from public, anon;
grant execute on function core.post_document(uuid) to authenticated, service_role;

-- Business deletion is evidence too (the audit_log FK is gone, so this row survives).
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

-- ---------------------------------------------------------------------------
-- 6. Payments: immutable, void-only, maker-checker, period-locked
-- ---------------------------------------------------------------------------

alter table core.payments add column voided_at timestamptz;
alter table core.payments add column voided_by uuid;
alter table core.payments add column void_reason text;

create function core.enforce_payment_financial_controls()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if tg_op = 'INSERT' then
    perform core.assert_period_open(new.business_id, new.payment_date, 'a payment');
    if new.voided_at is not null then
      raise exception 'A payment can''t be created already voided';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Payments are never deleted -- void it instead (core.void_payment)'
      using errcode = 'check_violation';
  end if;

  -- UPDATE: only notes may change freely; voiding happens once, through void_payment().
  if (old.business_id, old.party_id, old.method, old.amount, old.payment_date, old.reference, old.created_by, old.created_at)
     is distinct from
     (new.business_id, new.party_id, new.method, new.amount, new.payment_date, new.reference, new.created_by, new.created_at)
  then
    raise exception 'A recorded payment''s amount, party, method, date and reference are immutable -- void it and record a new one'
      using errcode = 'check_violation';
  end if;
  if old.voided_at is not null and (new.voided_at, new.voided_by, new.void_reason) is distinct from (old.voided_at, old.voided_by, old.void_reason) then
    raise exception 'A voided payment can''t be un-voided or re-voided' using errcode = 'check_violation';
  end if;
  if old.voided_at is null and new.voided_at is not null
     and current_setting('core.voiding_payment', true) is distinct from new.id::text then
    raise exception 'Void a payment through core.void_payment()' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger payments_enforce_financial_controls
  before insert or update or delete on core.payments
  for each row execute function core.enforce_payment_financial_controls();

create function core.void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = core
as $$
declare
  v_payment core.payments%rowtype;
  v_uid uuid := auth.uid();
begin
  select * into v_payment from core.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  if v_uid is not null then
    if v_payment.business_id not in (select core.user_business_ids())
       or not core.has_permission(v_payment.business_id, 'payments.void') then
      raise exception 'Missing payments.void permission' using errcode = 'insufficient_privilege';
    end if;
    -- Maker-checker: the recorder can't void their own payment unless they're an
    -- owner/admin (whose role already grants every permission there is).
    if v_payment.created_by = v_uid and not exists (
      select 1 from core.business_members
      where business_id = v_payment.business_id and user_id = v_uid and role in ('owner', 'admin')
    ) then
      raise exception 'Segregation of duties: a payment must be voided by someone other than the person who recorded it'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  if v_payment.voided_at is not null then
    raise exception 'Payment is already voided';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then
    raise exception 'A reason is required to void a payment';
  end if;
  perform core.assert_period_open(v_payment.business_id, v_payment.payment_date, 'a payment');

  perform set_config('core.voiding_payment', p_payment_id::text, true);
  update core.payments
    set voided_at = now(), voided_by = v_uid, void_reason = p_reason
    where id = p_payment_id;
  perform set_config('core.voiding_payment', '', true);

  perform core.append_audit_log(
    v_payment.business_id, v_uid, 'payment.voided', 'payment', p_payment_id,
    jsonb_build_object('amount', v_payment.amount, 'method', v_payment.method),
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

revoke execute on function core.void_payment(uuid, text) from public, anon;
grant execute on function core.void_payment(uuid, text) to authenticated, service_role;

create function core.log_payment_recorded()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  perform core.append_audit_log(
    new.business_id, auth.uid(), 'payment.recorded', 'payment', new.id, null,
    jsonb_build_object('amount', new.amount, 'method', new.method, 'party_id', new.party_id,
                       'payment_date', new.payment_date, 'reference', new.reference)
  );
  return new;
end;
$$;

create trigger payments_log_recorded
  after insert on core.payments
  for each row execute function core.log_payment_recorded();

-- Allocations are immutable (no update/delete) and auto-post the tax document they pay.
-- An allocation against a voided payment is rejected.
create function core.enforce_payment_allocation_financial_controls()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  v_payment core.payments%rowtype;
  v_doc core.documents%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Payment allocations are immutable -- void the payment and record a new one'
      using errcode = 'check_violation';
  end if;
  select * into v_payment from core.payments where id = new.payment_id;
  if v_payment.voided_at is not null then
    raise exception 'Can''t allocate a voided payment';
  end if;
  return new;
end;
$$;

create trigger payment_allocations_enforce_financial_controls
  before insert or update or delete on core.payment_allocations
  for each row execute function core.enforce_payment_allocation_financial_controls();

create function core.after_payment_allocated()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
declare
  v_doc core.documents%rowtype;
begin
  select * into v_doc from core.documents where id = new.document_id;
  if v_doc.posted_at is null and v_doc.number is not null
     and v_doc.doc_type in ('invoice', 'credit_note', 'debit_note') then
    update core.documents set posted_at = now(), posted_by = auth.uid() where id = new.document_id;
    perform core.append_audit_log(
      new.business_id, auth.uid(), 'document.posted', 'document', new.document_id, null,
      jsonb_build_object('doc_type', v_doc.doc_type, 'number', v_doc.number, 'trigger', 'payment_allocated')
    );
  end if;
  perform core.append_audit_log(
    new.business_id, auth.uid(), 'payment.allocated', 'payment_allocation', new.id, null,
    jsonb_build_object('payment_id', new.payment_id, 'document_id', new.document_id, 'amount', new.amount)
  );
  return new;
end;
$$;

create trigger payment_allocations_after_insert
  after insert on core.payment_allocations
  for each row execute function core.after_payment_allocated();

-- RLS: recording needs payments.record; nobody deletes; allocations are insert-only.
drop policy "members can create payments in their businesses" on core.payments;
drop policy "members can delete payments in their businesses" on core.payments;
create policy "payment recorders can create payments in their businesses"
  on core.payments for insert
  with check (
    business_id in (select core.user_business_ids())
    and core.has_permission(business_id, 'payments.record')
  );

drop policy "members can create payment allocations in their businesses" on core.payment_allocations;
drop policy "members can update payment allocations in their businesses" on core.payment_allocations;
drop policy "members can delete payment allocations in their businesses" on core.payment_allocations;
create policy "payment recorders can create payment allocations in their businesses"
  on core.payment_allocations for insert
  with check (
    business_id in (select core.user_business_ids())
    and core.has_permission(business_id, 'payments.record')
  );
revoke delete on core.payments, core.payment_allocations from authenticated;
revoke update on core.payment_allocations from authenticated;

-- A voided payment's allocations no longer count toward what's been paid.
create or replace view core.document_balances
with (security_invoker = true) as
select
  d.id as document_id,
  d.business_id,
  d.total_amount,
  coalesce(pa.paid_amount, 0) as paid_amount,
  d.total_amount - coalesce(pa.paid_amount, 0) as balance_amount
from core.documents d
left join (
  select a.document_id, sum(a.amount) as paid_amount
  from core.payment_allocations a
  join core.payments p on p.id = a.payment_id
  where p.voided_at is null
  group by a.document_id
) pa on pa.document_id = d.id;

-- The allocation-cap check (D-7) must also ignore nothing -- a voided payment can't be
-- allocated at all (above) -- so its existing logic stays correct unchanged.

-- ---------------------------------------------------------------------------
-- 8. Access-change and license auditing
-- ---------------------------------------------------------------------------

create function core.log_business_member_change()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if tg_op = 'INSERT' then
    perform core.append_audit_log(new.business_id, auth.uid(), 'business_member.added', 'business_member', new.user_id,
      null, jsonb_build_object('user_id', new.user_id, 'role', new.role));
    return new;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      perform core.append_audit_log(new.business_id, auth.uid(), 'business_member.role_changed', 'business_member', new.user_id,
        jsonb_build_object('role', old.role), jsonb_build_object('role', new.role));
    end if;
    return new;
  else
    perform core.append_audit_log(old.business_id, auth.uid(), 'business_member.removed', 'business_member', old.user_id,
      jsonb_build_object('user_id', old.user_id, 'role', old.role), null);
    return old;
  end if;
end;
$$;

create trigger business_members_log_change
  after insert or update or delete on core.business_members
  for each row execute function core.log_business_member_change();

create function core.log_license_change()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform core.append_audit_log(
      new.business_id, auth.uid(), 'license.status_changed', 'license', new.id,
      case when tg_op = 'UPDATE' then jsonb_build_object('module_key', old.module_key, 'status', old.status) end,
      jsonb_build_object('module_key', new.module_key, 'status', new.status)
    );
  end if;
  return new;
end;
$$;

create trigger licenses_log_change
  after insert or update on core.licenses
  for each row execute function core.log_license_change();
