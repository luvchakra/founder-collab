-- WonderArc Compliance backlog, COMPLY-P1-02.5 (United States -- Product/Service
-- Taxability). Seeds real, versioned `gst.tax_rules` rows (rule_key =
-- 'product_taxability_<category>', read by `lib/us-product-taxability/rules.ts`) for the
-- SAME 10-state initial focus list COMPLY-P1-02.1/02.2 already established (California,
-- Texas, New York, Florida, Illinois, Pennsylvania, Ohio, Georgia, North Carolina,
-- Washington) -- an 11th state or a new category still needs only more rows, no code
-- change.
--
-- Scoped to TWO of `lib/us-product-taxability/categories.ts`'s own seven categories this
-- session -- `clothing` and `groceries` -- the two best-documented, canonical US sales-tax
-- carve-out categories (backlog rule 6: real, versioned, source-cited content over a
-- sprawling, thinly-verified one). `prepared_food`/`digital_goods`/`saas`/`services` are
-- catalog entries with NO seeded rule rows yet, the same "catalog ships before every
-- country/category has real content" precedent `lib/compliance/treatments.ts` (COMPLY-
-- P0-02.4) already established -- a caller resolving one of those four for any state
-- correctly gets "unresolved" (never a guessed treatment), not an error.
--
-- Clothing -- verified via WebSearch 2026-09-12:
-- - Pennsylvania: broad, longstanding exemption for everyday clothing/footwear (jeans,
--   shirts, shoes, children's clothing, ...), formal wear/sporting goods/protective gear
--   remain taxable (61 Pa. Code Chapter 53 "Clothing"; the Department of Revenue's own
--   REV-717 bulletin is cited by TaxJar/Commenda/Stripe/Kintsugi/Sovos as the authoritative
--   taxable-vs-exempt list). This session's own search confirmed the Tax Reform Code of
--   1971 (Act of 1971, P.L. 6, No. 2) as the origin of Pennsylvania's sales tax and its own
--   clothing-adjacent exemptions (e.g. clothing repair/cleaning services, explicitly
--   effective 1-Jul-1971 per 61 Pa. Code Chapter 53) -- the exact enactment date of the
--   CLOTHING SALE exemption itself (as opposed to these clothing-SERVICE exemptions) was
--   not independently re-confirmed against a primary PA DOR source this session, so
--   `effective_from` here uses the same conservative 2024-01-01 anchor date (accurate as of
--   THIS migration's own creation date, not asserting an unverified historical origin --
--   backlog rule 11) every other US sales-tax rate/threshold row in this schema already
--   uses, not the 1971 date.
-- - New York: clothing/footwear under $110 PER ITEM is exempt from the state's 4% tax
--   (restored to this threshold 1-Apr-2012, per NYSenate.gov's own press release and
--   NY Department of Taxation and Finance Publication 718-C) -- local tax in a locality
--   that has not separately enacted the exemption can still apply. Modeled here as
--   `exempt` at the STATE level (this session's `product_taxability_*` value has no
--   per-item-price-threshold field, and this platform's taxability engine resolves per
--   ITEM CATEGORY, not per specific unit price) -- a real, named simplification: an item in
--   the `clothing` category priced at or above $110 would be reported exempt by this
--   engine when NY law would in fact tax it. Flagged explicitly in this row's own `source`
--   text rather than silently modeled as a blanket exemption; a future story adding a
--   price-threshold field to `UsProductTaxabilityRuleValue` is the right place to fix this,
--   not a workaround here.
-- - California, Texas, Florida, Illinois, Ohio, Georgia, North Carolina, Washington: no
--   general clothing exemption found in this session's research (confirmed via the same
--   comprehensive multi-state clothing-taxability trackers cited below) -- clothing is
--   ordinary tangible personal property in these eight states, taxed at the general state
--   rate. No override row is seeded for them: the generic engine's own "no category rule
--   found -> falls back to the general state rate" default (`lib/us-product-taxability/
--   determine.ts`) already produces the correct answer without a redundant "standard" row
--   per state.
--
-- Groceries (unprepared food for home consumption) -- verified via WebSearch 2026-09-12
-- (Kiplinger's, Zamp's, TaxHero's, and LegalClarity's own 2026 state-by-state grocery-tax
-- guides all independently agreeing): as of 2026, groceries are EXEMPT from state-level
-- sales tax in all ten states in this focus list -- none of them appear on the current
-- (much shorter, 2026) list of states that still tax groceries at the state level (Alabama,
-- Arkansas, Hawaii, Idaho, Mississippi, Missouri, South Dakota, Tennessee, Utah, Virginia).
-- Georgia and North Carolina exempt groceries from the STATE tax specifically but still
-- allow a LOCAL grocery tax (not modeled -- this schema has no local-rate concept at all,
-- the same documented gap COMPLY-P1-02.1 already flagged for general local sales tax).
-- Illinois is the one real, dated regulatory CHANGE seeded as a genuine two-version
-- lineage: Illinois' own 1% statewide grocery tax was eliminated effective 1-Jan-2026
-- (Illinois Department of Revenue's own FY 2026-03 bulletin, tax.illinois.gov, corroborated
-- by TaxCloud's and Avalara's own coverage of the same law) -- version 1 (a REDUCED 1% rate,
-- Illinois' own long-standing grocery rate prior to the repeal) effective from this
-- session's own conservative 2024-01-01 anchor date (Illinois' 1% grocery rate itself
-- predates 2024 by decades; its own original enactment date was not independently
-- re-verified this session), version 2 (exempt) effective 1-Jan-2026. Illinois' own new law
-- ALSO authorizes municipalities/counties to impose their own local 1% grocery tax by
-- ordinance (over 600 localities had already done so by this migration's own "today") --
-- not modeled, the same local-rate gap named above; this row records the STATE-level
-- treatment only, exactly as documented in this schema's own `state_sales_tax_rate`
-- convention.

insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, effective_to, source, treatment) values
  -- Clothing -- Pennsylvania (broad exemption for everyday clothing/footwear)
  ('US', 'PA', 'SALES_TAX', 'product_taxability_clothing', '{"treatment": "exempt", "ratePercent": 0, "label": "Pennsylvania everyday clothing/footwear exemption (formal wear, sporting goods, and protective gear remain taxable)"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (TaxJar, Commenda, Stripe, Kintsugi, Sovos, SalesTaxHandbook, all citing 61 Pa. Code Chapter 53 and the PA Department of Revenue''s own REV-717 bulletin as the authoritative taxable-vs-exempt list) -- Pennsylvania''s own Department of Revenue site not independently confirmed reachable this session. Exemption applies only to everyday-wear clothing/footwear, not formal wear/sporting goods/protective gear (not separately modeled -- this platform classifies at the whole-category level, not per specific garment type). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'exempt'),
  -- Clothing -- New York (exempt under $110 per item; local tax may still apply)
  ('US', 'NY', 'SALES_TAX', 'product_taxability_clothing', '{"treatment": "exempt", "ratePercent": 0, "label": "New York clothing/footwear exemption -- state-level only, applies per item priced under $110 (NOT modeled as a price threshold here; see this row''s own source note)"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (NYSenate.gov press release confirming the exemption was restored to the <$110-per-item threshold effective 1-Apr-2012; NY Department of Taxation and Finance Publication 718-C). SIMPLIFICATION, named explicitly: this platform''s taxability engine resolves per ITEM CATEGORY, not per specific unit price -- an actual clothing item priced at or above $110 would be taxed under real NY law but reported exempt by this row. A locality that has not separately enacted the local exemption may still tax clothing regardless of price (local rates not modeled at all in this schema). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'exempt'),
  -- Groceries -- exempt at the state level in all 10 focus-list states as of 2026
  ('US', 'CA', 'SALES_TAX', 'product_taxability_groceries', '{"treatment": "exempt", "ratePercent": 0, "label": "California grocery food exemption (most unprepared food for home consumption)"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (Kiplinger, Zamp, TaxHero, LegalClarity 2026 state grocery-tax guides -- California does not appear on the current, much shorter list of states that still tax groceries at the state level). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'exempt'),
  ('US', 'TX', 'SALES_TAX', 'product_taxability_groceries', '{"treatment": "exempt", "ratePercent": 0, "label": "Texas food products for home consumption exemption"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (Kiplinger, Zamp, TaxHero, LegalClarity 2026 state grocery-tax guides). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'exempt'),
  ('US', 'NY', 'SALES_TAX', 'product_taxability_groceries', '{"treatment": "exempt", "ratePercent": 0, "label": "New York grocery food exemption"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (Kiplinger, Zamp, TaxHero, LegalClarity 2026 state grocery-tax guides). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'exempt'),
  ('US', 'FL', 'SALES_TAX', 'product_taxability_groceries', '{"treatment": "exempt", "ratePercent": 0, "label": "Florida grocery food exemption"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (Kiplinger, Zamp, TaxHero, LegalClarity 2026 state grocery-tax guides). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'exempt'),
  -- Illinois -- a real two-version lineage (1% reduced rate eliminated 1-Jan-2026, local option 1% tax not modeled)
  ('US', 'IL', 'SALES_TAX', 'product_taxability_groceries', '{"treatment": "reduced", "ratePercent": 1, "label": "Illinois grocery tax (reduced 1% state rate, superseded 1-Jan-2026)"}'::jsonb, 1, '2024-01-01', '2026-01-01',
   'Illinois'' own long-standing 1% grocery rate predates this row''s own conservative 2024-01-01 anchor date by decades; its original enactment date was not independently re-verified against the Illinois Department of Revenue this session. Repeal confirmed via WebSearch 2026-09-12 (Illinois Department of Revenue FY 2026-03 bulletin, tax.illinois.gov; corroborated by TaxCloud and Avalara). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'reduced'),
  ('US', 'IL', 'SALES_TAX', 'product_taxability_groceries', '{"treatment": "exempt", "ratePercent": 0, "label": "Illinois grocery tax eliminated at the state level, effective 1-Jan-2026 (municipalities/counties may separately impose their own local 1% grocery tax, NOT modeled -- this schema has no local-rate concept)"}'::jsonb, 2, '2026-01-01', null,
   'Verified via WebSearch 2026-09-12 (Illinois Department of Revenue FY 2026-03 bulletin, tax.illinois.gov; corroborated by TaxCloud''s and Avalara''s own coverage of the same law, both noting over 600 localities adopted their own local grocery tax on the same date). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'exempt'),
  ('US', 'PA', 'SALES_TAX', 'product_taxability_groceries', '{"treatment": "exempt", "ratePercent": 0, "label": "Pennsylvania grocery food exemption (ready-to-eat/prepared food remains taxable)"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (Kiplinger, Zamp, TaxHero, LegalClarity 2026 state grocery-tax guides). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'exempt'),
  ('US', 'OH', 'SALES_TAX', 'product_taxability_groceries', '{"treatment": "exempt", "ratePercent": 0, "label": "Ohio food for home consumption exemption"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (Kiplinger, Zamp, TaxHero, LegalClarity 2026 state grocery-tax guides). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'exempt'),
  ('US', 'GA', 'SALES_TAX', 'product_taxability_groceries', '{"treatment": "exempt", "ratePercent": 0, "label": "Georgia grocery food exemption at the state level (local sales tax on groceries may still apply, not modeled)"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (Kiplinger, Zamp, TaxHero, LegalClarity 2026 state grocery-tax guides). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'exempt'),
  ('US', 'NC', 'SALES_TAX', 'product_taxability_groceries', '{"treatment": "exempt", "ratePercent": 0, "label": "North Carolina grocery food exemption at the state level (a separate 2% local rate may still apply, not modeled)"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (Kiplinger, Zamp, TaxHero, LegalClarity 2026 state grocery-tax guides). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'exempt'),
  ('US', 'WA', 'SALES_TAX', 'product_taxability_groceries', '{"treatment": "exempt", "ratePercent": 0, "label": "Washington food and food ingredients exemption"}'::jsonb, 1, '2024-01-01', null,
   'Verified via WebSearch 2026-09-12 (Kiplinger, Zamp, TaxHero, LegalClarity 2026 state grocery-tax guides). Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'exempt');
