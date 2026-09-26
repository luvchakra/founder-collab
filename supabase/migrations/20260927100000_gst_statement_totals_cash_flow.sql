-- FIN-5 (cash flow statement, §28) and the balance-sheet fix it exposed. Two read-only
-- aggregation functions; no table is created, so nothing here needs the entity-ownership
-- check -- both only read `gst.accounts`, `gst.journal_entries`, `gst.journal_lines`,
-- `gst.account_mappings` and `gst.bank_accounts`.
--
-- Aggregated in SQL for the reason `gst.account_period_totals` already documents: summing
-- fetched lines in application code hits PostgREST's page cap, and a statement that is
-- quietly short is worse than one that fails.
--
-- SECURITY INVOKER (the default) on both: RLS on the underlying gst tables decides what the
-- caller sees -- tenant AND licensed -- exactly as a direct query would. Neither may become
-- a way around tenant isolation or the licence gate.
--
-- Posted and reversed entries both count (a reversed entry still happened; its reversal is
-- what offsets it), drafts never do -- the same rule as every other ledger aggregate here.

-- ---------------------------------------------------------------------------
-- Per-account totals for a period AND as at its end, in one read
-- ---------------------------------------------------------------------------

-- Why "as at": the balance sheet was being built from the same period totals as the profit
-- and loss, so a balance sheet for "this month" showed each account's opening balance plus
-- only this month's movement -- the bank balance ignored every earlier month. A balance
-- sheet is a position at a date, not activity in a range. Returning both readings from one
-- statement (rather than two calls) keeps the three statements from disagreeing because a
-- posting landed between two reads.
--
-- `is_cash` marks the accounts the cash flow statement treats as cash: whatever the
-- business maps to the `bank`/`cash` posting roles, plus any ledger account a bank account
-- is linked to. Derived here, from the same two places the rest of Finance already reads,
-- rather than stored as a flag that could drift from them.
create function gst.account_statement_totals(
  p_business_id uuid,
  p_from date,
  p_to date
)
returns table (
  account_id uuid,
  account_number text,
  name text,
  type text,
  subtype text,
  debit numeric,
  credit numeric,
  debit_to_date numeric,
  credit_to_date numeric,
  opening_balance numeric,
  is_cash boolean
)
language sql
stable
set search_path = gst
as $$
  select
    a.id,
    a.account_number,
    a.name,
    a.type,
    a.subtype,
    coalesce(sum(case when e.id is not null and (p_from is null or e.posting_date >= p_from) then l.debit end), 0),
    coalesce(sum(case when e.id is not null and (p_from is null or e.posting_date >= p_from) then l.credit end), 0),
    coalesce(sum(case when e.id is not null then l.debit end), 0),
    coalesce(sum(case when e.id is not null then l.credit end), 0),
    a.opening_balance,
    (
      exists (
        select 1 from gst.account_mappings m
        where m.business_id = p_business_id and m.account_id = a.id and m.role_key in ('bank', 'cash')
      )
      or exists (
        select 1 from gst.bank_accounts b
        where b.business_id = p_business_id and b.ledger_account_id = a.id
      )
    )
  from gst.accounts a
  left join gst.journal_lines l on l.account_id = a.id
  left join gst.journal_entries e
    on e.id = l.entry_id
   and e.status in ('posted', 'reversed')
   and (p_to is null or e.posting_date <= p_to)
  where a.business_id = p_business_id
  group by a.id, a.account_number, a.name, a.type, a.subtype, a.opening_balance
  order by a.account_number;
$$;

revoke all on function gst.account_statement_totals(uuid, date, date) from public, anon;
grant execute on function gst.account_statement_totals(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Cash flow, attributed to the account on the other side
-- ---------------------------------------------------------------------------

-- The direct method, read straight off the ledger: for every entry in the period that
-- touches a cash account, each of its NON-cash lines is the reason cash moved, and
-- credit - debit on that line is how much. For a balanced entry those amounts add up to
-- exactly the entry's net movement in cash, whatever the entry's shape -- a sale paid on
-- the spot, a bill part-paid, an expense with input GST -- so the statement reconciles to
-- the change in cash by construction, not by a plug figure. An entry moving money between
-- two cash accounts has no non-cash line and correctly contributes nothing.
--
-- Grouped per counter account; which activity (operating/investing/financing) an account
-- belongs to is decided in the application (`lib/accounting/reports.ts#cashFlowActivity`),
-- where it can be tested.
create function gst.cash_flow_totals(
  p_business_id uuid,
  p_from date,
  p_to date
)
returns table (
  account_id uuid,
  account_number text,
  name text,
  type text,
  subtype text,
  amount numeric
)
language sql
stable
set search_path = gst
as $$
  with cash_accounts as (
    select m.account_id from gst.account_mappings m
    where m.business_id = p_business_id and m.role_key in ('bank', 'cash')
    union
    select b.ledger_account_id from gst.bank_accounts b
    where b.business_id = p_business_id and b.ledger_account_id is not null
  ),
  cash_entries as (
    select distinct e.id
    from gst.journal_entries e
    join gst.journal_lines l on l.entry_id = e.id
    where e.business_id = p_business_id
      and e.status in ('posted', 'reversed')
      and (p_from is null or e.posting_date >= p_from)
      and (p_to is null or e.posting_date <= p_to)
      and l.account_id in (select account_id from cash_accounts)
  )
  select a.id, a.account_number, a.name, a.type, a.subtype, sum(l.credit - l.debit)
  from gst.journal_lines l
  join cash_entries c on c.id = l.entry_id
  join gst.accounts a on a.id = l.account_id
  where l.account_id not in (select account_id from cash_accounts)
  group by a.id, a.account_number, a.name, a.type, a.subtype
  having sum(l.credit - l.debit) <> 0
  order by a.account_number;
$$;

revoke all on function gst.cash_flow_totals(uuid, date, date) from public, anon;
grant execute on function gst.cash_flow_totals(uuid, date, date) to authenticated;
