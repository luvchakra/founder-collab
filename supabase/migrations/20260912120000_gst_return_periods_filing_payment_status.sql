-- COMPLY-P0-07.7 (Filing/Payment Status): records the ACTUAL, human-reported outcome of
-- an already-authorized filing action (COMPLY-P0-07.5's own `markReturnPeriodFiled`) and,
-- separately, the tax payment associated with it -- never a live status FETCH, since this
-- backlog has no GSTN return-filing/payment API adapter (unlike e-invoice/e-way-bill's own
-- real IRP/GSP HTTP adapters, COMPLY-P0-05.3/06.3) -- exactly the same "record what a
-- human already did, never claim or infer it" posture `markReturnPeriodFiled` itself
-- already established (backlog rule 11).
--
-- Researched via web search (backlog rule 6), not assumed from memory: ClearTax's,
-- Bajaj Finserv's, and Saral's own GST-terminology guides confirm ARN (Acknowledgement/
-- Application Reference Number) is the number the GST Portal generates on successful
-- submission of a return (GSTR-3B guides describe it as generated the moment DSC/EVC
-- verification completes filing -- "filing is complete only after the ARN is generated");
-- CIN (Challan Identification Number, 17 digits) is the receipt issued by the collecting
-- bank once a tax payment is actually realized, distinct from CPIN (Common Portal
-- Identification Number, 14 digits, generated when the challan is first CREATED, before
-- payment) -- this table only needs the POST-payment CIN, not the pre-payment CPIN, since
-- it is recording a completed payment's own receipt, not tracking an in-progress challan.
--
-- **Columns added to the EXISTING `gst.return_periods` table (COMPLY-P0-07.5), not a new
-- table**: this is squarely "more facts about the SAME return period," the exact case
-- COMPLY-P0-07.6's own migration comment anticipated ("COMPLY-P0-07.7 ... will need to
-- record an ARN/payment reference/government-response metadata onto an already-'filed'
-- period ... whatever columns that story adds are untouched by [the lock] trigger unless
-- THAT story's own migration explicitly extends the check").
--   - `filing_reference` -- the ARN. Nullable (a period can be marked filed before its own
--     ARN is typed in, e.g. moments after DSC/EVC submission while the confirmation page is
--     still loading) but non-blank when present.
--   - `filed_at` -- WHEN the filing was recorded, as its own queryable column rather than
--     something only recoverable by parsing `status_history`'s own jsonb array (e.g. "which
--     periods were filed in the last 30 days" needs a real column, not a jsonb scan).
--   - `payment_status` -- `not_applicable` (the correct default for every return type: a
--     GSTR-1 or GSTR-9 period, by real GST practice, carries no tax-payment obligation of
--     its own -- the actual cash/credit-ledger payment happens against GSTR-3B, confirmed
--     by this session's own GSTR-3B research already on file in that return's own
--     `queries.ts` docstring), `pending`, or `paid`.
--   - `payment_reference` -- the CIN. Nullable, non-blank when present.
--   - `payment_amount` -- nullable, non-negative when present.
--   - `payment_date` -- nullable.
--
-- **Locking extended, not re-invented**: `gst.enforce_return_period_lock()` (created by
-- COMPLY-P0-07.6) is replaced here (`create or replace function`, same object, not a new
-- one) with two more rules, both following that story's own "protect a SETTLED fact, not
-- an in-progress one" philosophy:
--   1. Once a filed period's own `filing_reference`/`filed_at` are actually ON FILE (not
--      null), they can never be silently rewritten -- but a still-NULL value may be filled
--      in later (a period can legitimately be marked `'filed'` before its own ARN is typed
--      in, then have it attached moments afterward via a separate call once available; it
--      is `old.filing_reference/filed_at is not null`, not `old.status = 'filed'` alone,
--      that distinguishes "settling a recorded fact" from "attaching one for the first
--      time").
--   2. Once `payment_status = 'paid'`, that payment's own `payment_status`/
--      `payment_reference`/`payment_amount`/`payment_date` are all locked -- a completed
--      payment is a settled fact, exactly like an approved/filed return's own content.
--      `not_applicable` and `pending` remain freely editable (correcting a misclassified
--      payment status, or fixing a typo'd amount before marking it paid, must keep
--      working).

alter table gst.return_periods
  add column filing_reference text check (filing_reference is null or length(trim(filing_reference)) > 0),
  add column filed_at timestamptz,
  add column payment_status text not null default 'not_applicable' check (payment_status in ('not_applicable', 'pending', 'paid')),
  add column payment_reference text check (payment_reference is null or length(trim(payment_reference)) > 0),
  add column payment_amount numeric check (payment_amount is null or payment_amount >= 0),
  add column payment_date date;

create or replace function gst.enforce_return_period_lock()
returns trigger language plpgsql set search_path = gst as $$
begin
  if old.status in ('approved', 'filed') then
    if new.business_id is distinct from old.business_id
      or new.return_type is distinct from old.return_type
      or new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end
      or new.snapshot is distinct from old.snapshot
      or new.created_at is distinct from old.created_at
    then
      raise exception 'This return period is already % -- its own business/return type/period/snapshot can never be altered once approved. Prepare a new period instead.', old.status;
    end if;
  end if;

  if old.status = 'approved' and new.status is distinct from 'approved' and new.status is distinct from 'filed' then
    raise exception 'An approved return period can only advance to "filed" -- it cannot move to "%".', new.status;
  end if;

  if old.status = 'filed' and new.status is distinct from 'filed' then
    raise exception 'A filed return period''s status can never change -- "filed" is this pipeline''s own terminal stage.';
  end if;

  -- COMPLY-P0-07.7: once a filing reference/date is actually ON FILE (not null), it is a
  -- settled historical fact and can never be silently rewritten -- but a NULL value may
  -- still be filled in later (a period can legitimately be marked 'filed' before its own
  -- ARN is typed in, then have it attached moments afterward via a separate call once
  -- available -- `old.filing_reference is not null` is what distinguishes "settling a
  -- recorded fact" from "attaching one for the first time," not `old.status = 'filed'`
  -- alone, which would otherwise also block that legitimate first-time attachment).
  if old.status = 'filed' and old.filing_reference is not null and new.filing_reference is distinct from old.filing_reference then
    raise exception 'A filed return period''s own filing reference can never be altered once recorded.';
  end if;
  if old.status = 'filed' and old.filed_at is not null and new.filed_at is distinct from old.filed_at then
    raise exception 'A filed return period''s own filed date can never be altered once recorded.';
  end if;

  -- COMPLY-P0-07.7: a payment already marked 'paid' is settled -- its own status/
  -- reference/amount/date can never be silently rewritten. 'not_applicable' and 'pending'
  -- remain freely editable.
  if old.payment_status = 'paid' then
    if new.payment_status is distinct from 'paid'
      or new.payment_reference is distinct from old.payment_reference
      or new.payment_amount is distinct from old.payment_amount
      or new.payment_date is distinct from old.payment_date
    then
      raise exception 'A payment already marked "paid" can never be altered -- its own status/reference/amount/date are locked.';
    end if;
  end if;

  return new;
end;
$$;
