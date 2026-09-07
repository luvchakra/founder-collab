-- Epic 3, story D-3: bridge discovery.prospects into the core.parties model (D-1) --
-- 00-MASTER-PLAN.md §5: "A discovery prospect and an FSM customer are the same
-- core.parties row with two party_roles. Winning a prospect adds the customer role; it
-- does not copy a record." Before this, a prospect was purely a discovery.prospects row
-- with no link into core at all.
--
-- `party_id` is nullable: a prospect created before this migration ships has none until
-- the backfill below runs, and the column stays nullable afterwards rather than NOT NULL
-- because discovery must keep working even if a future core.parties row is deleted out
-- from under a prospect (ON DELETE SET NULL, not CASCADE -- losing the link shouldn't
-- take the prospect down with it).
alter table discovery.prospects
  add column party_id uuid references core.parties (id) on delete set null;

create index prospects_party_id_idx on discovery.prospects (party_id);

-- Idempotent, re-runnable backfill: only ever touches rows where party_id is still null,
-- so running this migration file twice (or a future re-run of just this block, e.g. after
-- restoring a backup that predates it) is a no-op for anything already linked.
--
-- Rollback note: this is purely additive (new column, new core.parties/party_roles/
-- party_contacts rows) -- nothing existing is modified or deleted. To roll back:
--   1. `alter table discovery.prospects drop column party_id;`
--   2. optionally delete the core.parties rows this created (identifiable as those whose
--      only role is 'prospect' and whose id no longer appears in discovery.prospects.party_id
--      once step 1 runs) -- safe to skip, since nothing else references them once the
--      column above is gone; they're simply orphaned, not dangling in a way that breaks
--      anything.
-- Going forward (after this ships), discovery's own mutations create the linked
-- core.parties/party_roles row at prospect-creation time instead of relying on a
-- backfill -- see packages/module-discovery/src/lib/prospects/party-sync.ts.
do $$
declare
  r record;
  v_party_id uuid;
begin
  for r in
    select
      p.id as prospect_id,
      p.company_name,
      p.company_email,
      p.outcome,
      b.id as business_id
    from discovery.prospects p
    join discovery.workspaces w on w.id = p.workspace_id
    join discovery.products pr on pr.id = w.product_id
    join core.businesses b on b.id = pr.business_id
    where p.party_id is null
  loop
    insert into core.parties (business_id, kind, name, email)
    values (r.business_id, 'company', r.company_name, r.company_email)
    returning id into v_party_id;

    insert into core.party_roles (business_id, party_id, role)
    values (r.business_id, v_party_id, 'prospect');

    -- A prospect already won before this migration shipped is already a customer in
    -- every sense that matters -- the party model should reflect that from the start
    -- rather than waiting for some future outcome change that may never come.
    if r.outcome = 'won' then
      insert into core.party_roles (business_id, party_id, role)
      values (r.business_id, v_party_id, 'customer');
    end if;

    insert into core.party_contacts (
      business_id, party_id, first_name, last_name, job_title, email, phone,
      linkedin_url, status
    )
    select
      r.business_id, v_party_id, c.first_name, c.last_name, c.job_title, c.email,
      c.phone, c.linkedin_url, c.status
    from discovery.contacts c
    where c.prospect_id = r.prospect_id;

    update discovery.prospects set party_id = v_party_id where id = r.prospect_id;
  end loop;
end $$;
