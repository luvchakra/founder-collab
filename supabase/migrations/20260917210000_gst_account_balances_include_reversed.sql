-- A reversed entry still happened.
--
-- `gst.account_balances` (20260917200000) counted only entries with status 'posted'.
-- `reverseJournalEntry` writes a reversing entry and marks the original 'reversed', so
-- under that view the original dropped out of the balance while its reversal stayed in:
-- reversing a 1,180 invoice moved Accounts Receivable to -1,180 instead of 0. Verified
-- against the dev database before this fix, in a transaction that rolled back.
--
-- 'reversed' is a label meaning "posted, and since offset by a reversing entry", not
-- "never happened" -- the offsetting is what the reversal itself does, line for line. So
-- both halves count, and the pair nets to nothing, which is the entire point of
-- correcting by reversal rather than by editing history.
--
-- 'draft' still doesn't count: a draft is explicitly not in the ledger yet, and is
-- allowed to be unbalanced while it is being built.

create or replace view gst.account_balances as
  select
    a.id as account_id,
    a.business_id,
    a.account_number,
    a.name,
    a.type,
    a.opening_balance
      + coalesce(sum(
          case when e.status in ('posted', 'reversed') then
            case when a.type in ('asset', 'expense', 'cogs')
                 then l.debit - l.credit
                 else l.credit - l.debit end
          else 0 end), 0) as balance
  from gst.accounts a
  left join gst.journal_lines l on l.account_id = a.id
  left join gst.journal_entries e on e.id = l.entry_id
  group by a.id, a.business_id, a.account_number, a.name, a.type, a.opening_balance;
