-- WonderArc Compliance backlog, COMPLY-P1-02.8 (United States -- 1099 Information
-- Returns). "Federal information return obligation tracking" -- a genuinely SEPARATE
-- federal concern from every other US story in this epic (sales tax, COMPLY-P1-02.1-02.7):
-- this is INCOME reporting to the IRS about payments a business made to its OWN vendors/
-- contractors, not indirect tax collected from customers. Seeds two real, versioned rule
-- lineages into the SAME generic `gst.tax_rules` engine (COMPLY-P0-02.3) under a new
-- `regime = 'INFORMATION_RETURNS'` (added to `lib/compliance/countries.ts`'s own US catalog
-- entry this same story) -- no schema change needed, exactly the "generic engine, country/
-- regime packs are just rows" precedent every prior US story in this epic already relied on.
--
-- **Verified via WebSearch 2026-09-12, NOT copied blindly from this run's own
-- pre-supplied briefing** (which named both facts but explicitly required independent
-- verification before use):
-- - `form_1099_reporting_threshold_usd`: the Form 1099-NEC/MISC reporting threshold rises
--   from $600 to $2,000 for payments made in calendar year 2026 onward, under the One Big
--   Beautiful Bill Act (OBBBA, signed 4-Jul-2025) -- confirmed by OnPay, Avalara,
--   1800Accountant, Groom Law Group, Thomson Reuters, TINCheck, and Landmark CPAs, all
--   independently agreeing on the $600->$2,000 change and its 1-Jan-2026 effective date;
--   several sources additionally note the IRS will index the new $2,000 figure for
--   inflation starting 2027 (not modeled here -- no 2027 adjustment has been published as
--   of this migration's own creation date). Seeded as a real two-version lineage: version 1
--   ($600) -- the long-standing pre-OBBBA threshold, whose own true historical origin
--   predates this schema's own conservative anchor-date convention by decades and was NOT
--   independently re-verified against a primary IRS source this session (flagged the same
--   "verify before production use" way every other unverified historical origin date in
--   this schema already is) -- effective from the same conservative 2024-01-01 anchor date
--   COMPLY-P1-01.2/02.1's own seeds already established, through 2026-01-01; version 2
--   ($2,000) effective 1-Jan-2026.
-- - `information_return_efile_threshold_count`: confirmed via WebSearch 2026-09-12
--   (IRS.gov's own Publication 1220 and "E-filing thresholds lowered" page, Porte Brown,
--   Intuit TaxBandits/Tax Pro Center, ADP, and Durity USA all independently agreeing):
--   Treasury Decision 9972 (published 23-Feb-2023) lowered the AGGREGATE e-file threshold
--   for information returns from 250 to 10, effective for returns required to be filed on
--   or after 1-Jan-2024 -- "aggregate" meaning nearly every information-return TYPE a filer
--   issues (W-2s, the full 1099 series, and others) is summed together against this one
--   threshold, not counted per form type. Seeded as a real two-version lineage: version 1
--   (250, the long-standing PRIOR threshold every source above explicitly names as what TD
--   9972 replaced) effective from the same conservative 2024-01-01-minus-a-buffer anchor
--   date this schema's own convention uses for an unverified historical origin (this
--   session used 2021-01-01, deliberately well before the real 2024 change, rather than
--   guessing at the threshold's own true multi-decade origin) through 1-Jan-2024; version 2
--   (10) effective 1-Jan-2024.
--
-- **Deliberately NOT modeled as a `gst.tax_registrations`-shaped obligation, and no new
-- table** (checked `docs/plan/00-MASTER-PLAN.md` §5 first, backlog rule 1/5): a 1099
-- reporting obligation is not a registration a business HOLDS, it is a periodic
-- DETERMINATION over payments already on file (`core.payments`) -- the same "generic
-- engine + a pure combiner function" shape COMPLY-P1-02.2's own `determineEconomicNexus`
-- already established for a different threshold-crossing question, reused again here
-- rather than inventing a third pattern.

insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, effective_to, source, treatment) values
  ('US', null, 'INFORMATION_RETURNS', 'form_1099_reporting_threshold_usd', '{"thresholdUsd": 600, "label": "Form 1099-NEC/MISC reporting threshold (pre-OBBBA)"}'::jsonb, 1, '2024-01-01', '2026-01-01',
   'This $600 figure is the long-standing pre-OBBBA threshold, widely documented but NOT independently re-verified against a primary IRS source (e.g. the Form 1099-MISC/NEC instructions themselves) for its own true historical origin date this session -- treat as reference content pending verification. Superseding version confirmed via WebSearch 2026-09-12 (OnPay, Avalara, 1800Accountant, Groom Law Group, Thomson Reuters, TINCheck, Landmark CPAs -- all independently agreeing the One Big Beautiful Bill Act raises this to $2,000 for payments made in 2026). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  ('US', null, 'INFORMATION_RETURNS', 'form_1099_reporting_threshold_usd', '{"thresholdUsd": 2000, "label": "Form 1099-NEC/MISC reporting threshold (One Big Beautiful Bill Act, payments made on or after 1-Jan-2026; IRS to index for inflation starting 2027, not yet modeled)"}'::jsonb, 2, '2026-01-01', null,
   'Verified via WebSearch 2026-09-12 (OnPay, Avalara, 1800Accountant, Groom Law Group, Thomson Reuters, TINCheck, Landmark CPAs, all independently confirming the $600-to-$2,000 change under the One Big Beautiful Bill Act, signed 4-Jul-2025, effective for payments made in calendar year 2026). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  ('US', null, 'INFORMATION_RETURNS', 'information_return_efile_threshold_count', '{"thresholdCount": 250, "label": "Aggregate e-file threshold for information returns (pre-TD 9972)"}'::jsonb, 1, '2021-01-01', '2024-01-01',
   'The 250-return threshold long predates this row''s own conservative 2021-01-01 anchor date; its own true multi-decade historical origin was NOT independently re-verified against a primary IRS source this session -- treat as reference content pending verification. Superseding version confirmed via WebSearch 2026-09-12 (IRS.gov''s own Publication 1220 and "E-filing thresholds lowered for certain information returns" page, Porte Brown, Intuit TaxBandits/Tax Pro Center, ADP, Durity USA, all independently confirming Treasury Decision 9972, published 23-Feb-2023, lowered this aggregate threshold to 10 effective for returns required to be filed on or after 1-Jan-2024).', null),
  ('US', null, 'INFORMATION_RETURNS', 'information_return_efile_threshold_count', '{"thresholdCount": 10, "label": "Aggregate e-file threshold for information returns (Treasury Decision 9972, effective 1-Jan-2024)"}'::jsonb, 2, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (IRS.gov''s own Publication 1220 and "E-filing thresholds lowered for certain information returns" page, Porte Brown, Intuit TaxBandits/Tax Pro Center, ADP, Durity USA -- all independently confirming Treasury Decision 9972 lowered the aggregate e-file threshold from 250 to 10, effective for information returns required to be filed on or after 1-Jan-2024, aggregating nearly every information-return type a filer issues -- W-2s, the full 1099 series, and others -- against one combined count, not per form type). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null);
