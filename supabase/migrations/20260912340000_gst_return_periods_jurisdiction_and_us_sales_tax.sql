-- WonderArc Compliance backlog, COMPLY-P1-02.7 (United States -- Sales Tax Returns/
-- Remittance). This run's own explicit instruction: "reuse the generic return-preparation/
-- drill-down/lifecycle machinery Epic 07 already built for India ... rather than rebuilding
-- it for the US." Checked `gst.return_periods` (COMPLY-P0-07.5/07.6/07.7) first -- its own
-- Draft->Validate->Review->Approve->File lifecycle, its snapshot-required-once-validated
-- guarantee, and its database-level lock are all completely regime-agnostic already (nothing
-- in the table or its own lock trigger mentions GSTR/India by name) -- reusable as-is,
-- almost. The one real gap: `unique(business_id, return_type, period_start, period_end)`
-- has NO jurisdiction concept, because a GSTR-1/3B/9 filing is national (India has no
-- state-level GST return). A US sales tax return is fundamentally different: a business
-- files a SEPARATE return PER STATE it holds a registration in, for the SAME period (a
-- California return and a Texas return for the same month are two different filings, not
-- one). Reusing this table WITHOUT fixing that gap would silently collide two different
-- states' own returns for the same period into one row.
--
-- **Extending the existing table, not creating a parallel one** (backlog rule 1/5, and
-- this run's own explicit "reuse the generic machinery" instruction): adds a nullable
-- `jurisdiction` column (`null` for every existing/future NATIONAL return type -- GSTR-1/
-- 3B/9, and any future country's own national return -- exactly the same "null = no
-- sub-national jurisdiction concept" convention `gst.tax_rules.jurisdiction`/
-- `gst.tax_registrations.jurisdiction` already established), widens the unique constraint
-- to `(business_id, return_type, jurisdiction, period_start, period_end)`, and extends
-- `return_type`'s own check constraint with one new value, `us_sales_tax`. No new
-- lifecycle states, no new columns beyond `jurisdiction` itself -- everything else
-- (`lib/returns/lifecycle/{transitions,queries,mutations}.ts`) already works unchanged for
-- any `return_type`/`jurisdiction` combination, since none of that code ever branches on
-- the return type's own identity.
--
-- **Lock trigger extended to protect `jurisdiction` too** (COMPLY-P0-07.6's own "protect a
-- SETTLED fact" rule, mechanically extended to the one new defining-identity column this
-- story adds) -- once approved/filed, a period's own state can never silently change any
-- more than its own return_type/period dates can.

alter table gst.return_periods
  add column jurisdiction text check (jurisdiction is null or jurisdiction ~ '^[A-Z]{2}$');

alter table gst.return_periods
  drop constraint return_periods_business_id_return_type_period_start_period__key,
  add constraint return_periods_business_id_return_type_jurisdiction_period_key
    unique (business_id, return_type, jurisdiction, period_start, period_end);

alter table gst.return_periods
  drop constraint return_periods_return_type_check,
  add constraint return_periods_return_type_check
    check (return_type in ('gstr1', 'gstr3b', 'gstr9', 'us_sales_tax'));

-- A real, cheap, worthwhile structural guarantee, not left to application code alone: a
-- `us_sales_tax` period ALWAYS names the state it's for (there is no such thing as a
-- national US sales tax return); every other (national) return type NEVER does.
alter table gst.return_periods
  add constraint return_periods_us_sales_tax_requires_jurisdiction
    check ((return_type = 'us_sales_tax') = (jurisdiction is not null));

create or replace function gst.enforce_return_period_lock()
returns trigger language plpgsql set search_path = gst as $$
begin
  if old.status in ('approved', 'filed') then
    if new.business_id is distinct from old.business_id
      or new.return_type is distinct from old.return_type
      or new.jurisdiction is distinct from old.jurisdiction
      or new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end
      or new.snapshot is distinct from old.snapshot
      or new.created_at is distinct from old.created_at
    then
      raise exception 'This return period is already % -- its own business/return type/jurisdiction/period/snapshot can never be altered once approved. Prepare a new period instead.', old.status;
    end if;
  end if;

  if old.status = 'approved' and new.status is distinct from 'approved' and new.status is distinct from 'filed' then
    raise exception 'An approved return period can only advance to "filed" -- it cannot move to "%".', new.status;
  end if;

  if old.status = 'filed' and new.status is distinct from 'filed' then
    raise exception 'A filed return period''s status can never change -- "filed" is this pipeline''s own terminal stage.';
  end if;

  if old.status = 'filed' and old.filing_reference is not null and new.filing_reference is distinct from old.filing_reference then
    raise exception 'A filed return period''s own filing reference can never be altered once recorded.';
  end if;
  if old.status = 'filed' and old.filed_at is not null and new.filed_at is distinct from old.filed_at then
    raise exception 'A filed return period''s own filed date can never be altered once recorded.';
  end if;

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
