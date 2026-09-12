-- WonderArc Compliance backlog, COMPLY-P0-07.1 (GSTR-1 Preparation): the invoice-value
-- threshold that decides whether an inter-state supply to an unregistered person must be
-- reported invoice-wise in GSTR-1 Table 5 (B2C Large / "B2CL") rather than netted into
-- Table 7's state-wise B2C Others summary -- Rule 59(4) of the CGST Rules, 2017. Same
-- data-only-migration-seed precedent COMPLY-P0-04.7/05.1/05.5/06.1/06.2 already
-- established.
--
-- Researched via web search before writing (backlog rule 6, "country rules must be
-- versioned and source-referenced"), not assumed from memory. Confirmed across multiple
-- independent sources (TallyHelp, ClearTax, TaxBuddy, CaClubIndia, CashFlo -- all
-- describing the same amendment consistently):
--
-- Version 1 -- Rule 59(4) of the CGST Rules, 2017 as originally notified: the invoice-wise
-- reporting threshold for inter-state B2C supplies was "two and a half lakh rupees"
-- (₹2,50,000). The CGST Rules, 2017 themselves came into force 01-Jul-2017 (the date GST
-- commenced nationwide) -- this session's research did not turn up a SEPARATE, later
-- notification that first introduced this specific threshold value (as opposed to the
-- e-invoice/e-way-bill thresholds seeded by prior stories, which each trace to their own
-- later notification), so version 1's `effective_from` is GST's own commencement date, not
-- a distinct notification date. Flagged here rather than silently invented.
--
-- Version 2 -- Rule 59(4) as amended: "for the words 'two and a half lakh rupees'
-- wherever they occur, the words 'one lakh rupees' shall be substituted" -- CBIC
-- Notification No. 12/2024-Central Tax, dated 10-Jul-2024 (the CGST (Amendment) Rules,
-- 2024, giving effect to the 53rd GST Council meeting's recommendation), effective
-- 01-Aug-2024. This is the version still in effect as of this session's own "today"
-- (2026-09-12); no further amendment was found.
--
-- `rule_key = 'gstr1_b2c_large_threshold_inr'` -- `value.thresholdInr` is a plain integer
-- (rupees). `jurisdiction` is null -- this is a central, uniform reporting threshold with
-- no state-specific variant found anywhere in this session's research. `treatment` is
-- null -- a return-reporting threshold, not a supply's tax treatment classification. Note
-- (documented in `lib/returns/gstr1/classify.ts`, not here): this threshold only ever
-- applies to an INTER-STATE supply to an unregistered person -- an intra-state B2C supply
-- of any value is never B2C Large, regardless of this rule's own value.
--
-- Same "verify against the current, authoritative CBIC notification before relying on
-- this for a production filing/obligation decision -- this is reference content, not tax
-- advice" caveat as every other seeded rule row in this module.

insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, effective_to, source, treatment) values
  (
    'IN', null, 'GST', 'gstr1_b2c_large_threshold_inr',
    '{"thresholdInr": 250000, "label": "GSTR-1 B2C Large (inter-state, unregistered) invoice-wise reporting threshold"}'::jsonb,
    1, '2017-07-01', '2024-08-01',
    'CGST Rules, 2017, Rule 59(4), as originally notified (in force from GST''s own commencement, 01-Jul-2017): inter-state supplies to unregistered persons exceeding ₹2,50,000 per invoice must be reported invoice-wise in GSTR-1. Superseded 01-Aug-2024 by CBIC Notification No. 12/2024-Central Tax. Verify against the current, authoritative CBIC notification before relying on this for a production filing decision -- this is reference content, not tax advice.',
    null
  ),
  (
    'IN', null, 'GST', 'gstr1_b2c_large_threshold_inr',
    '{"thresholdInr": 100000, "label": "GSTR-1 B2C Large (inter-state, unregistered) invoice-wise reporting threshold"}'::jsonb,
    2, '2024-08-01', null,
    'CBIC Notification No. 12/2024-Central Tax, dated 10-Jul-2024, substituting "one lakh rupees" for "two and a half lakh rupees" in Rule 59(4) of the CGST Rules, 2017, effective 01-Aug-2024 (per the 53rd GST Council meeting''s recommendation). Confirmed still current as of this row''s own creation (2026-09-12) -- no later amendment found. Verify against the current, authoritative CBIC notification before relying on this for a production filing decision -- this is reference content, not tax advice.',
    null
  );
