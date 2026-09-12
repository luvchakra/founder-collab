-- WonderArc Compliance backlog, COMPLY-P1-01.6 (EU VAT Framework -- Country-Specific
-- E-Invoicing): "Country adapters must be independent." Seeds `gst.tax_rules` with each of
-- Germany/France/Belgium/Poland's own real, dated B2B e-invoicing mandate rollout schedule
-- -- the backlog's own §2 (European Union section) named these four specific mandates by
-- name and date; this migration re-verifies every one of them via WebSearch this session
-- (2026-09-12) since the backlog document itself was written some time before this run
-- (per this run's own instructions) and confirms all four are STILL CURRENT, with several
-- now more precisely dated than the backlog's own terse "2026/2027" language.
--
-- rule_key = 'einvoicing_b2b_mandate_schedule', regime = 'VAT', jurisdiction = null -- one
-- row per country, holding that country's own FULL phased rollout as a single structured
-- value (`{"phases": [...], "format": "..."}`) rather than one row per phase -- the same
-- "one rule, one compound jsonb value" shape COMPLY-P0-09.1's own GSTR-1/3B due-date rules
-- already established for a multi-part regulatory fact (Category X/Y day-of-month, QRMP
-- installment day, all inside one rule's own `value`). A country's phased schedule is one
-- LAW (or one settled regulatory roadmap), not a sequence of supersessions of the same
-- fact -- version 1 for each row below; a real future amendment (e.g. a further delay)
-- would supersede the WHOLE schedule to a new version, not add a fifth phase in place.
--
-- Each phase names its own `key`, `effectiveFrom` date, plain-language `description`, and
-- `scope` (which businesses it applies to) -- read by that country's own independent
-- eligibility function (`lib/einvoicing-{de,fr,be,pl}/mandate.ts`), never by one shared
-- cross-country determiner (backlog rule 7's own "independent" requirement applied to the
-- CONSUMER of this data, not just the adapter/submission code).
--
-- Verified via WebSearch 2026-09-12, cross-checked across multiple independent trackers per
-- country (primary government/EU sources confirmed UNREACHABLE this session --
-- bundesfinanzministerium.de, economie.gouv.fr, ec.europa.eu family all returned
-- EGRESS_BLOCKED when fetched directly):
-- - Germany: Phase 1 (all businesses must be ABLE TO RECEIVE structured e-invoices) started
--   1-Jan-2025 -- already in force as of this migration's own creation date. Phase 2
--   (businesses with prior-year turnover over EUR 800,000 must ISSUE domestic B2B
--   e-invoices) from 1-Jan-2027. Phase 3 (universal issuance, all businesses) from
--   1-Jan-2028. Format: EN 16931-compliant (XRechnung/ZUGFeRD), Peppol or direct exchange.
--   Sources: cleartax.com/de (timeline guide), marosavat.com, advisori.de, edicomgroup.com,
--   e-invoicing.org -- all independently agreeing on the three dates above. This matches
--   and refines the backlog's own §2 claim ("domestic B2B structured e-invoice rules
--   started 1 January 2025 with transition periods").
-- - France: 1-Sep-2026 confirmed as the live, NOT delayed, mandate date this session
--   (sovos.com, vatcalc.com, softco.com, vatit.com, tradeshift.com, avalara.com, vatupdate.com
--   all agree DGFiP publicly reconfirmed no postponement) -- ALL France-established,
--   VAT-liable companies must be able to RECEIVE e-invoices from that date, and large (GE)
--   /mid-sized (ETI) companies must ISSUE e-invoices and e-report from the same date; small
--   and micro businesses (PME/TPE) follow from 1-Sep-2027. A "soft enforcement" period (no
--   automatic sanctions for good-faith businesses) runs through 31-Dec-2026 -- an
--   enforcement-posture fact, not a change to the legal deadline itself, so not modeled as
--   a phase of its own. This matches the backlog's own §2 claim exactly.
-- - Belgium: confirmed LIVE since 1-Jan-2026 (ey.com, edicomgroup.com, truecommerce.com,
--   fiskaly.com, marosavat.com, banqup.com all agree) -- nearly all Belgian VAT-liable B2B
--   transactions require structured e-invoicing (issue AND receive) via Peppol/EN 16931,
--   with a 3-month tolerance period that covered Q1 2026 for businesses not yet technically
--   ready (now expired as of this migration's own creation date). A near-real-time VAT
--   e-Reporting requirement is a separately-approved draft bill targeting 1-Jan-2028. This
--   matches the backlog's own §2 claim exactly.
-- - Poland (KSeF 2.0): signed into law 27-Aug-2025 (ey.com). Large taxpayers (turnover over
--   PLN 200 million) must issue via KSeF from 1-Feb-2026; all other VAT-registered
--   businesses (excluding micro-entrepreneurs) from 1-Apr-2026; micro-entrepreneurs from
--   1-Jan-2027 (banqup.com, edicomgroup.com, dudkowiak.com, basware.com, vatupdate.com all
--   agree on this three-tier schedule). No financial penalties apply during 2026 itself
--   (an "education, not fines" grace year) -- KSeF-specific penalties (up to 100% of the
--   VAT on an invoice issued outside KSeF) begin 1-Jan-2027. This is MORE PRECISE than the
--   backlog's own terse "KSeF 2.0 rolls out in stages in 2026/2027" -- the exact tier dates
--   above supersede that description, not contradict it.

insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, effective_to, source, treatment) values
  (
    'DE', null, 'VAT', 'einvoicing_b2b_mandate_schedule',
    '{"format": "EN 16931-compliant structured e-invoice (XRechnung/ZUGFeRD), transmitted via Peppol or direct exchange", "phases": [{"key": "reception_all", "effectiveFrom": "2025-01-01", "scope": "all_businesses", "description": "All businesses must be able to RECEIVE structured e-invoices for domestic B2B transactions."}, {"key": "issuance_large", "effectiveFrom": "2027-01-01", "scope": "turnover_over_eur_800000", "thresholdEur": 800000, "description": "Businesses with prior-year turnover exceeding EUR 800,000 must ISSUE domestic B2B invoices as compliant e-invoices."}, {"key": "issuance_all", "effectiveFrom": "2028-01-01", "scope": "all_businesses", "description": "Universal domestic B2B e-invoice issuance mandate for all businesses."}]}'::jsonb,
    1, '2025-01-01', null,
    'Cross-checked via WebSearch 2026-09-12 (cleartax.com/de, marosavat.com, advisori.de, edicomgroup.com, e-invoicing.org) -- primary source (bundesfinanzministerium.de) unreachable, blocked by this session''s own network egress proxy. Verify against the current, authoritative German tax-authority publication before relying on this for a production compliance decision -- this is reference content, not tax advice.',
    null
  ),
  (
    'FR', null, 'VAT', 'einvoicing_b2b_mandate_schedule',
    '{"format": "Factur-X/UBL/CII via a Plateforme de Dématérialisation Partenaire (PDP) or the public Portail Public de Facturation (PPF)", "phases": [{"key": "reception_all", "effectiveFrom": "2026-09-01", "scope": "all_businesses", "description": "All France-established, VAT-liable businesses must be able to RECEIVE e-invoices."}, {"key": "issuance_large_mid", "effectiveFrom": "2026-09-01", "scope": "large_and_mid_sized", "description": "Large (GE) and mid-sized (ETI) companies must ISSUE e-invoices and e-report."}, {"key": "issuance_small", "effectiveFrom": "2027-09-01", "scope": "small_and_micro", "description": "Small and micro businesses (PME/TPE) must ISSUE e-invoices and e-report."}], "enforcementNote": "DGFiP soft-enforcement period (no automatic sanctions for good-faith businesses) runs through 31-Dec-2026 -- an enforcement posture, not a change to the legal deadlines above."}'::jsonb,
    1, '2026-09-01', null,
    'Cross-checked via WebSearch 2026-09-12 (sovos.com, vatcalc.com, softco.com, vatit.com, tradeshift.com, avalara.com, vatupdate.com -- all confirming DGFiP''s public "no postponement" statement) -- primary source (economie.gouv.fr) unreachable, blocked by this session''s own network egress proxy. Verify against the current, authoritative French tax-authority (DGFiP) publication before relying on this for a production compliance decision -- this is reference content, not tax advice.',
    null
  ),
  (
    'BE', null, 'VAT', 'einvoicing_b2b_mandate_schedule',
    '{"format": "Peppol network, EN 16931 standard", "phases": [{"key": "b2b_mandatory", "effectiveFrom": "2026-01-01", "scope": "all_vat_registered_businesses", "description": "Nearly all Belgian VAT-liable B2B transactions require structured e-invoicing (issue AND receive) via Peppol/EN 16931."}, {"key": "e_reporting", "effectiveFrom": "2028-01-01", "scope": "all_vat_registered_businesses", "description": "Near real-time VAT e-Reporting requirement (approved draft bill)."}], "toleranceNote": "A 3-month tolerance period covered Q1 2026 for businesses not yet technically capable of sending/receiving structured e-invoices -- now expired."}'::jsonb,
    1, '2026-01-01', null,
    'Cross-checked via WebSearch 2026-09-12 (ey.com, edicomgroup.com, truecommerce.com, fiskaly.com, marosavat.com, banqup.com) -- primary source (finances.belgium.be) not independently confirmed reachable in this sandboxed session. Verify against the current, authoritative Belgian tax-authority publication before relying on this for a production compliance decision -- this is reference content, not tax advice.',
    null
  ),
  (
    'PL', null, 'VAT', 'einvoicing_b2b_mandate_schedule',
    '{"format": "Krajowy System e-Faktur (KSeF) -- a national government platform, NOT Peppol-based", "phases": [{"key": "issuance_large_taxpayers", "effectiveFrom": "2026-02-01", "scope": "turnover_over_pln_200000000", "thresholdPln": 200000000, "description": "Large taxpayers with turnover exceeding PLN 200 million must ISSUE e-invoices via KSeF."}, {"key": "issuance_other_vat_registered", "effectiveFrom": "2026-04-01", "scope": "vat_registered_excl_micro", "description": "All other VAT-registered businesses (excluding micro-entrepreneurs) must ISSUE e-invoices via KSeF."}, {"key": "issuance_micro_entrepreneurs", "effectiveFrom": "2027-01-01", "scope": "micro_entrepreneurs", "description": "Micro-entrepreneurs must ISSUE e-invoices via KSeF."}], "enforcementNote": "No financial penalties apply during 2026 itself (an education-not-fines grace year) -- KSeF-specific penalties (up to 100% of the VAT on an invoice issued outside KSeF) begin 1-Jan-2027."}'::jsonb,
    1, '2026-02-01', null,
    'Cross-checked via WebSearch 2026-09-12 (ey.com, banqup.com, edicomgroup.com, dudkowiak.com, basware.com, vatupdate.com) -- primary source (podatki.gov.pl / ksef.podatki.gov.pl) not independently confirmed reachable in this sandboxed session. Verify against the current, authoritative Polish tax-authority publication before relying on this for a production compliance decision -- this is reference content, not tax advice.',
    null
  );
