-- WonderArc Compliance backlog, COMPLY-P1-02.1/02.2 (United States -- State/Local
-- Jurisdictions / Economic Nexus Tracker). The backlog's own §2 US section: "the US
-- country pack needs a jurisdiction engine rather than one tax rate." Unlike a VAT country
-- (COMPLY-P1-01), the US taxes at the STATE level (jurisdiction = the state's own two-letter
-- USPS code, per `lib/compliance/jurisdictions.ts`'s own COMPLY-P1-02.1 addition), and this
-- session deliberately does NOT attempt the true 12,000+-jurisdiction county/city/special-
-- district granularity Avalara's own database has (backlog §1's own conclusion: "WonderArc
-- should not compete on the size of a proprietary tax database" -- the value here is a real
-- nexus/registration-obligation ENGINE, not address-level rate precision).
--
-- **Initial focus list of 10 states** (the same "narrower-than-the-whole-country-pack"
-- precedent COMPLY-P1-01.2 already established for the EU's own 5-of-27 member states):
-- California, Texas, New York, Florida, Illinois, Pennsylvania, Ohio, Georgia, North
-- Carolina, Washington -- chosen for population/economic significance, covering a real
-- spread of threshold SHAPES (a plain $100k-revenue-only state, the three states with a
-- higher $500k threshold, the one AND-test state, and two OR-test (revenue-or-transactions)
-- states) so the generic engine (`lib/us-nexus/`) is exercised against every real threshold
-- shape this backlog's own research names, not just the single most common one.
--
-- `lib/compliance/us-states.ts` (COMPLY-P1-02.1's own catalog) already lists all 50 states
-- + DC and which five have NO state sales tax at all (Alaska, Delaware, Montana, New
-- Hampshire, Oregon) -- no row is seeded for any of those five here: there is no rate/
-- threshold to look up for a state with no state-level sales tax, a structural fact the
-- catalog itself already records, not a gap this migration needs to fill with a synthetic
-- "0%" row.
--
-- rule_key = 'state_sales_tax_rate' -- the state's own single ad-valorem rate (unlike
-- India's multi-slab or the EU's standard+reduced split, US state sales tax is overwhelmingly
-- one flat state rate, with the real complexity living in LOCAL add-on rates this session
-- deliberately does not model -- see above). rule_key = 'economic_nexus_threshold' -- the
-- revenue/transaction-count threshold that establishes "economic nexus" (the South Dakota
-- v. Wayfair, Inc., 138 S. Ct. 2080 (2018) doctrine every state's own economic nexus statute
-- implements) above which a REMOTE seller with no physical presence in the state must still
-- register and collect. `thresholdLogic` names which combination applies:
-- `revenue_only` (no transaction-count prong at all), `revenue_or_transactions` (either
-- alone triggers nexus), `revenue_and_transactions` (BOTH are required -- New York's own
-- genuinely unusual AND-test, not the OR-test every other state in this seed uses).
--
-- Verified via WebSearch 2026-09-12, cross-checked across multiple independent trackers
-- (taxcloud.com, trykintsugi.com, numeral.com, wolterskluwer.com, eightx.co, galvix.com,
-- nexusbystate.com, nexusrules.com, taxesledger.com, mysalestaxfirm.com, avalara.com,
-- taxfoundation.org, salestaxinstitute.com, stripe.com, tradingeconomics.com) -- primary
-- source (each state's own department of revenue) not independently confirmed reachable in
-- this sandboxed session:
-- - California: $500,000 revenue-only economic nexus threshold; 7.25% state sales tax rate.
-- - Texas: $500,000 revenue-only; 6.25% state rate.
-- - New York: $500,000 AND 100 transactions (the only other AND-test state besides
--   Connecticut, which is not in this initial focus list); 4.00% state rate.
-- - Florida: $100,000 revenue-only; 6.00% state rate.
-- - Illinois: $100,000 revenue-only AS OF 1-JANUARY-2026 (Illinois eliminated its own prior
--   200-transaction prong effective that date) -- seeded as a real TWO-VERSION lineage:
--   version 1 ($100,000 OR 200 transactions, the original post-Wayfair OR-test every
--   source describing Illinois' pre-2026 rule agrees on) effective from Illinois' own
--   original economic-nexus effective date, 1-October-2018 (the widely-documented date
--   Illinois' own economic nexus statute took effect, alongside many other states'
--   own Wayfair-response laws in Q3-Q4 2018 -- not independently re-verified against
--   Illinois' own Department of Revenue this session, flagged the same "verify before
--   production use" way every rate figure in this seed is); version 2 (100,000
--   revenue-only) effective 1-January-2026. 6.25% state rate (unaffected by the nexus-rule
--   change).
-- - Pennsylvania: $100,000 revenue-only (no transaction-count prong); 6.00% state rate.
-- - Ohio: $100,000 OR 200 transactions (Ohio is confirmed to still keep BOTH prongs as of
--   2026, unlike Illinois/North Carolina); 5.75% state rate.
-- - Georgia: $100,000 OR 200 transactions (Georgia is confirmed to still keep BOTH prongs
--   as of 2026); 4.00% state rate.
-- - North Carolina: $100,000 revenue-only AS OF 1-JULY-2024 (North Carolina removed its own
--   prior 200-transaction prong effective that date, confirmed via WebSearch) -- seeded as
--   a real TWO-VERSION lineage: version 1 ($100,000 OR 200 transactions) effective from
--   North Carolina's own original economic-nexus effective date, 1-November-2018 (widely
--   documented, not independently re-verified against NCDOR this session); version 2
--   ($100,000 revenue-only) effective 1-July-2024. 4.75% state rate.
-- - Washington: $100,000 revenue-only; 6.50% state rate.
--
-- Every rate/threshold's own `effective_from` for the states where this session did NOT
-- independently verify a specific historical change date (California, Texas, New York,
-- Florida, Pennsylvania, Ohio, Georgia, Washington's own rate AND nexus rows, and Illinois'/
-- North Carolina's own rate rows specifically) is deliberately the same conservative,
-- safely-recent anchor date (2024-01-01) COMPLY-P1-01.2's own EU rate seed already
-- established -- confirming these figures are accurate AS OF this migration's own creation
-- date (2026-09-12), never asserting an unverified historical origin (backlog rule 11).
-- Every row's own `source` column carries the same "verify against the current,
-- authoritative [state] Department of Revenue publication before relying on this for a
-- production filing decision" caveat every prior seed in this module already uses.

insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, effective_to, source, treatment) values
  -- California
  ('US', 'CA', 'SALES_TAX', 'state_sales_tax_rate', '{"ratePercent": 7.25, "label": "California state sales tax rate"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxfoundation.org, avalara.com, salestaxinstitute.com, stripe.com) -- California''s own CDTFA not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('US', 'CA', 'SALES_TAX', 'economic_nexus_threshold', '{"revenueThresholdUsd": 500000, "transactionThreshold": null, "thresholdLogic": "revenue_only", "label": "California economic nexus threshold"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxcloud.com, trykintsugi.com, numeral.com, wolterskluwer.com, eightx.co, galvix.com) -- California''s own CDTFA not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  -- Texas
  ('US', 'TX', 'SALES_TAX', 'state_sales_tax_rate', '{"ratePercent": 6.25, "label": "Texas state sales tax rate"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxfoundation.org, avalara.com, salestaxinstitute.com, stripe.com) -- Texas'' own Comptroller not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('US', 'TX', 'SALES_TAX', 'economic_nexus_threshold', '{"revenueThresholdUsd": 500000, "transactionThreshold": null, "thresholdLogic": "revenue_only", "label": "Texas economic nexus threshold"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxcloud.com, trykintsugi.com, numeral.com, wolterskluwer.com, eightx.co, galvix.com) -- Texas'' own Comptroller not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  -- New York
  ('US', 'NY', 'SALES_TAX', 'state_sales_tax_rate', '{"ratePercent": 4.00, "label": "New York state sales tax rate"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxfoundation.org, avalara.com, salestaxinstitute.com, stripe.com) -- New York''s own Department of Taxation and Finance not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('US', 'NY', 'SALES_TAX', 'economic_nexus_threshold', '{"revenueThresholdUsd": 500000, "transactionThreshold": 100, "thresholdLogic": "revenue_and_transactions", "label": "New York economic nexus threshold (AND test, not OR -- both prongs required)"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxcloud.com, trykintsugi.com, numeral.com -- all independently confirming New York is one of only two AND-test states, alongside Connecticut) -- New York''s own Department of Taxation and Finance not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  -- Florida
  ('US', 'FL', 'SALES_TAX', 'state_sales_tax_rate', '{"ratePercent": 6.00, "label": "Florida state sales tax rate"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxfoundation.org, avalara.com, salestaxinstitute.com, stripe.com) -- Florida''s own Department of Revenue not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('US', 'FL', 'SALES_TAX', 'economic_nexus_threshold', '{"revenueThresholdUsd": 100000, "transactionThreshold": null, "thresholdLogic": "revenue_only", "label": "Florida economic nexus threshold"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxcloud.com, trykintsugi.com, numeral.com, wolterskluwer.com, eightx.co, galvix.com) -- Florida''s own Department of Revenue not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  -- Illinois -- a real two-version economic-nexus lineage (200-transaction prong removed 1-Jan-2026)
  ('US', 'IL', 'SALES_TAX', 'state_sales_tax_rate', '{"ratePercent": 6.25, "label": "Illinois state sales tax rate"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxfoundation.org, avalara.com, salestaxinstitute.com, stripe.com) -- Illinois'' own Department of Revenue not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('US', 'IL', 'SALES_TAX', 'economic_nexus_threshold', '{"revenueThresholdUsd": 100000, "transactionThreshold": 200, "thresholdLogic": "revenue_or_transactions", "label": "Illinois economic nexus threshold (original OR-test, superseded 1-Jan-2026)"}'::jsonb, 1, '2018-10-01', '2026-01-01',
   'Illinois'' own original post-Wayfair economic nexus effective date (1-Oct-2018) is widely documented across secondary sources but NOT independently re-verified against the Illinois Department of Revenue this session -- treat as reference content pending verification. Superseding version confirmed via WebSearch 2026-09-12 (taxcloud.com, and this session''s own broader nexus-threshold research all agreeing Illinois eliminated the 200-transaction prong effective 1-Jan-2026).', null),
  ('US', 'IL', 'SALES_TAX', 'economic_nexus_threshold', '{"revenueThresholdUsd": 100000, "transactionThreshold": null, "thresholdLogic": "revenue_only", "label": "Illinois economic nexus threshold (revenue-only, effective 1-Jan-2026)"}'::jsonb, 2, '2026-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxcloud.com and this session''s own broader nexus-threshold research, both independently confirming Illinois removed its own 200-transaction prong effective 1-Jan-2026) -- Illinois'' own Department of Revenue not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  -- Pennsylvania
  ('US', 'PA', 'SALES_TAX', 'state_sales_tax_rate', '{"ratePercent": 6.00, "label": "Pennsylvania state sales tax rate"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxfoundation.org, avalara.com, salestaxinstitute.com, stripe.com) -- Pennsylvania''s own Department of Revenue not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('US', 'PA', 'SALES_TAX', 'economic_nexus_threshold', '{"revenueThresholdUsd": 100000, "transactionThreshold": null, "thresholdLogic": "revenue_only", "label": "Pennsylvania economic nexus threshold"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxcloud.com, and a dedicated follow-up search confirming Pennsylvania has no transaction-count prong) -- Pennsylvania''s own Department of Revenue not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  -- Ohio
  ('US', 'OH', 'SALES_TAX', 'state_sales_tax_rate', '{"ratePercent": 5.75, "label": "Ohio state sales tax rate"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxfoundation.org, avalara.com, salestaxinstitute.com, stripe.com) -- Ohio''s own Department of Taxation not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('US', 'OH', 'SALES_TAX', 'economic_nexus_threshold', '{"revenueThresholdUsd": 100000, "transactionThreshold": 200, "thresholdLogic": "revenue_or_transactions", "label": "Ohio economic nexus threshold"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxcloud.com, and a dedicated follow-up search confirming Ohio still keeps both the revenue AND transaction-count prongs as of 2026) -- Ohio''s own Department of Taxation not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  -- Georgia
  ('US', 'GA', 'SALES_TAX', 'state_sales_tax_rate', '{"ratePercent": 4.00, "label": "Georgia state sales tax rate"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxfoundation.org, avalara.com, salestaxinstitute.com, stripe.com) -- Georgia''s own Department of Revenue not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('US', 'GA', 'SALES_TAX', 'economic_nexus_threshold', '{"revenueThresholdUsd": 100000, "transactionThreshold": 200, "thresholdLogic": "revenue_or_transactions", "label": "Georgia economic nexus threshold"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxcloud.com, and a dedicated follow-up search confirming Georgia still keeps both the revenue AND transaction-count prongs as of 2026) -- Georgia''s own Department of Revenue not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  -- North Carolina -- a real two-version economic-nexus lineage (200-transaction prong removed 1-Jul-2024)
  ('US', 'NC', 'SALES_TAX', 'state_sales_tax_rate', '{"ratePercent": 4.75, "label": "North Carolina state sales tax rate"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxfoundation.org, avalara.com, salestaxinstitute.com, stripe.com) -- North Carolina''s own Department of Revenue not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('US', 'NC', 'SALES_TAX', 'economic_nexus_threshold', '{"revenueThresholdUsd": 100000, "transactionThreshold": 200, "thresholdLogic": "revenue_or_transactions", "label": "North Carolina economic nexus threshold (original OR-test, superseded 1-Jul-2024)"}'::jsonb, 1, '2018-11-01', '2024-07-01',
   'North Carolina''s own original post-Wayfair economic nexus effective date (1-Nov-2018) is widely documented across secondary sources but NOT independently re-verified against the North Carolina Department of Revenue this session -- treat as reference content pending verification. Superseding version confirmed via WebSearch 2026-09-12 (taxjar.com, salestaxinstitute.com, galvix.com, numeral.com, trykintsugi.com, taxcloud.com all independently confirming North Carolina removed the 200-transaction prong effective 1-Jul-2024).', null),
  ('US', 'NC', 'SALES_TAX', 'economic_nexus_threshold', '{"revenueThresholdUsd": 100000, "transactionThreshold": null, "thresholdLogic": "revenue_only", "label": "North Carolina economic nexus threshold (revenue-only, effective 1-Jul-2024)"}'::jsonb, 2, '2024-07-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxjar.com, salestaxinstitute.com, galvix.com, numeral.com, trykintsugi.com, taxcloud.com) -- North Carolina''s own Department of Revenue not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null),
  -- Washington
  ('US', 'WA', 'SALES_TAX', 'state_sales_tax_rate', '{"ratePercent": 6.50, "label": "Washington state sales tax rate"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxfoundation.org, avalara.com, salestaxinstitute.com, stripe.com) -- Washington''s own Department of Revenue not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', 'standard'),
  ('US', 'WA', 'SALES_TAX', 'economic_nexus_threshold', '{"revenueThresholdUsd": 100000, "transactionThreshold": null, "thresholdLogic": "revenue_only", "label": "Washington economic nexus threshold"}'::jsonb, 1, '2024-01-01', null,
   'Cross-checked via WebSearch 2026-09-12 (taxcloud.com, trykintsugi.com, numeral.com, wolterskluwer.com, eightx.co, galvix.com) -- Washington''s own Department of Revenue not independently confirmed reachable this session. Verify before relying on this for a production filing decision -- this is reference content, not tax advice.', null);
