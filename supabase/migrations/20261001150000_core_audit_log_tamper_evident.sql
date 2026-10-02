-- SEC-6: make core.audit_log tamper-evident and append-only.
--
-- SEC-2 (20261001090000) stopped users *forging* entries through the write functions.
-- Nothing yet stopped a privileged path from *changing or removing* entries afterwards:
-- the service role (BYPASSRLS) and the table owner could UPDATE or DELETE audit rows,
-- and a business deletion cascaded its whole audit trail away. For financial records
-- that is the opposite of what an audit trail is for (SOX s.802; GST record keeping).
--
-- 1. Hash chain. Every row gets a per-business `seq` and a SHA-256 `row_hash` computed
--    over its content plus the previous row's hash (`prev_hash`). An altered, deleted or
--    reordered entry breaks the chain, and core.verify_audit_chain() reports where.
--    The chain is computed by a BEFORE INSERT trigger, so every write path is covered --
--    write_audit_log(), append_audit_log(), triggers, and service-role inserts such as
--    CRM's channel-connection audit (module-crm channel-connections/mutations.ts).
--    created_at is forced to the transaction time, so an entry can't be backdated.
--    Concurrent writers to one business serialize on a per-business advisory lock.
-- 2. Append-only. UPDATE, DELETE and TRUNCATE are rejected by trigger for every role,
--    service_role and the owner included (BYPASSRLS skips policies, not triggers). The
--    one sanctioned delete is core.purge_expired_audit_log(), and only for rows older than
--    the 8-year retention floor.
-- 3. The trail outlives its business. The business_id FK (ON DELETE CASCADE) is dropped:
--    deleting a business (e.g. the E2E fixture teardown deleting test accounts,
--    apps/web/e2e/support/tenants.ts) must not erase the evidence of what happened in it,
--    and the cascade would now be refused anyway. Orphaned rows stay invisible to users
--    (the select policy resolves through core.user_business_ids()), and the deletion
--    itself is recorded as a final 'business.deleted' entry.
--
-- Read access is unchanged: any member can read their business's log, as before.
-- Verification follows the same rule -- it only recomputes hashes over rows the caller
-- can already read.

alter table core.audit_log drop constraint audit_log_business_id_fkey;
alter table core.audit_log add column seq bigint;
alter table core.audit_log add column prev_hash text;
alter table core.audit_log add column row_hash text;

-- Canonical serialization of every audited field: jsonb::text is canonical (key order
-- and whitespace normalized), and the timestamp is rendered in UTC to the microsecond.
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

-- Backfill the chain for every existing row, per business, in (created_at, id) order.
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

-- Walks one business's chain in seq order. Reports the first broken entry: a hash that
-- doesn't match its content (altered), a prev_hash that doesn't match the previous row
-- (removed or reordered), or a gap in seq (removed). The first surviving row's
-- prev_hash is taken as given, since the retention purge legitimately removes the
-- oldest rows. Limitation: removing the *newest* entries can't be detected from inside
-- the chain -- anchor (business_id, max(seq), row_hash) outside the database for that.
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
  if auth.uid() is not null
     and not exists (select 1 from core.user_business_ids() as b(id) where b.id = p_business_id) then
    raise exception 'Not a member of this business.' using errcode = '42501';
  end if;

  for r in select * from core.audit_log where business_id = p_business_id order by seq loop
    v_count := v_count + 1;
    if v_prev_seq is not null and r.seq <> v_prev_seq + 1 then
      return query select false, v_count, r.seq, 'sequence gap: an entry is missing'::text;
      return;
    end if;
    if v_prev_hash is not null and r.prev_hash <> v_prev_hash then
      return query select false, v_count, r.seq, 'chain broken: an earlier entry was altered or removed'::text;
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
