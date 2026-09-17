-- Per-account debit and credit totals for a date range — the input every financial
-- statement is derived from.
--
-- Aggregated in SQL rather than by fetching lines and summing them in application code,
-- for one specific reason: PostgREST caps a plain select at a default page size, so a
-- business with more journal lines than that page would have got a trial balance that
-- was quietly short, and a financial statement that is quietly wrong is worse than one
-- that fails outright. Grouping here means the answer is always the whole ledger.
--
-- SECURITY INVOKER (the default): RLS on `gst.journal_lines`/`gst.journal_entries`
-- decides what the caller can see, exactly as it would for a direct query. This must not
-- become a way around tenant isolation or the licence gate.
--
-- Posted and reversed entries both count, for the reason `gst.account_balances` already
-- documents: a reversed entry still happened, and its reversal is what offsets it. A
-- draft is not in the ledger yet.

create function gst.account_period_totals(
  p_business_id uuid,
  p_from date default null,
  p_to date default null
)
returns table (
  account_id uuid,
  account_number text,
  name text,
  type text,
  debit numeric,
  credit numeric,
  opening_balance numeric
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
    coalesce(sum(case when e.status in ('posted', 'reversed') then l.debit else 0 end), 0),
    coalesce(sum(case when e.status in ('posted', 'reversed') then l.credit else 0 end), 0),
    a.opening_balance
  from gst.accounts a
  left join gst.journal_lines l on l.account_id = a.id
  left join gst.journal_entries e
    on e.id = l.entry_id
   and (p_from is null or e.posting_date >= p_from)
   and (p_to is null or e.posting_date <= p_to)
  where a.business_id = p_business_id
  group by a.id, a.account_number, a.name, a.type, a.opening_balance
  order by a.account_number;
$$;

revoke all on function gst.account_period_totals(uuid, date, date) from public, anon;
grant execute on function gst.account_period_totals(uuid, date, date) to authenticated;
