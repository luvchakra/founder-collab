-- WonderArc Compliance backlog, COMPLY-P1-04.1/04.2/04.3/04.7 (Singapore -- GST
-- Registration, GST F5, InvoiceNow Eligibility, Five-Year Record Retention). Seeds real,
-- versioned `gst.tax_rules` rows into the SAME generic engine (COMPLY-P0-02.3) every prior
-- country pack in this module already uses -- `country = 'SG'`, `regime = 'GST'`
-- (matching `lib/compliance/countries.ts`'s own existing catalog entry, flipped from
-- "planned" to "supported" alongside this migration), `jurisdiction = null` throughout
-- (Singapore has no sub-national tax jurisdiction concept at all -- one nationwide GST
-- rate, one nationwide GST F5 return).
--
-- IRAS's own pages (iras.gov.sg) could not be reached directly by this session's WebFetch
-- tool (egress-blocked) -- the same posture this module's own COMPLY-P1-01.5 entry already
-- documented for ec.europa.eu/VIES. Every fact below is instead confirmed via WebSearch
-- 2026-09-12 against MULTIPLE independently-agreeing secondary sources, several of which
-- directly quote or link IRAS's own newsroom/e-Tax-guide titles -- named per rule below.
--
-- `rule_key = 'gst_standard_rate_percent'` -- Singapore's GST rate history, confirmed via
-- WebSearch 2026-09-12 (allianz.sg, KBA Training Centre, corporate.taxinfo.sg, Medium
-- "sgdecoded" -- all independently agreeing, and consistent with the widely-reported
-- Budget 2022 two-stage increase): 7% from 1-Jul-2007 (the rate's own long-stable prior
-- level -- not independently re-verified further back than this session's 8%/9% increase
-- research strictly required; if an even earlier change exists it does not affect any
-- current-era document this platform would ever compute tax for), 8% from 1-Jan-2023,
-- 9% from 1-Jan-2024 (current, no end date). A genuine THREE-version lineage, the same
-- "seed the real dated history, not just today's number" discipline the Nova Scotia HST
-- cut (COMPLY-P1-03.1) and every EU rate seed already established.
--
-- `rule_key = 'gst_registration_threshold_sgd'` -- the S$1,000,000 compulsory-registration
-- threshold (retrospective AND prospective tests both compare against this same figure),
-- confirmed via WebSearch 2026-09-12 (formvalidation.io, contactone.com.sg,
-- excellencesg.com, growacross.com, tassure.com, assemblyworks.co, MOF's own
-- "Conditions for Changing $1 Million Threshold..." newsroom page title -- all
-- independently agreeing the threshold is unchanged since GST's own introduction).
-- `effective_from` is GST's own introduction date, 1-Apr-1994, per this session's own
-- research finding no evidence the threshold figure itself has ever changed (distinct
-- from the REGISTRATION MECHANICS around it, which have -- see the grace-period rule
-- below).
--
-- `rule_key = 'gst_prospective_registration_grace_period_months'` -- confirmed via
-- WebSearch 2026-09-12 (formvalidation.io, tassure.com, growacross.com -- all
-- independently agreeing): since 1-Jul-2025, a business registering for GST on the
-- PROSPECTIVE basis (reasonable grounds to expect turnover will exceed S$1,000,000 in the
-- next 12 months) gets a two-month grace period before it must start CHARGING GST -- a
-- real, dated regulatory change (announced by the Second Minister for Finance on
-- 28-Feb-2025, effective 1-Jul-2025), not a fact that applied before that date. No row
-- exists for the period before 1-Jul-2025 -- `getEffectiveSgGstProspectiveGracePeriod`
-- correctly returns `null` (no grace period existed then), never a guessed fallback.
--
-- `rule_key = 'invoicenow_mandate_schedule'` -- COMPLY-P1-04.3 (InvoiceNow Eligibility):
-- the phased GST InvoiceNow (built on Peppol) rollout, confirmed via WebSearch 2026-09-12
-- against MULTIPLE independently-agreeing sources directly quoting or citing IRAS's own
-- newsroom releases ("Implementation of InvoiceNow for GST-Registered Businesses...",
-- "Committee of Supply 2026: Extension of GST InvoiceNow Requirement to All GST-registered
-- Businesses by April 2031") and its own e-Tax Guide/FAQ PDF (cleartax.com, hawksford.com,
-- beancount.io, podwerx.com, sqlaccounting.sg, pikon.com -- all independently agreeing on
-- the same four phases and dates):
--   1. `soft_launch` (1-May-2025) -- voluntary early adoption open to all existing
--      GST-registered businesses and any business registering for GST on or after this
--      date.
--   2. `new_voluntary_registrants_recent_incorporation` (1-Nov-2025) -- newly incorporated
--      companies (incorporated within 6 months of their GST registration application)
--      that register for GST VOLUNTARILY must adopt InvoiceNow and transmit prescribed
--      invoice data (Mandatory Data Elements) to IRAS via the InvoiceNow network.
--   3. `all_new_voluntary_registrants` (1-Apr-2026) -- ALL businesses applying for
--      voluntary GST registration, regardless of incorporation date or business
--      structure, must adopt InvoiceNow.
--   4. `all_gst_registered_businesses` (1-Apr-2028, through 1-Apr-2031) -- rollout to all
--      remaining (i.e. compulsorily-registered) GST-registered businesses, phased over
--      this window with smaller businesses prioritized in earlier years -- IRAS notifies
--      affected businesses individually of their own exact onboarding date within this
--      window, a fact this platform has no source for per business (see
--      `lib/einvoicing-sg/mandate.ts`'s own `determineActiveSgInvoiceNowPhases` for how
--      this is surfaced as genuinely UNKNOWN rather than guessed false, once this window
--      has opened).
-- This session's own research found the backlog's own pre-supplied §2 Singapore section
-- ("phased from 2025/2026 and eventually extends to all GST-registered businesses by
-- 2031") to still be directionally accurate but IMPRECISE on the exact phase dates/
-- eligibility criteria -- this seed supplies the precise, source-cited version.
--
-- `rule_key = 'gst_record_retention_months'` -- COMPLY-P1-04.7 (Five-Year Record
-- Retention): confirmed via WebSearch 2026-09-12 (IRAS's own "Keeping records" page
-- title/snippet, accountingsolutionssingapore.com, enstoncorp.com.sg, apexiacorp.com,
-- denpyo.com, rafflescorporateservices.com -- all independently agreeing): GST-registered
-- businesses must keep business and accounting records for AT LEAST 5 years (60 months),
-- measured from the end of the relevant GST accounting period -- a genuinely different
-- BASIS from India's own `gst_record_retention_months` rule (which counts from the
-- ANNUAL RETURN DUE DATE, Section 36 CGST Act), reflected here by the new
-- `"accounting_period_end"` basis value `lib/retention/types.ts`/`rule.ts` are widened to
-- accept alongside India's own `"annual_return_due_date"` (COMPLY-P0-10.5's own pattern,
-- extended to a second regime, not replaced). Same reuse instruction as every other
-- rule_key above: SAME rule_key string, country-scoped by the `country` column, not a
-- second parallel column/table.
--
-- Reference content, not tax advice, same disclaimer every prior country-pack seed in
-- this module already carries -- verify before relying on any of this for a production
-- filing decision.

insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, effective_to, source, treatment) values
  ('SG', null, 'GST', 'gst_standard_rate_percent', '{"ratePercent": 7, "label": "GST standard rate (superseded 1-Jan-2023)"}'::jsonb, 1, '2007-07-01', '2023-01-01',
   'Verified via WebSearch 2026-09-12 (allianz.sg, KBA Training Centre, corporate.taxinfo.sg, Medium "sgdecoded" -- all independently confirming the pre-2023 rate was 7%). IRAS''s own GST rate change pages not independently reachable this session (egress-blocked). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('SG', null, 'GST', 'gst_standard_rate_percent', '{"ratePercent": 8, "label": "GST standard rate (superseded 1-Jan-2024)"}'::jsonb, 2, '2023-01-01', '2024-01-01',
   'Verified via WebSearch 2026-09-12 (allianz.sg, KBA Training Centre, corporate.taxinfo.sg, Medium "sgdecoded" -- all independently confirming the 2023 rate was 8%, per Budget 2022''s two-stage increase). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('SG', null, 'GST', 'gst_standard_rate_percent', '{"ratePercent": 9, "label": "GST standard rate"}'::jsonb, 3, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (allianz.sg, KBA Training Centre, corporate.taxinfo.sg, Medium "sgdecoded" -- all independently confirming the current rate is 9% effective 1-Jan-2024). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('SG', null, 'GST', 'gst_registration_threshold_sgd', '{"thresholdSgd": 1000000, "label": "GST registration threshold (taxable turnover, retrospective and prospective tests)"}'::jsonb, 1, '1994-04-01', null,
   'Verified via WebSearch 2026-09-12 (formvalidation.io, contactone.com.sg, excellencesg.com, growacross.com, tassure.com, assemblyworks.co, and Singapore MOF''s own "Conditions for Changing $1 Million Threshold for Businesses'' Liability for GST Registration" newsroom page title -- all independently agreeing the S$1,000,000 threshold is unchanged since GST''s introduction). IRAS''s own registering-for-GST pages not independently reachable this session (egress-blocked). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  ('SG', null, 'GST', 'gst_prospective_registration_grace_period_months', '{"months": 2, "label": "Two-month grace period before GST charging must begin for prospective-basis registrants"}'::jsonb, 1, '2025-07-01', null,
   'Verified via WebSearch 2026-09-12 (formvalidation.io, tassure.com, growacross.com -- all independently agreeing this grace period was announced 28-Feb-2025 by the Second Minister for Finance, effective 1-Jul-2025). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  ('SG', null, 'GST', 'invoicenow_mandate_schedule',
   ('{"format": "Peppol BIS Billing 3.0 (GST InvoiceNow Requirement -- IRAS Mandatory Data Elements transmitted via the InvoiceNow/Peppol network)", "phases": [' ||
   '{"key": "soft_launch", "effectiveFrom": "2025-05-01", "scope": "voluntary_early_adoption", "description": "Voluntary early adoption open to all existing GST-registered businesses and any business registering for GST on or after this date."},' ||
   '{"key": "new_voluntary_registrants_recent_incorporation", "effectiveFrom": "2025-11-01", "scope": "voluntary_registrants_incorporated_within_6_months", "description": "Newly incorporated companies (incorporated within 6 months of their GST registration application) that register for GST voluntarily must adopt InvoiceNow and transmit invoice data to IRAS."},' ||
   '{"key": "all_new_voluntary_registrants", "effectiveFrom": "2026-04-01", "scope": "all_voluntary_registrants", "description": "All businesses applying for voluntary GST registration, regardless of incorporation date or business structure, must adopt InvoiceNow."},' ||
   '{"key": "all_gst_registered_businesses", "effectiveFrom": "2028-04-01", "scope": "all_gst_registered_businesses_phased_through_2031", "description": "Rollout to all remaining GST-registered businesses, phased from April 2028 to April 2031, with smaller businesses prioritized in earlier years. IRAS notifies affected businesses individually of their own exact onboarding date within this window."}' ||
   ']}')::jsonb,
   1, '2025-05-01', null,
   'Verified via WebSearch 2026-09-12 against multiple independently-agreeing sources directly quoting or citing IRAS''s own newsroom releases ("Implementation of InvoiceNow for GST-Registered Businesses...", "Committee of Supply 2026: Extension of GST InvoiceNow Requirement to All GST-registered Businesses by April 2031") and IRAS''s own e-Tax Guide/FAQ PDF for the GST InvoiceNow Requirement (cleartax.com, hawksford.com, beancount.io, podwerx.com, sqlaccounting.sg, pikon.com). IRAS''s own site not independently reachable this session (egress-blocked). Verify before relying on this for a production compliance decision -- this is reference content, not tax advice.', null),
  ('SG', null, 'GST', 'gst_record_retention_months', '{"months": 60, "basis": "accounting_period_end", "label": "Singapore GST record retention"}'::jsonb, 1, '1994-04-01', null,
   'Verified via WebSearch 2026-09-12 (IRAS''s own "Keeping records" page title/snippet, accountingsolutionssingapore.com, enstoncorp.com.sg, apexiacorp.com, denpyo.com, rafflescorporateservices.com -- all independently agreeing on a minimum 5-year/60-month retention period measured from the end of the relevant GST accounting period). IRAS''s own site not independently reachable in full this session (egress-blocked); this session found no evidence the period has ever differed from 5 years. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null)
on conflict (country, regime, jurisdiction, rule_key, version) do nothing;
