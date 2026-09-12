-- WonderArc Compliance backlog, COMPLY-P1-01.2 (EU VAT Framework -- Member State Country
-- Packs): the backlog's own initial focus list (docs/plan/11-COMPLIANCE-GLOBAL-TAX-BACKLOG
-- .md §7) -- Germany, France, Belgium, Poland, Italy. Populates `gst.tax_rules` (the same
-- generic, versioned, source-cited engine COMPLY-P0-02.3 built and COMPLY-P0-04.7 already
-- populated for India) with each country's own standard and reduced VAT rate(s) -- never a
-- new table, never a hard-coded UI value (this session's own single most-repeated
-- instruction).
--
-- Checked `docs/plan/00-MASTER-PLAN.md` §5 and this backlog's own §4/§5 first (backlog rule
-- 1/5, CLAUDE.md non-negotiable #5): `gst.tax_rules` already IS the generic
-- country/regime/jurisdiction/rule_key/value/version/effective_from/effective_to/source
-- shape every country rule must have -- this story only adds ROWS, exactly the same shape
-- India's own `20260912000000_gst_tax_rules_india_rate_slabs_seed.sql` already established
-- (data-only migration, no DDL, direct INSERT rather than the app-level
-- `publishTaxRule`/`supersedeTaxRule` helpers -- those gate on `isRegimeSupported`, which
-- requires the country to already be `"supported"` in `lib/compliance/countries.ts`, a
-- chicken-and-egg this migration -- run before that flag flips in the same commit -- breaks
-- the same way India's own first rate-slab seed did).
--
-- rule_key = 'vat_standard_rate' -- a single ad-valorem percentage (unlike India's own
-- multi-slab 'standard_rate_slabs', EU VAT genuinely has exactly ONE standard rate per
-- member state). rule_key = 'vat_reduced_rates' -- the set of reduced/super-reduced/zero
-- rates that country's own law recognizes, as a labelled list (a country's own reduced-rate
-- CATEGORY-to-rate mapping, e.g. "which specific goods get which reduced rate," is real
-- detail no consumer of this generic engine needs yet -- COMPLY-P0-02.4's own
-- `TreatmentCode` catalog already has `"reduced"` as a classification; which numeric rate a
-- specific reduced-rated line item takes is exactly the kind of per-item decision this
-- module has never modeled even for India's own multiple GST slabs, so not invented here
-- either). `regime` = 'VAT', matching each of these five countries' own single-regime
-- catalog entry in `lib/compliance/countries.ts`. `jurisdiction` = null -- EU VAT, like
-- India's own umbrella rate-slab rule, has no sub-national jurisdiction concept at the
-- rate-lookup level (a member state's VAT rate does not vary by region).
--
-- **A real, honest limitation named rather than silently worked around (backlog rule 11,
-- "never claim more than is actually established")**: this session's own network egress is
-- blocked for every EU/national tax-authority domain actually tried
-- (taxation-customs.ec.europa.eu, ec.europa.eu, bundesfinanzministerium.de,
-- economie.gouv.fr, and by clear extension the Belgian/Polish/Italian equivalents) --
-- confirmed live via repeated `EGRESS_BLOCKED` responses, the exact same "GSTN docs
-- blocked" pattern this run's own instructions warned to expect. Every rate figure below is
-- therefore sourced from MULTIPLE independently-agreeing secondary VAT-compliance trackers
-- (the same evidentiary tier COMPLY-P0-09.1's own GSTR due-date research already used when
-- a primary government source wasn't reachable), not a primary EU/national legal text this
-- session could read directly -- and each row's own `source` column says so explicitly.
-- Likewise, the exact historical date each country's CURRENT standard/reduced rate
-- structure first took effect was not independently re-verified against a primary source
-- this session could reach -- `effective_from` below is deliberately a recent, safely
-- conservative anchor date (2024-01-01, well after every country's own last well-known
-- headline rate change) confirming these are the rates ACTUALLY IN EFFECT as of this
-- migration's own creation date (2026-09-12), not a claim about precisely when the
-- structure began. A caller looking up an EU VAT rate for a date before 2024-01-01 gets
-- `null` (no version covers it) rather than a guessed value -- the same "never guess a
-- fallback" posture `getEffectiveIndiaGstRateSlabs` already established.
--
-- Rates verified via WebSearch this session (2026-09-12), cross-checked across multiple
-- named trackers per country:
-- - Germany: standard 19%, reduced 7% (basic foodstuffs, books, newspapers, public
--   transport, cultural services; restaurant/catering FOOD also 7% from 1-Jan-2026 under
--   the Steueränderungsgesetz 2025, beverages remain 19%) -- cleartax.com/de,
--   numeral.com, norman.finance, vattoolkit.com, vatupdate.com all agree on 19%/7%.
-- - France: standard 20%, reduced 10% (intermediate: passenger transport, accommodation,
--   restaurants, renovation work), 5.5% (groceries, books, water/energy for domestic use),
--   2.1% (super-reduced: press, certain cultural items) -- cleartax.com/fr, avalara.com,
--   eclear.com, taxenlight.com all agree on 20%/10%/5.5%/2.1%.
-- - Belgium: standard 21%, reduced 12% and 6% -- lexgo.be, bdo.global, numeral.com,
--   taxenlight.com, vatpad.com all agree on 21%/12%/6%. Note (context, not modeled as a
--   rate-list change -- see comment above): Belgium's own 2026-2029 Budget agreement moves
--   hotel/accommodation, sports & entertainment tickets, and take-away meals/non-alcoholic
--   beverages from the 6% bracket to the 12% bracket effective 1-March-2026, and pesticides
--   from 12% to the standard 21% -- a category-to-bracket reclassification, not a change to
--   the set of rates {21, 12, 6} itself, so not modeled as a new rule version here.
-- - Poland: standard 23%, reduced 8% (hotels, restaurant meals excl. alcohol, domestic
--   transport, pharmaceuticals, residential construction), 5% (unprocessed food, baby food,
--   children's car seats, books/e-books), 0% (exports and qualifying intra-EU B2B supplies)
--   -- eurofiscalis.com, numeral.com, globalvatcompliance.com, poland.gg, vattoolkit.com all
--   agree on 23%/8%/5%/0%.
-- - Italy: standard 22%, reduced 10% (restaurants, hotels, household energy), 5% (selected
--   foods and social services), 4% (bread, milk, books, newspapers) -- numeral.com,
--   amavat.eu, vatupdate.com, vattoolkit.com, taxesledger.com all agree on 22%/10%/5%/4%.
--
-- Every row's own `source` text carries the same "verify against the current, authoritative
-- [country] tax-authority publication before relying on this for a production filing
-- decision" caveat COMPLY-P0-04.7's own India seed already established -- this migration's
-- job is real, source-cited reference content demonstrating the generic engine works for a
-- second regime family, not this platform's own tax-law authority (backlog rule 11 / the
-- module-wide disclaimer at the end of the backlog document itself).

insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, effective_to, source, treatment) values
  (
    'DE', null, 'VAT', 'vat_standard_rate',
    '{"ratePercent": 19, "label": "Standard VAT rate (Regelsteuersatz)"}'::jsonb,
    1, '2024-01-01', null,
    'Cross-checked via WebSearch 2026-09-12 (cleartax.com/de, numeral.com, norman.finance, vattoolkit.com, vatupdate.com) -- primary source (bundesfinanzministerium.de) unreachable, blocked by this session''s own network egress proxy. Verify against the current, authoritative German tax-authority publication before relying on this for a production filing decision -- this is reference content, not tax advice.',
    'standard'
  ),
  (
    'DE', null, 'VAT', 'vat_reduced_rates',
    '{"rates": [{"ratePercent": 7, "label": "Reduced rate: basic foodstuffs, books, newspapers, public transport, cultural services; restaurant/catering food from 1-Jan-2026 (beverages remain 19%)"}], "label": "Reduced VAT rates"}'::jsonb,
    1, '2024-01-01', null,
    'Cross-checked via WebSearch 2026-09-12 (cleartax.com/de, numeral.com, norman.finance, vattoolkit.com, vatupdate.com, marosavat.com for the restaurant-food carve-in effective 1-Jan-2026 under the Steueränderungsgesetz 2025) -- primary source (bundesfinanzministerium.de) unreachable, blocked by this session''s own network egress proxy. Verify against the current, authoritative German tax-authority publication before relying on this for a production filing decision -- this is reference content, not tax advice.',
    'reduced'
  ),
  (
    'FR', null, 'VAT', 'vat_standard_rate',
    '{"ratePercent": 20, "label": "Standard VAT rate (taux normal)"}'::jsonb,
    1, '2024-01-01', null,
    'Cross-checked via WebSearch 2026-09-12 (cleartax.com/fr, avalara.com, eclear.com, taxenlight.com) -- primary source (economie.gouv.fr) unreachable, blocked by this session''s own network egress proxy. Verify against the current, authoritative French tax-authority publication before relying on this for a production filing decision -- this is reference content, not tax advice.',
    'standard'
  ),
  (
    'FR', null, 'VAT', 'vat_reduced_rates',
    '{"rates": [{"ratePercent": 10, "label": "Intermediate rate (taux intermédiaire): passenger transport, accommodation, restaurants, dwelling renovation/maintenance"}, {"ratePercent": 5.5, "label": "Reduced rate (taux réduit): groceries, books, water, domestic gas/electricity"}, {"ratePercent": 2.1, "label": "Super-reduced rate (taux particulier): press/newspapers, certain cultural and medical items"}], "label": "Reduced VAT rates"}'::jsonb,
    1, '2024-01-01', null,
    'Cross-checked via WebSearch 2026-09-12 (cleartax.com/fr, avalara.com, eclear.com, taxenlight.com) -- primary source (economie.gouv.fr) unreachable, blocked by this session''s own network egress proxy. Verify against the current, authoritative French tax-authority publication before relying on this for a production filing decision -- this is reference content, not tax advice.',
    'reduced'
  ),
  (
    'BE', null, 'VAT', 'vat_standard_rate',
    '{"ratePercent": 21, "label": "Standard VAT rate"}'::jsonb,
    1, '2024-01-01', null,
    'Cross-checked via WebSearch 2026-09-12 (lexgo.be, bdo.global, numeral.com, taxenlight.com, vatpad.com) -- primary source (finances.belgium.be) not independently confirmed reachable in this sandboxed session. Verify against the current, authoritative Belgian tax-authority publication before relying on this for a production filing decision -- this is reference content, not tax advice.',
    'standard'
  ),
  (
    'BE', null, 'VAT', 'vat_reduced_rates',
    '{"rates": [{"ratePercent": 12, "label": "Reduced rate (12%): includes hotel/similar accommodation, sports & entertainment tickets, and take-away meals/non-alcoholic beverages as of the 1-March-2026 bracket reclassification (Belgium 2026-2029 Budget agreement)"}, {"ratePercent": 6, "label": "Reduced rate (6%): essentials -- most foodstuffs, water, pharmaceuticals, books"}], "label": "Reduced VAT rates"}'::jsonb,
    1, '2024-01-01', null,
    'Cross-checked via WebSearch 2026-09-12 (lexgo.be, bdo.global, numeral.com, taxenlight.com, vatpad.com, meridianglobalservices.com for the 1-March-2026 bracket reclassification) -- primary source (finances.belgium.be) not independently confirmed reachable in this sandboxed session. Verify against the current, authoritative Belgian tax-authority publication before relying on this for a production filing decision -- this is reference content, not tax advice.',
    'reduced'
  ),
  (
    'PL', null, 'VAT', 'vat_standard_rate',
    '{"ratePercent": 23, "label": "Standard VAT rate"}'::jsonb,
    1, '2024-01-01', null,
    'Cross-checked via WebSearch 2026-09-12 (eurofiscalis.com, numeral.com, globalvatcompliance.com, poland.gg, vattoolkit.com) -- primary source (podatki.gov.pl) not independently confirmed reachable in this sandboxed session. Verify against the current, authoritative Polish tax-authority publication before relying on this for a production filing decision -- this is reference content, not tax advice.',
    'standard'
  ),
  (
    'PL', null, 'VAT', 'vat_reduced_rates',
    '{"rates": [{"ratePercent": 8, "label": "Reduced rate: hotel stays, restaurant meals (excl. alcohol), domestic transport, pharmaceuticals, residential construction"}, {"ratePercent": 5, "label": "Reduced rate: unprocessed food, baby food, children''s car seats, books/e-books"}, {"ratePercent": 0, "label": "Zero rate: exports and qualifying intra-EU B2B supplies"}], "label": "Reduced VAT rates"}'::jsonb,
    1, '2024-01-01', null,
    'Cross-checked via WebSearch 2026-09-12 (eurofiscalis.com, numeral.com, globalvatcompliance.com, poland.gg, vattoolkit.com) -- primary source (podatki.gov.pl) not independently confirmed reachable in this sandboxed session. Verify against the current, authoritative Polish tax-authority publication before relying on this for a production filing decision -- this is reference content, not tax advice.',
    'reduced'
  ),
  (
    'IT', null, 'VAT', 'vat_standard_rate',
    '{"ratePercent": 22, "label": "Standard VAT rate (aliquota ordinaria)"}'::jsonb,
    1, '2024-01-01', null,
    'Cross-checked via WebSearch 2026-09-12 (numeral.com, amavat.eu, vatupdate.com, vattoolkit.com, taxesledger.com) -- primary source (agenziaentrate.gov.it) not independently confirmed reachable in this sandboxed session. Verify against the current, authoritative Italian tax-authority publication before relying on this for a production filing decision -- this is reference content, not tax advice.',
    'standard'
  ),
  (
    'IT', null, 'VAT', 'vat_reduced_rates',
    '{"rates": [{"ratePercent": 10, "label": "Reduced rate: restaurants, hotels, household energy"}, {"ratePercent": 5, "label": "Reduced rate: selected foods and social services"}, {"ratePercent": 4, "label": "Super-reduced rate: bread, milk, books, newspapers"}], "label": "Reduced VAT rates"}'::jsonb,
    1, '2024-01-01', null,
    'Cross-checked via WebSearch 2026-09-12 (numeral.com, amavat.eu, vatupdate.com, vattoolkit.com, taxesledger.com) -- primary source (agenziaentrate.gov.it) not independently confirmed reachable in this sandboxed session. Verify against the current, authoritative Italian tax-authority publication before relying on this for a production filing decision -- this is reference content, not tax advice.',
    'reduced'
  );
