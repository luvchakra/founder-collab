-- WonderArc Compliance backlog, COMPLY-P1-03.1/03.2/03.4 (Canada -- GST/HST, Provincial
-- PST/QST/RST, Filing Periods). Seeds real, versioned `gst.tax_rules` rows into the SAME
-- generic engine (COMPLY-P0-02.3) every prior country pack in this module already uses --
-- `country = 'CA'`, `regime = 'GST_HST'` (matching `lib/compliance/countries.ts`'s own
-- existing catalog entry, unchanged), all 13 provinces/territories from `lib/compliance/
-- ca-provinces.ts` (COMPLY-P1-03.1's own catalog).
--
-- Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com,
-- taxbycity.com, eeltd.ca, Wikipedia's own "Sales taxes in Canada" -- all independently
-- agreeing):
--
-- `rule_key = 'gst_hst_rate'` (COMPLY-P1-03.1) -- the FEDERAL rate that applies in each
-- jurisdiction: the plain 5% GST in every `gst_only`/`gst_pst`-model province/territory
-- (GST/HST is one federal number regardless of whether a SEPARATE provincial tax also
-- applies -- that separate provincial number is `provincial_sales_tax_rate` below, a
-- genuinely different rule_key/story), or the full HARMONIZED rate in an `hst`-model
-- province (the provincial component is baked into this one number, collected/remitted as
-- a single federal figure -- unlike a `gst_pst` province's own two separate taxes):
-- Ontario 13%, Nova Scotia 14%, New Brunswick/Newfoundland and Labrador/Prince Edward
-- Island 15% each. **Nova Scotia is a real, dated regulatory CHANGE, seeded as a genuine
-- two-version lineage**: Nova Scotia's own HST rate was CUT from 15% to 14% (the
-- provincial component from 10% to 9%) effective 1-Apr-2025 -- confirmed by every source
-- above independently agreeing on both the new rate and its effective date. Every other
-- rate's own `effective_from` uses the same conservative 2024-01-01 anchor date this
-- module's own EU/US seeds already established (accurate as of this migration's own
-- creation date, not asserting an unverified historical origin).
--
-- `rule_key = 'provincial_sales_tax_rate'` (COMPLY-P1-03.2) -- the SEPARATE provincial tax
-- that exists ONLY in the four `gst_pst`-model provinces, administered by each province's
-- OWN revenue agency (not CRA): British Columbia 7% PST, Saskatchewan 6% PST, Manitoba 7%
-- RST ("Retail Sales Tax" -- Manitoba's own statutory name, not "PST," though colloquially
-- often called that), Quebec 9.975% QST (administered by Revenu Québec). No row is seeded
-- for any `hst`/`gst_only` province -- there is no separate provincial number to look up
-- for either (an `hst` province's own provincial component is already inside its combined
-- `gst_hst_rate`; a `gst_only` jurisdiction has no provincial sales tax at all, a
-- structural fact `lib/compliance/ca-provinces.ts`'s own catalog already records, not a
-- gap this migration needs to fill with a synthetic "0%" row).
--
-- `rule_key = 'small_supplier_threshold_cad'`, `jurisdiction = null` (federal, applies
-- uniformly regardless of province) -- CAD 30,000 in taxable supplies over the applicable
-- test period, confirmed via WebSearch 2026-09-12 (zenbooks.ca, Canada.ca's own RC4022
-- "General Information for GST/HST Registrants," gstcalculator.ca, ibill.ca, insightscpa.ca,
-- mackisen.com -- all independently agreeing on the CAD 30,000 figure). **What this session
-- does NOT model, named explicitly**: the real single-calendar-quarter-vs-rolling-four-
-- quarter registration-DEADLINE distinction (a business that crosses the threshold within
-- one quarter must register within 29 days of that sale; one that crosses it gradually
-- over four quarters stops being a small supplier at the end of the FOLLOWING month) --
-- this seed and this story's own `determineSmallSupplierRegistrationObligation` answer only
-- "has cumulative revenue exceeded the threshold," the yes/no obligation question, not the
-- registration TIMING mechanics, the same "obligation, not deadline" scope boundary
-- COMPLY-P1-02.4 (US Sales Tax Registration Obligations) already drew for its own
-- economic-nexus determination.
--
-- `rule_key = 'gst_hst_filing_frequency_threshold_cad'`, `jurisdiction = null` -- the CRA's
-- own revenue-based filing-frequency assignment, confirmed via WebSearch 2026-09-12
-- (batemanmackay.com, ledg.ca, Canada.ca's own RC4022, everstonecpa.com, northos.ca,
-- ainativetax.com -- all independently agreeing): annual filing for CAD 1,500,000 or less
-- in annual taxable supplies, quarterly for more than that up to CAD 6,000,000, monthly
-- above CAD 6,000,000 -- a registrant may always elect a MORE frequent period than its own
-- default, never a less frequent one (not modeled as a separate rule -- that is a business's
-- own election, not a threshold fact).

insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, effective_to, source, treatment) values
  -- HST provinces (federal + provincial fully harmonized into one number)
  ('CA', 'ON', 'GST_HST', 'gst_hst_rate', '{"ratePercent": 13, "taxModel": "hst", "label": "Ontario HST"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca, Wikipedia "Sales taxes in Canada") -- the Canada Revenue Agency''s own published rate tables not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('CA', 'NB', 'GST_HST', 'gst_hst_rate', '{"ratePercent": 15, "taxModel": "hst", "label": "New Brunswick HST"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca, Wikipedia "Sales taxes in Canada"). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('CA', 'NL', 'GST_HST', 'gst_hst_rate', '{"ratePercent": 15, "taxModel": "hst", "label": "Newfoundland and Labrador HST"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca, Wikipedia "Sales taxes in Canada"). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('CA', 'PE', 'GST_HST', 'gst_hst_rate', '{"ratePercent": 15, "taxModel": "hst", "label": "Prince Edward Island HST"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca, Wikipedia "Sales taxes in Canada"). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  -- Nova Scotia -- a real two-version lineage (HST cut from 15% to 14% effective 1-Apr-2025)
  ('CA', 'NS', 'GST_HST', 'gst_hst_rate', '{"ratePercent": 15, "taxModel": "hst", "label": "Nova Scotia HST (superseded 1-Apr-2025)"}'::jsonb, 1, '2024-01-01', '2025-04-01',
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca, Wikipedia "Sales taxes in Canada" -- all independently confirming Nova Scotia''s HST rate was 15% before 1-Apr-2025). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('CA', 'NS', 'GST_HST', 'gst_hst_rate', '{"ratePercent": 14, "taxModel": "hst", "label": "Nova Scotia HST (reduced from 15% to 14%, provincial component from 10% to 9%, effective 1-Apr-2025)"}'::jsonb, 2, '2025-04-01', null,
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca, Wikipedia "Sales taxes in Canada" -- all independently confirming the rate cut and its 1-Apr-2025 effective date). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  -- gst_pst provinces -- the federal GST component is the plain 5% rate (the separate
  -- provincial number is its own rule_key, provincial_sales_tax_rate, below)
  ('CA', 'BC', 'GST_HST', 'gst_hst_rate', '{"ratePercent": 5, "taxModel": "gst_pst", "label": "British Columbia -- federal GST component (see provincial_sales_tax_rate for the separate 7% PST)"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('CA', 'SK', 'GST_HST', 'gst_hst_rate', '{"ratePercent": 5, "taxModel": "gst_pst", "label": "Saskatchewan -- federal GST component (see provincial_sales_tax_rate for the separate 6% PST)"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('CA', 'MB', 'GST_HST', 'gst_hst_rate', '{"ratePercent": 5, "taxModel": "gst_pst", "label": "Manitoba -- federal GST component (see provincial_sales_tax_rate for the separate 7% RST)"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('CA', 'QC', 'GST_HST', 'gst_hst_rate', '{"ratePercent": 5, "taxModel": "gst_pst", "label": "Quebec -- federal GST component (see provincial_sales_tax_rate for the separate 9.975% QST)"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  -- gst_only jurisdictions -- plain 5% federal GST, no provincial sales tax of any kind
  ('CA', 'AB', 'GST_HST', 'gst_hst_rate', '{"ratePercent": 5, "taxModel": "gst_only", "label": "Alberta -- GST only, no provincial sales tax"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca, Wikipedia "Sales tax in Alberta"). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('CA', 'YT', 'GST_HST', 'gst_hst_rate', '{"ratePercent": 5, "taxModel": "gst_only", "label": "Yukon -- GST only, no territorial sales tax"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('CA', 'NT', 'GST_HST', 'gst_hst_rate', '{"ratePercent": 5, "taxModel": "gst_only", "label": "Northwest Territories -- GST only, no territorial sales tax"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('CA', 'NU', 'GST_HST', 'gst_hst_rate', '{"ratePercent": 5, "taxModel": "gst_only", "label": "Nunavut -- GST only, no territorial sales tax"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  -- Provincial PST/QST/RST -- the SEPARATE, provincially-administered layer (COMPLY-P1-03.2)
  ('CA', 'BC', 'GST_HST', 'provincial_sales_tax_rate', '{"ratePercent": 7, "taxLabel": "PST", "label": "British Columbia Provincial Sales Tax"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca). Administered by the BC government directly, not the CRA. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  ('CA', 'SK', 'GST_HST', 'provincial_sales_tax_rate', '{"ratePercent": 6, "taxLabel": "PST", "label": "Saskatchewan Provincial Sales Tax"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca). Administered by the Saskatchewan government directly, not the CRA. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  ('CA', 'MB', 'GST_HST', 'provincial_sales_tax_rate', '{"ratePercent": 7, "taxLabel": "RST", "label": "Manitoba Retail Sales Tax (RST; as of 1-Jan-2026 also applies to cloud computing/software subscriptions/data storage/remote computer processing, not separately modeled by category here)"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca -- the digital-services base expansion effective 1-Jan-2026 also confirmed by taxesledger.com). Administered by the Manitoba government directly, not the CRA. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  ('CA', 'QC', 'GST_HST', 'provincial_sales_tax_rate', '{"ratePercent": 9.975, "taxLabel": "QST", "label": "Quebec Sales Tax (QST)"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (ledgerlogic.ca, taxesledger.com, fasttaxcalc.com, taxbycity.com, eeltd.ca). Administered by Revenu Québec, not the CRA. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  -- Federal thresholds (jurisdiction = null -- apply uniformly regardless of province)
  ('CA', null, 'GST_HST', 'small_supplier_threshold_cad', '{"thresholdCad": 30000, "label": "GST/HST small-supplier registration threshold"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (zenbooks.ca, Canada.ca''s own RC4022 "General Information for GST/HST Registrants," gstcalculator.ca, ibill.ca, insightscpa.ca, mackisen.com -- all independently agreeing on CAD 30,000). Does NOT model the real single-quarter-vs-rolling-four-quarter registration DEADLINE distinction -- see this migration''s own header comment. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  ('CA', null, 'GST_HST', 'gst_hst_filing_frequency_threshold_cad', '{"annualThresholdCad": 1500000, "quarterlyThresholdCad": 6000000, "label": "GST/HST filing frequency assignment (annual up to $1.5M, quarterly up to $6M, monthly above)"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (batemanmackay.com, ledg.ca, Canada.ca''s own RC4022, everstonecpa.com, northos.ca, ainativetax.com -- all independently agreeing on the $1.5M/$6M cutoffs). A registrant may always elect a MORE frequent period than this default; that election is a business choice, not modeled as a threshold. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null);
