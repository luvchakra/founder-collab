-- WonderArc Compliance backlog, COMPLY-P0-04.7 (GST Rule Versioning): "Rates/treatments
-- never hard-coded permanently." Populates `gst.tax_rules` with the first real India-GST
-- content that generic, empty table has ever held -- the standard ad-valorem GST rate
-- slab list itself -- as a genuine two-version lineage, closing the loop
-- COMPLY-P0-02.3's own migration comment opened ("India's own rate/treatment content
-- (COMPLY-P0-04.5/04.7) will populate later -- this story only builds the generic, empty
-- table"). Data-only migration, no DDL -- follows the exact same "seed a reference
-- catalogue directly via migration INSERT" precedent `core.tax_rates` already established
-- (20260906103000_core_items.sql's own 5-row seed), just versioned this time.
--
-- rule_key = 'standard_rate_slabs' -- the set of numeric ad-valorem GST percentages
-- recognized as of a given date, independent of which TREATMENT (standard/zero-rated/
-- exempt/... -- COMPLY-P0-02.4) any one transaction at that rate might carry in context.
-- `treatment` is left null on both rows below for exactly that reason: this rule is a
-- rate-slab catalogue, not a treatment classification (matches this column's own
-- documented "null when this rule isn't about a supply's tax treatment at all" meaning).
--
-- Version 1 -- the original four-slab structure GST launched with on 1 July 2017 (CGST Act
-- 2017 + the original CBIC rate notifications, e.g. Notification No. 1/2017-Central Tax
-- (Rate)): 0/5/12/18/28%. Not deleted when superseded below -- ADR-9/backlog rule 13
-- ("preserve historical filing/evidence state"): any document taxed under this version
-- must still be able to look this exact row up afterward.
--
-- Version 2 -- the "GST 2.0" rate rationalization the GST Council's 56th Meeting
-- (03-Sep-2025) approved and CBIC Notification No. 9/2025-Central Tax (Rate) (dated
-- 17-Sep-2025) implemented: two main slabs (5%/18%) replacing 12%/28%, plus a 40%
-- special/de-merit rate for select luxury/sin goods, effective 22-Sep-2025 -- the version
-- in effect as of this migration's own creation date (2026-09-12) and therefore the one
-- `getEffectiveTaxRule()` returns for "today" with no `asOf` override.
--
-- Both rows' own `source` text carries an explicit "verify against the current,
-- authoritative CBIC notification before relying on this for a real filing decision"
-- caveat -- this migration's job is to demonstrate the VERSIONING mechanism with real,
-- source-cited content (backlog rule 6), not to stand in as this platform's own tax-law
-- authority (backlog rule 11, "never claim compliant from a calculation alone"; the
-- module-wide disclaimer the backlog document itself carries at the very end of
-- docs/plan/11-COMPLIANCE-GLOBAL-TAX-BACKLOG.md).

insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, effective_to, source, treatment) values
  (
    'IN', null, 'GST', 'standard_rate_slabs',
    '{"slabsPercent": [0, 5, 12, 18, 28], "label": "Original four-slab GST structure (2017)"}'::jsonb,
    1, '2017-07-01', '2025-09-22',
    'CGST Act 2017 + original CBIC rate notifications (e.g. Notification No. 1/2017-Central Tax (Rate), 28-Jun-2017) establishing the 0/5/12/18/28% ad-valorem GST slabs effective 1-Jul-2017. Verify exact notification numbers against the current, authoritative CBIC rate schedule before relying on this for a production filing decision -- this is reference content, not tax advice.',
    null
  ),
  (
    'IN', null, 'GST', 'standard_rate_slabs',
    '{"slabsPercent": [0, 5, 18, 40], "label": "GST 2.0 rate rationalization (two main slabs plus a special de-merit rate)"}'::jsonb,
    2, '2025-09-22', null,
    'GST Council 56th Meeting (03-Sep-2025) rate rationalization decision; CBIC Notification No. 9/2025-Central Tax (Rate), dated 17-Sep-2025; effective 22-Sep-2025 -- two main slabs (5%/18%) replacing the prior 12%/28% slabs, plus a 40% special/de-merit rate for select luxury and sin goods. Verify against the current, authoritative CBIC notification before relying on this for a production filing decision -- this is reference content, not tax advice.',
    null
  );
