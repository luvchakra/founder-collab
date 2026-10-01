-- GDPR (EU 2016/679) + India's DPDP Act 2023 / DPDP Rules 2025: the data-protection
-- primitives every module shares, owned by core because personal data lives in core
-- (parties, contacts, profiles) and in every module that copies it.
--
-- 1. Consent records -- append-only proof of what each user agreed to, under which
--    notice version, and when (GDPR Art. 7(1) "demonstrate consent"; DPDP s.6
--    "free, specific, informed ... with a clear affirmative action", withdrawal "with
--    comparable ease"). The current state is the latest row per purpose; withdrawal is
--    a new row, never an edit, so the history is the evidence.
--
-- 2. Data-subject / data-principal requests -- one register for both regimes' rights:
--    access + portability (GDPR 15/20; DPDP s.11), correction (GDPR 16; DPDP s.12),
--    erasure (GDPR 17; DPDP s.12), restriction/objection (GDPR 18/21), consent
--    withdrawal (DPDP s.6(4)), grievance (DPDP s.13), nomination (DPDP s.14). Two
--    kinds of request share it: a platform user's request about their own account
--    (business_id null -- the platform is controller/fiduciary), and a request a
--    business receives from one of its own customers/prospects (business_id set -- the
--    business is controller, the platform its processor, handled by members with
--    privacy.manage). due_at defaults to 30 days (GDPR Art. 12(3) one month, also inside
--    DPDP Rules' 90-day grievance window).
--
-- 3. Communication suppressions -- addresses that must not be contacted again
--    (unsubscribe, spam complaint, hard bounce, erasure, objection). Only a SHA-256 of the
--    normalized address is stored, so the do-not-contact list doesn't itself keep the
--    address it promised to forget. No client delete: re-contacting someone who opted
--    out isn't an in-app action.
--
-- 4. core.erase_subject_by_email() -- erasure of a third-party subject's data within one
--    business. Core-owned data is anonymized here; where the subject appears on
--    financial documents the record is restricted rather than erased (GDPR Art. 17(3)(b)
--    legal obligation; DPDP s.8(7) "unless retention is necessary for compliance with
--    any law" -- GST invoices must name the buyer for 8 years). Other modules' copies
--    are erased by their own handlers of the published `privacy.subject_erased` event
--    (ADR-5: core never reaches into a module's schema) -- the event carries only the
--    email hash.
--
-- 5. core.run_retention() -- storage limitation (GDPR Art. 5(1)(e); DPDP s.8(7)):
--    one scheduled entry point applying every retention rule.

create function core.email_hash(p_email text)
returns text
language sql
immutable
as $$
  select case when p_email is null or trim(p_email) = '' then null
    else encode(sha256(convert_to(lower(trim(p_email)), 'UTF8')), 'hex') end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Consent
-- ---------------------------------------------------------------------------

create table core.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('terms_privacy', 'marketing_communications')),
  granted boolean not null,
  notice_version text not null,
  source text not null check (source in ('signup', 'settings', 'reconsent')),
  created_at timestamptz not null default now()
);

create index consent_records_user_purpose_idx on core.consent_records (user_id, purpose, created_at desc);

alter table core.consent_records enable row level security;
create policy "users can view their own consent records"
  on core.consent_records for select
  using (user_id = (select auth.uid()));
create policy "users can record their own consent"
  on core.consent_records for insert
  with check (user_id = (select auth.uid()));
revoke update, delete on core.consent_records from authenticated;

create view core.current_consents
with (security_invoker = true) as
select distinct on (user_id, purpose)
  user_id, purpose, granted, notice_version, source, created_at
from core.consent_records
order by user_id, purpose, created_at desc;

-- ---------------------------------------------------------------------------
-- 2. Data-subject requests
-- ---------------------------------------------------------------------------

create table core.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid references auth.users (id) on delete set null,
  business_id uuid references core.businesses (id) on delete cascade,
  subject_email text,
  subject_email_hash text,
  request_type text not null check (request_type in (
    'access', 'portability', 'correction', 'erasure', 'restriction', 'objection',
    'withdraw_consent', 'grievance', 'nomination'
  )),
  details text,
  status text not null default 'received' check (status in ('received', 'in_progress', 'completed', 'rejected')),
  response text,
  due_at timestamptz not null default (now() + interval '30 days'),
  completed_at timestamptz,
  handled_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index data_subject_requests_business_idx on core.data_subject_requests (business_id, status);
create index data_subject_requests_requester_idx on core.data_subject_requests (requester_user_id);

create trigger data_subject_requests_set_updated_at
  before update on core.data_subject_requests
  for each row execute function core.set_updated_at();

-- Only the handling fields change after receipt -- what was asked, by whom, and when it
-- was due are fixed once filed (the register is accountability evidence).
create function core.enforce_dsr_integrity()
returns trigger
language plpgsql
set search_path = core
as $$
begin
  if tg_op = 'INSERT' then
    new.subject_email_hash := coalesce(core.email_hash(new.subject_email), new.subject_email_hash);
    new.created_at := now();
    new.due_at := now() + interval '30 days';
    return new;
  end if;
  if (new.requester_user_id is distinct from old.requester_user_id and new.requester_user_id is not null)
     or new.business_id is distinct from old.business_id
     or new.request_type is distinct from old.request_type
     or new.details is distinct from old.details
     or new.due_at is distinct from old.due_at
     or new.created_at is distinct from old.created_at
     or new.subject_email_hash is distinct from old.subject_email_hash
     -- subject_email may only be cleared (minimization after completion), never changed
     or (new.subject_email is not null and new.subject_email is distinct from old.subject_email)
  then
    raise exception 'A data-subject request''s substance can''t be edited after it is filed'
      using errcode = 'check_violation';
  end if;
  if new.status in ('completed', 'rejected') and old.status not in ('completed', 'rejected') then
    new.completed_at := now();
    new.handled_by := coalesce(new.handled_by, auth.uid());
  end if;
  return new;
end;
$$;

create trigger data_subject_requests_enforce_integrity
  before insert or update on core.data_subject_requests
  for each row execute function core.enforce_dsr_integrity();

create function core.log_dsr_change()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if new.business_id is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    perform core.append_audit_log(new.business_id, auth.uid(), 'privacy.request_received', 'data_subject_request', new.id,
      null, jsonb_build_object('request_type', new.request_type, 'due_at', new.due_at));
  elsif new.status is distinct from old.status then
    perform core.append_audit_log(new.business_id, auth.uid(), 'privacy.request_status_changed', 'data_subject_request', new.id,
      jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  end if;
  return new;
end;
$$;

create trigger data_subject_requests_log_change
  after insert or update on core.data_subject_requests
  for each row execute function core.log_dsr_change();

alter table core.data_subject_requests enable row level security;

create policy "requesters and privacy managers can view requests"
  on core.data_subject_requests for select
  using (
    requester_user_id = (select auth.uid())
    or (business_id in (select core.user_business_ids()) and core.has_permission(business_id, 'privacy.manage'))
  );
create policy "users can file their own requests; privacy managers can log their business's"
  on core.data_subject_requests for insert
  with check (
    (business_id is null and requester_user_id = (select auth.uid()))
    or (business_id in (select core.user_business_ids()) and core.has_permission(business_id, 'privacy.manage'))
  );
create policy "privacy managers can handle their business's requests"
  on core.data_subject_requests for update
  using (business_id in (select core.user_business_ids()) and core.has_permission(business_id, 'privacy.manage'));
revoke delete on core.data_subject_requests from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Suppressions
-- ---------------------------------------------------------------------------

create table core.communication_suppressions (
  id uuid primary key default gen_random_uuid(),
  -- null = platform-wide (e.g. an address that complained about any platform email)
  business_id uuid references core.businesses (id) on delete cascade,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (reason in ('unsubscribe', 'complaint', 'bounce', 'erasure', 'objection', 'manual')),
  created_at timestamptz not null default now()
);

create unique index communication_suppressions_key
  on core.communication_suppressions (coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid), email_hash);

alter table core.communication_suppressions enable row level security;
create policy "members can view their business's suppressions"
  on core.communication_suppressions for select
  using (business_id in (select core.user_business_ids()));
-- Honouring an opt-out is never permission-gated: any member can add one.
create policy "members can add suppressions for their business"
  on core.communication_suppressions for insert
  with check (business_id in (select core.user_business_ids()));
revoke update, delete on core.communication_suppressions from authenticated;

create function core.is_email_suppressed(p_business_id uuid, p_email text)
returns boolean
language plpgsql
stable
security definer
set search_path = core
as $$
begin
  if auth.uid() is not null and p_business_id not in (select core.user_business_ids()) then
    raise exception 'Not a member of business %', p_business_id using errcode = 'insufficient_privilege';
  end if;
  return exists (
    select 1 from core.communication_suppressions
    where email_hash = core.email_hash(p_email)
      and (business_id is null or business_id = p_business_id)
  );
end;
$$;

revoke execute on function core.is_email_suppressed(uuid, text) from public, anon;
grant execute on function core.is_email_suppressed(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Third-party subject erasure (core-owned data)
-- ---------------------------------------------------------------------------

create function core.erase_subject_by_email(p_business_id uuid, p_email text, p_request_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = core
as $$
declare
  v_hash text := core.email_hash(p_email);
  v_contacts integer := 0;
  v_erased integer := 0;
  v_restricted integer := 0;
  v_party record;
  v_result jsonb;
begin
  if v_hash is null then
    raise exception 'An email address is required';
  end if;
  if auth.uid() is not null and (
    p_business_id not in (select core.user_business_ids())
    or not core.has_permission(p_business_id, 'privacy.manage')
  ) then
    raise exception 'Missing privacy.manage permission' using errcode = 'insufficient_privilege';
  end if;

  delete from core.party_contacts where business_id = p_business_id and core.email_hash(email) = v_hash;
  get diagnostics v_contacts = row_count;

  for v_party in
    select p.id,
           exists (select 1 from core.documents d where d.party_id = p.id)
             or exists (select 1 from core.payments pay where pay.party_id = p.id) as has_financials
    from core.parties p
    where p.business_id = p_business_id and core.email_hash(p.email) = v_hash
  loop
    if v_party.has_financials then
      -- Restrict: keep only what the tax record legally requires (name, billing
      -- address, GSTIN); drop every other contact channel and deactivate.
      update core.parties set email = null, phone = null, is_active = false where id = v_party.id;
      delete from core.party_contacts where party_id = v_party.id;
      delete from core.addresses where party_id = v_party.id and kind <> 'billing';
      v_restricted := v_restricted + 1;
    else
      update core.parties set name = 'Erased contact', email = null, phone = null, is_active = false where id = v_party.id;
      delete from core.party_contacts where party_id = v_party.id;
      delete from core.addresses where party_id = v_party.id;
      delete from core.tax_identities where party_id = v_party.id;
      v_erased := v_erased + 1;
    end if;
  end loop;

  insert into core.communication_suppressions (business_id, email_hash, reason)
  values (p_business_id, v_hash, 'erasure')
  on conflict do nothing;

  -- Other modules erase their own copies (discovery: contacts, outreach messages).
  insert into core.domain_events (business_id, type, payload, required_module)
  values (p_business_id, 'privacy.subject_erased', jsonb_build_object('email_hash', v_hash), 'discovery');

  v_result := jsonb_build_object(
    'contacts_deleted', v_contacts, 'parties_erased', v_erased, 'parties_restricted', v_restricted
  );
  perform core.append_audit_log(p_business_id, auth.uid(), 'privacy.subject_erased', 'data_subject_request', p_request_id, null, v_result);

  if p_request_id is not null then
    update core.data_subject_requests
      set status = 'completed',
          response = format('Erased %s contact(s) and %s record(s); %s record(s) restricted and retained under tax-law retention.',
                            v_contacts, v_erased, v_restricted)
      where id = p_request_id and business_id = p_business_id;
  end if;
  return v_result;
end;
$$;

revoke execute on function core.erase_subject_by_email(uuid, text, uuid) from public, anon;
grant execute on function core.erase_subject_by_email(uuid, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Retention
-- ---------------------------------------------------------------------------

-- Every retention rule in one place (docs/compliance/gdpr-dpdp.md has the schedule and
-- the reason for each period). Service role only -- run by /api/cron/maintenance.
create function core.run_retention()
returns jsonb
language plpgsql
security definer
set search_path = core
as $$
declare
  v_domain_events integer;
  v_dsr_minimized integer;
  v_dsr_deleted integer;
begin
  delete from core.domain_events where status = 'processed' and processed_at < now() - interval '1 year';
  get diagnostics v_domain_events = row_count;

  -- The raw address on a closed request is only needed while handling it; the hash
  -- stays as evidence the request existed and was honoured.
  update core.data_subject_requests set subject_email = null
  where subject_email is not null and completed_at < now() - interval '30 days';
  get diagnostics v_dsr_minimized = row_count;

  delete from core.data_subject_requests where completed_at < now() - interval '3 years';
  get diagnostics v_dsr_deleted = row_count;

  return jsonb_build_object(
    'rate_limit_counters', core.purge_rate_limit_counters(interval '1 day'),
    'gateway_event_payloads', core.purge_gateway_event_payloads(interval '90 days'),
    'domain_events', v_domain_events,
    'dsr_emails_minimized', v_dsr_minimized,
    'dsr_deleted', v_dsr_deleted,
    'audit_log', core.purge_expired_audit_log()
  );
end;
$$;

revoke execute on function core.run_retention() from public, anon, authenticated;
grant execute on function core.run_retention() to service_role;
