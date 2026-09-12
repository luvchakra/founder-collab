-- WonderArc Compliance backlog, COMPLY-P0-05.5 (Reporting Deadline Control): "Apply active
-- reporting window rules, including the current 30-day restriction for applicable ₹10
-- crore+ AATO taxpayers." A DIFFERENT threshold from COMPLY-P0-05.1's own
-- `einvoice_turnover_threshold_inr` (which decides whether e-invoicing is MANDATED at
-- all, ₹5 crore) -- this rule decides whether an ALREADY-MANDATED e-invoice must be
-- reported to the IRP within a fixed WINDOW of its own invoice date, on pain of the IRP
-- outright refusing a late submission (and the recipient losing ITC on it). Two separate
-- regulatory facts, two separate rule lineages, never conflated.
--
-- Researched via web search before writing (same discipline COMPLY-P0-04.7/05.1
-- established), confirming the backlog's own §2 India research citation still holds as of
-- this session's own "today" (2026-09-12):
--
-- Version 1 -- the original 30-day reporting window, applicable to AATO ₹100 crore and
-- above, per GSTN Advisory dated 13-Sep-2023, effective 01-Nov-2023 (an earlier, never-
-- enforced 7-day proposal from 01-May-2023 preceded this and is not modeled as its own
-- version -- it never actually took effect, so there is no real historical determination
-- it would ever need to be looked up under).
--
-- Version 2 -- the SAME 30-day window, LOWERED to apply to AATO ₹10 crore and above, per
-- GSTN Advisory dated 05-Nov-2024, effective 01-Apr-2025 -- the version in effect as of
-- this migration's own creation date and confirmed still current by the same search (no
-- further lowering found as of mid-2026).
--
-- `rule_key = 'einvoice_reporting_window_days'` -- `value` carries BOTH the applicability
-- threshold (`aatoThresholdInr`) and the window length (`windowDays`) together, since the
-- two numbers only mean something as a pair (a window length with no threshold, or vice
-- versa, describes nothing real). Note the threshold test here is "AATO OF ₹10 CRORE OR
-- MORE" (>=) -- deliberately different from COMPLY-P0-05.1's own "turnover EXCEEDING
-- ₹5 crore" (>) wording, because that is genuinely what each source says; this
-- distinction is preserved in `lib/einvoice-reporting-window/determine.ts`'s own
-- comparison, not smoothed into one shared convention.
--
-- Same "verify against the current, authoritative CBIC/GSTN notification before relying on
-- this for a production filing decision -- this is reference content, not tax advice"
-- caveat as every other seeded rule row in this module.

insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, effective_to, source, treatment) values
  (
    'IN', null, 'GST', 'einvoice_reporting_window_days',
    '{"aatoThresholdInr": 1000000000, "windowDays": 30, "label": "30-day e-invoice reporting window (AATO ₹100 crore and above)"}'::jsonb,
    1, '2023-11-01', '2025-04-01',
    'GSTN Advisory dated 13-Sep-2023: taxpayers with AATO ₹100 crore or more must report e-invoices (invoices/credit notes/debit notes) to the IRP within 30 days of the invoice date, effective 01-Nov-2023. Verify against the current, authoritative GSTN/CBIC notification before relying on this for a production filing decision -- this is reference content, not tax advice.',
    null
  ),
  (
    'IN', null, 'GST', 'einvoice_reporting_window_days',
    '{"aatoThresholdInr": 100000000, "windowDays": 30, "label": "30-day e-invoice reporting window (AATO ₹10 crore and above)"}'::jsonb,
    2, '2025-04-01', null,
    'GSTN Advisory dated 05-Nov-2024, lowering the 30-day e-invoice reporting window''s own applicability threshold to AATO ₹10 crore or more, effective 01-Apr-2025 (einvoice6.gst.gov.in portal notice). Verify against the current, authoritative GSTN/CBIC notification before relying on this for a production filing decision -- this is reference content, not tax advice.',
    null
  );
