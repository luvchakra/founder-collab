-- PRIV-1: an opt-out from a business's outreach email is honoured, and is one click.
--
-- Discovery sends cold outreach to prospects (module-discovery lib/messages/send.ts) and
-- investor emails (lib/funding/outreach-send.ts) with no way for a recipient to say
-- "stop" short of replying, and nothing that stopped the next send if they did. Direct
-- marketing must stop on objection (GDPR Art. 21(2)-(3)); consent must be as easy to
-- withdraw as to give (DPDP Act s.6(4)); bulk senders need RFC 8058 one-click
-- unsubscribe (Gmail/Yahoo sender requirements).
--
-- core.communication_suppressions holds, per business, the addresses that must not be
-- emailed again. Only a SHA-256 of the normalised address is stored, never the address:
-- an opt-out has to outlive an erasure of everything else about the person, and a hash
-- is enough to match against without keeping their data.
--
-- Rows are added by the public /api/unsubscribe endpoint (service role, authorised by a
-- signed token carrying the business id and this same hash) or by a member recording an
-- opt-out by hand. Nobody updates or deletes them: re-subscribing someone is a new,
-- separately evidenced consent, not undoing an opt-out.

create function core.email_hash(p_email text)
returns text
language sql
immutable
set search_path = core
as $$
  select encode(sha256(convert_to(lower(trim(p_email)), 'UTF8')), 'hex');
$$;

create table core.communication_suppressions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (reason in ('unsubscribe', 'complaint', 'bounce', 'manual')),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (business_id, email_hash)
);

alter table core.communication_suppressions enable row level security;

create policy "members can view their business's suppressions"
  on core.communication_suppressions for select
  using (business_id in (select core.user_business_ids()));
create policy "members can record an opt-out for their business"
  on core.communication_suppressions for insert
  with check (business_id in (select core.user_write_business_ids()) and created_by = auth.uid());

-- Insert-only for everyone: explicit revokes, so an attempt fails loudly rather than
-- matching zero rows under RLS (default privileges would otherwise grant them).
revoke all on core.communication_suppressions from anon, authenticated, service_role;
grant select, insert on core.communication_suppressions to authenticated, service_role;

-- Checked before every outreach send. Membership is re-checked so it can't be used to
-- probe whether an address opted out of another business's mail.
create function core.is_email_suppressed(p_business_id uuid, p_email text)
returns boolean
language plpgsql
stable
security definer
set search_path = core
as $$
begin
  if auth.uid() is not null
     and not exists (select 1 from core.user_business_ids() as b(id) where b.id = p_business_id) then
    raise exception 'Not a member of this business.' using errcode = '42501';
  end if;
  return exists (
    select 1 from core.communication_suppressions
    where business_id = p_business_id and email_hash = core.email_hash(p_email)
  );
end;
$$;

revoke execute on function core.is_email_suppressed(uuid, text) from public, anon;
grant execute on function core.is_email_suppressed(uuid, text) to authenticated, service_role;
