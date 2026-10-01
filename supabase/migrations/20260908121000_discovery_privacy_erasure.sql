-- GDPR Art. 17 / DPDP s.12 erasure for the discovery module's own copies of a person's
-- data. Called by discovery's handler for the core `privacy.subject_erased` domain event
-- (20260908120000_core_privacy.sql publishes it from core.erase_subject_by_email()) --
-- core never touches the discovery schema itself (ADR-5); this module erases its own.
--
-- Matching is by email hash, scoped to every workspace of the business that received the
-- erasure request: outreach messages and conversations with the person are deleted along
-- with the contact (the FKs would otherwise only null contact_id and keep the content
-- addressed to them), and a prospect company email that is the person's own address is
-- cleared. Service role only -- the domain-event drain runs without a user session.

create function discovery.erase_subject_by_email_hash(p_business_id uuid, p_email_hash text)
returns integer
language plpgsql
security definer
set search_path = discovery
as $$
declare
  v_contact_ids uuid[];
  v_count integer;
begin
  if p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid email hash';
  end if;

  select coalesce(array_agg(c.id), '{}') into v_contact_ids
  from discovery.contacts c
  join discovery.workspaces w on w.id = c.workspace_id
  join discovery.products p on p.id = w.product_id
  where p.business_id = p_business_id and core.email_hash(c.email) = p_email_hash;

  delete from discovery.messages where contact_id = any (v_contact_ids);
  delete from discovery.conversations where contact_id = any (v_contact_ids);
  delete from discovery.contacts where id = any (v_contact_ids);
  v_count := cardinality(v_contact_ids);

  update discovery.prospects pr set company_email = null
  from discovery.workspaces w, discovery.products p
  where pr.workspace_id = w.id and w.product_id = p.id
    and p.business_id = p_business_id and core.email_hash(pr.company_email) = p_email_hash;

  return v_count;
end;
$$;

revoke execute on function discovery.erase_subject_by_email_hash(uuid, text) from public, anon, authenticated;
grant execute on function discovery.erase_subject_by_email_hash(uuid, text) to service_role;
