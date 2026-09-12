-- WonderArc Compliance backlog, COMPLY-P1-01.4 (EU VAT Framework -- OSS/IOSS): the EU's
-- One-Stop-Shop / Import-One-Stop-Shop simplified VAT reporting schemes for cross-border
-- e-commerce. Two genuinely PAN-EU thresholds (set by EU Council directive, not by any one
-- member state's own legislature) -- seeded into the same generic `gst.tax_rules` engine
-- COMPLY-P0-02.3 built, using the `EU` two-letter sentinel `lib/compliance/eu.ts`'s own
-- `EU_WIDE_RULE_COUNTRY` documents (fits the table's own `country ~ '^[A-Z]{2}$'` check
-- constraint without being a real ISO 3166-1 country -- see that file's own comment for why
-- this is the right home for a fact that belongs to no single member state).
--
-- rule_key = 'oss_distance_selling_threshold_eur' -- the EUR 10,000/year EU-wide threshold
-- (combined intra-EU B2C distance sales of goods plus telecommunications/broadcasting/
-- electronic (TBE) services) below which a seller charges its OWN country's VAT rate on a
-- cross-border B2C sale, and above which it must charge the BUYER's country's own rate
-- (reportable via a single One-Stop-Shop return rather than registering in every buyer
-- country individually) -- `lib/eu-vat-determination/determine.ts`'s own
-- `EuVatDetermineInput.ossThresholdEur` is exactly this value, resolved by a caller and
-- passed in, never hard-coded in that function.
--
-- rule_key = 'ioss_consignment_value_threshold_eur' -- the EUR 150 per-consignment
-- intrinsic-value ceiling below which a seller importing goods FROM outside the EU to an EU
-- B2C buyer may use the Import-One-Stop-Shop scheme to collect VAT at the point of sale
-- instead of the buyer facing import VAT/customs handling on delivery. Seeded alongside the
-- OSS threshold since both are the same EU Council directive family and this build's own
-- `lib/eu-vat-determination/` has no import-side (goods entering the EU from a non-EU
-- seller) consumer yet to actually apply it against -- named here as real, source-cited
-- reference content for whichever future story builds that consumer, matching backlog rule
-- 5 ("don't implement future stories implicitly") applied to the RULE's own consumer, not
-- to publishing the regulatory fact itself.
--
-- Both took effect 1-July-2021 under EU Council Directive (EU) 2017/2455 and Implementing
-- Regulation (EU) 2019/2026 (the "VAT e-commerce package") -- verified via WebSearch
-- 2026-09-12 (hellotax.com, taxology.co, vatupdate.com, norman.finance, polishtax.com, all
-- independently agreeing on the EUR 10,000 combined threshold and its 1-July-2021
-- commencement; the EUR 150 IOSS consignment-value ceiling is the same package's own
-- companion figure, well-established across the same body of secondary VAT-compliance
-- literature). Primary source (taxation-customs.ec.europa.eu) confirmed UNREACHABLE this
-- session (EGRESS_BLOCKED) -- same limitation as the member-state rate seed migration
-- immediately before this one; each row's own `source` column says so explicitly.

insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, effective_to, source, treatment) values
  (
    'EU', null, 'VAT', 'oss_distance_selling_threshold_eur',
    '{"thresholdEur": 10000, "appliesTo": "Combined annual EU-wide intra-EU B2C distance sales of goods plus telecommunications/broadcasting/electronic (TBE) services, per seller", "label": "EU-wide OSS distance-selling threshold"}'::jsonb,
    1, '2021-07-01', null,
    'Cross-checked via WebSearch 2026-09-12 (hellotax.com, taxology.co, vatupdate.com, norman.finance, polishtax.com) -- EU Council Directive (EU) 2017/2455 and Implementing Regulation (EU) 2019/2026, effective 1-July-2021; primary source (taxation-customs.ec.europa.eu) unreachable, blocked by this session''s own network egress proxy. Verify against the current, authoritative EU Commission publication before relying on this for a production filing decision -- this is reference content, not tax advice.',
    null
  ),
  (
    'EU', null, 'VAT', 'ioss_consignment_value_threshold_eur',
    '{"thresholdEur": 150, "appliesTo": "Per-consignment intrinsic value ceiling for goods imported from outside the EU to an EU B2C buyer, below which the seller may use the Import-One-Stop-Shop scheme", "label": "EU-wide IOSS consignment-value threshold"}'::jsonb,
    1, '2021-07-01', null,
    'Cross-checked via WebSearch 2026-09-12 (hellotax.com, taxology.co, en.wikipedia.org/wiki/Import_One-Stop_Shop) -- same EU Council Directive (EU) 2017/2455 / Implementing Regulation (EU) 2019/2026 "VAT e-commerce package", effective 1-July-2021; primary source (taxation-customs.ec.europa.eu) unreachable, blocked by this session''s own network egress proxy. Verify against the current, authoritative EU Commission publication before relying on this for a production filing decision -- this is reference content, not tax advice.',
    null
  );
