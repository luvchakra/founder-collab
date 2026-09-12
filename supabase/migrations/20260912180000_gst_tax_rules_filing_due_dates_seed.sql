-- WonderArc Compliance backlog, COMPLY-P0-09.1 (Filing Calendar): versioned,
-- source-cited rules for when GSTR-1/3B/9 actually fall due -- the Filing Calendar this
-- story builds (`lib/calendar/`) must compute real due dates from a real regulatory rule
-- row, never a hard-coded constant in application code (CLAUDE.md: "never hard-code
-- country-specific tax rates/rules"; backlog rule 6: "country rules must be versioned and
-- source-referenced"). Same data-only-migration-seed precedent COMPLY-P0-04.7/05.1/05.5/
--06.1/06.2 already established.
--
-- Researched via web search before writing (backlog rule 6), not assumed from memory,
-- cross-checked across multiple independent sources (dmifinance.in, gimbooks.com,
-- pkcindia.com, taxaj.com, sahajapp.in for the monthly/QRMP due days; taxguru.in and
-- a2ztaxcorp.com for the QRMP scheme's own commencement date and category state lists):
--
-- - GSTR-1: due on the 11th of the following month for monthly filers; the 13th of the
--   month following the quarter for QRMP quarterly filers.
-- - GSTR-3B: due on the 20th of the following month for monthly filers. QRMP quarterly
--   filers pay two monthly PMT-06 installments (25th of month 1 and month 2 of the
--   quarter) and file the quarter's own GSTR-3B by the 22nd ("Category X" states/UTs) or
--   24th ("Category Y" states/UTs) of the month following the quarter -- the split is by
--   the REGISTERED PLACE OF SUPPLY STATE, not a national-uniform date, which is why this
--   rule's own value bundles both state lists rather than picking one figure.
-- - GSTR-9: always annual, always due 31 December of the calendar year the financial year
--   ENDS in (e.g. FY 2025-26, 01-Apr-2025..31-Mar-2026, is due 31-Dec-2026) -- CBIC has not
--   extended this deadline since FY 2020-21 per this session's own research, so this rule
--   does not model a routine annual extension; a real extension notification would need
--   its own later-effective-dated version row when/if one is actually issued.
--
-- `effective_from = '2021-01-01'` on every row here: the QRMP scheme (which is what
-- actually introduces the 13th/22nd/24th/25th figures alongside the pre-existing monthly
-- ones) commenced 01-Jan-2021 per CBIC Notification No. 84/2020-Central Tax, dated
-- 10-Nov-2020. This migration does NOT model GSTR-1/3B's own earlier historical due-day
-- changes (e.g. a pre-2021 monthly-only figure) -- this platform has no return period
-- predating 2021 to ever apply an earlier version to, and this session's own research did
-- not turn up a precisely-dated notification for the monthly-only figure's own original
-- introduction to cite with the same confidence as the QRMP scheme's own well-documented
-- commencement date. Flagged here rather than silently implying a false precision.
--
-- Same "verify against the current, authoritative CBIC notification before relying on
-- this for a production filing/obligation decision -- this is reference content, not tax
-- advice" caveat as every other seeded rule row in this module.

insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, effective_to, source, treatment) values
  (
    'IN', null, 'GST', 'gstr1_filing_due_dates',
    '{"monthlyDueDay": 11, "quarterlyDueDay": 13, "label": "GSTR-1: 11th (monthly) / 13th (QRMP quarterly)"}'::jsonb,
    1, '2021-01-01', null,
    'GSTR-1 due dates: 11th of the following month for monthly filers, 13th of the month following the quarter for QRMP quarterly filers. Confirmed across dmifinance.in ("GST Return Due Dates 2026"), gimbooks.com, pkcindia.com, taxaj.com and sahajapp.in, all independently agreeing on the same two figures as of this session (2026-09-12). Verify against the current, authoritative CBIC notification before relying on this for a production filing decision -- this is reference content, not tax advice.',
    null
  ),
  (
    'IN', null, 'GST', 'gstr3b_filing_due_dates',
    '{"monthlyDueDay": 20, "qrmpInstallmentDueDay": 25, "categoryX": {"dueDay": 22, "states": ["Chhattisgarh", "Madhya Pradesh", "Gujarat", "Maharashtra", "Karnataka", "Goa", "Kerala", "Tamil Nadu", "Telangana", "Andhra Pradesh", "Daman and Diu", "Dadra and Nagar Haveli", "Puducherry", "Andaman and Nicobar Islands", "Lakshadweep"]}, "categoryY": {"dueDay": 24, "states": ["Himachal Pradesh", "Punjab", "Uttarakhand", "Haryana", "Rajasthan", "Uttar Pradesh", "Bihar", "Sikkim", "Arunachal Pradesh", "Nagaland", "Manipur", "Mizoram", "Tripura", "Meghalaya", "Assam", "West Bengal", "Jharkhand", "Odisha", "Jammu and Kashmir", "Ladakh", "Chandigarh", "Delhi"]}, "label": "GSTR-3B: 20th (monthly) / 22nd (QRMP Category X) / 24th (QRMP Category Y); PMT-06 installments due the 25th"}'::jsonb,
    1, '2021-01-01', null,
    'GSTR-3B due dates: 20th of the following month for monthly filers; QRMP quarterly filers pay two monthly PMT-06 installments by the 25th of the first two months of the quarter and file the quarter''s own GSTR-3B by the 22nd (Category X states/UTs) or 24th (Category Y states/UTs) of the month following the quarter, per CBIC Notification No. 84/2020-Central Tax (QRMP scheme, effective 01-Jan-2021). Category X/Y state lists confirmed via taxguru.in/a2ztaxcorp.com-style QRMP explainers as of this session (2026-09-12): Category X covers the southern/western states and UTs, Category Y the northern/eastern/central ones. Verify against the current, authoritative CBIC notification before relying on this for a production filing decision -- this is reference content, not tax advice.',
    null
  ),
  (
    'IN', null, 'GST', 'gstr9_filing_due_date',
    '{"dueMonth": 12, "dueDay": 31, "label": "GSTR-9: 31 December following the financial year"}'::jsonb,
    1, '2021-01-01', null,
    'GSTR-9 (annual return) is always due 31 December of the calendar year the financial year ends in. Confirmed via dmifinance.in, cleartax.in and incorpx.io-style GSTR-9 explainers as of this session (2026-09-12); CBIC has not extended this deadline since FY 2020-21 per the same research, so no routine extension is modeled here. Verify against the current, authoritative CBIC notification before relying on this for a production filing decision -- this is reference content, not tax advice.',
    null
  );
