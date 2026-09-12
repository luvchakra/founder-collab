-- WonderArc Compliance backlog, COMPLY-P1-03.4/03.5 (Canada -- Filing Periods, CRA Filing
-- Adapter). Same reuse instruction and precedent as COMPLY-P1-02.7's own widening of this
-- table for `us_sales_tax`: extends `return_type`'s own check constraint with one new
-- value, `ca_gst_hst`. Unlike `us_sales_tax`, this needs NO jurisdiction change at all --
-- Canada's own GST/HST return is ONE federal filing per period regardless of how many
-- provinces a business sold into (CRA reallocates the harmonized provincial share
-- internally, not the filer's own job), so `ca_gst_hst` periods keep `jurisdiction = null`,
-- the same "national return" shape GSTR-1/3B/9 already use -- `return_periods_us_sales_tax_
-- requires_jurisdiction`'s own check (`(return_type = 'us_sales_tax') = (jurisdiction is
-- not null)`) already permits this without any change, since it only constrains
-- `us_sales_tax` specifically.

alter table gst.return_periods
  drop constraint return_periods_return_type_check,
  add constraint return_periods_return_type_check
    check (return_type in ('gstr1', 'gstr3b', 'gstr9', 'us_sales_tax', 'ca_gst_hst'));
