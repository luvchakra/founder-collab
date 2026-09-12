-- WonderArc Compliance backlog, COMPLY-P1-04.2 (Singapore -- GST F5). Same reuse
-- instruction and precedent as COMPLY-P1-02.7's own widening of this table for
-- `us_sales_tax` and COMPLY-P1-03.4's own widening for `ca_gst_hst`: extends
-- `return_type`'s own check constraint with one new value, `sg_gst_f5`. Needs NO
-- jurisdiction change at all -- Singapore has exactly one nationwide GST return (myTax
-- Portal's own GST F5 form), no sub-national jurisdiction concept whatsoever, so
-- `sg_gst_f5` periods keep `jurisdiction = null`, the same "national return" shape
-- GSTR-1/3B/9 and `ca_gst_hst` already use -- `return_periods_us_sales_tax_requires_
-- jurisdiction`'s own check (`(return_type = 'us_sales_tax') = (jurisdiction is not
-- null)`) already permits this without any change, since it only constrains
-- `us_sales_tax` specifically.

alter table gst.return_periods
  drop constraint return_periods_return_type_check,
  add constraint return_periods_return_type_check
    check (return_type in ('gstr1', 'gstr3b', 'gstr9', 'us_sales_tax', 'ca_gst_hst', 'sg_gst_f5'));
