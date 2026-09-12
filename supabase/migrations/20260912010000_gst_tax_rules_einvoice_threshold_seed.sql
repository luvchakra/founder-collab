-- WonderArc Compliance backlog, COMPLY-P0-05.1 (E-Invoice Eligibility): "Determine
-- obligation using active rules." Populates `gst.tax_rules` with the aggregate-turnover
-- threshold that actually decides whether a business is OBLIGATED to generate e-invoices
-- at all -- as a real, versioned, source-cited lineage, following the exact same
-- data-only-migration-seed precedent COMPLY-P0-04.7 established
-- (20260912000000_gst_tax_rules_india_rate_slabs_seed.sql) for the rate-slab rule.
--
-- Researched via web search before writing (backlog rule 6, "country rules must be
-- versioned and source-referenced" -- the same discipline COMPLY-P0-04.7 followed), not
-- assumed from memory:
--
-- Version 1 -- turnover threshold lowered to ₹10 crore (Notification No. 17/2022-Central
-- Tax, dated 01-Aug-2022), effective 01-Oct-2022. Earlier phases of this same threshold
-- (₹500cr from Oct-2020, then ₹100cr/₹50cr/₹20cr through 2021-2022) are real but not
-- modeled here -- no current or recent determination in this platform needs them, and
-- adding their exact dates without the same verification would be exactly the "no false
-- precision" this module has avoided since COMPLY-P0-04.3/04.4. Extend this lineage with
-- earlier versions later if a real need for that history ever appears.
--
-- Version 2 -- turnover threshold lowered again to ₹5 crore (Notification No. 10/2023-
-- Central Tax, dated 10-May-2023), effective 01-Aug-2023 -- the version in effect as of
-- this migration's own creation date (2026-09-12) and still the CURRENT threshold as
-- confirmed by the same search (no further lowering found).
--
-- `rule_key = 'einvoice_turnover_threshold_inr'` -- `value.thresholdInr` is a plain
-- integer (rupees, not crores/lakhs) so `lib/einvoice-eligibility/threshold.ts` never has
-- to parse a unit suffix. `treatment` is null on both rows -- this rule is an obligation
-- threshold, not a supply's tax treatment classification.
--
-- Both rows' own `source` text carries the same "verify against the current, authoritative
-- CBIC notification before relying on this for a production filing/obligation decision --
-- this is reference content, not tax advice" caveat COMPLY-P0-04.7's own seed uses
-- (backlog rule 11/12). Note also (documented in `lib/einvoice-eligibility/determine.ts`,
-- not here): real GST law tests whether a business's aggregate turnover EVER exceeded the
-- then-applicable threshold in any financial year since 2017-18 -- once crossed, the
-- obligation is permanent even if turnover later falls. This rule only stores the
-- threshold AMOUNT for a given date; the "ever crossed, stays mandatory" logic lives in
-- application code, not this row.

insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, effective_to, source, treatment) values
  (
    'IN', null, 'GST', 'einvoice_turnover_threshold_inr',
    '{"thresholdInr": 100000000, "label": "e-Invoice mandatory above ₹10 crore aggregate turnover"}'::jsonb,
    1, '2022-10-01', '2023-08-01',
    'CBIC Notification No. 17/2022-Central Tax, dated 01-Aug-2022, lowering the e-invoice turnover threshold to ₹10 crore effective 01-Oct-2022. Verify against the current, authoritative CBIC notification before relying on this for a production obligation decision -- this is reference content, not tax advice.',
    null
  ),
  (
    'IN', null, 'GST', 'einvoice_turnover_threshold_inr',
    '{"thresholdInr": 50000000, "label": "e-Invoice mandatory above ₹5 crore aggregate turnover"}'::jsonb,
    2, '2023-08-01', null,
    'CBIC Notification No. 10/2023-Central Tax, dated 10-May-2023, lowering the e-invoice turnover threshold to ₹5 crore effective 01-Aug-2023 -- the threshold still in effect as of this row''s own creation. Verify against the current, authoritative CBIC notification before relying on this for a production obligation decision -- this is reference content, not tax advice.',
    null
  );
