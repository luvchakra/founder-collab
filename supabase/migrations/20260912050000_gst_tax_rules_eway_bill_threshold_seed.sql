-- WonderArc Compliance backlog, COMPLY-P0-06.1 (E-Way Bill Eligibility Engine): "Determine
-- whether e-way bill applies." Populates `gst.tax_rules` with the consignment-value
-- threshold that decides whether a movement of goods requires an e-way bill at all -- as a
-- real, versioned, source-cited lineage, following the exact same data-only-migration-seed
-- precedent COMPLY-P0-04.7/05.1/05.5 already established.
--
-- Researched via web search before writing (backlog rule 6, "country rules must be
-- versioned and source-referenced"), not assumed from memory:
--
-- Rule 138(1) of the CGST Rules, 2017 was substituted by CBIC Notification No. 12/2018-
-- Central Tax, dated 07-Mar-2018, and CBIC Notification No. 15/2018-Central Tax, dated
-- 23-Mar-2018, appointed 01-Apr-2018 as the date those e-way-bill provisions came into
-- force nationwide for inter-state movement of goods with consignment value exceeding
-- ₹50,000. This ₹50,000 threshold has not changed since and is confirmed, per this
-- session's own search, still the threshold in effect as of 2026 -- one version only, no
-- supersede needed yet.
--
-- `rule_key = 'eway_bill_consignment_value_threshold_inr'` -- `value.thresholdInr` is a
-- plain integer (rupees), same convention as `einvoice_turnover_threshold_inr`. `treatment`
-- is null -- an eligibility threshold, not a supply's tax treatment classification.
-- `jurisdiction` is null -- this is the CENTRAL/common threshold that applies uniformly to
-- all inter-state movement and (per this same search) is what "most states currently
-- follow" for intra-state movement too. Real state-specific intra-state VARIATIONS exist
-- (several states have at times set a different intra-state threshold, and this session's
-- own search turned up at least one, West Bengal, changing its own intra-state threshold
-- as recently as 01-Jun-2026) -- modeling those per-state overrides is deliberately NOT
-- done here (documented, extensible gap, not a silent omission): COMPLY-P0-02.2's own
-- jurisdiction catalog already has all 36 India states/UTs to key such overrides against,
-- and COMPLY-P0-02.3's own `getEffectiveTaxRule` deliberately does not fall back from a
-- jurisdiction-specific rule to a null/national one -- so a future story adding real,
-- individually-sourced state override rows (one `jurisdiction` per state that actually
-- differs) would need no schema change, only new seed rows and a jurisdiction-aware lookup
-- in application code neither this table nor this story invents speculatively now.
--
-- This row's own `source` text carries the same "verify against the current, authoritative
-- CBIC notification before relying on this for a production filing/obligation decision --
-- this is reference content, not tax advice" caveat every prior rule seed in this epic
-- uses (backlog rule 11/12).

insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, effective_to, source, treatment) values
  (
    'IN', null, 'GST', 'eway_bill_consignment_value_threshold_inr',
    '{"thresholdInr": 50000, "label": "E-Way Bill required above ₹50,000 consignment value"}'::jsonb,
    1, '2018-04-01', null,
    'CGST Rule 138(1), substituted by CBIC Notification No. 12/2018-Central Tax (07-Mar-2018); CBIC Notification No. 15/2018-Central Tax (23-Mar-2018) appointed 01-Apr-2018 as the date e-way-bill provisions came into force nationwide for inter-state movement of goods with consignment value exceeding ₹50,000 -- unchanged and still in effect as of this row''s own creation. Verify against the current, authoritative CBIC notification (and any state-specific intra-state variation, not modeled by this row) before relying on this for a production obligation decision -- this is reference content, not tax advice.',
    null
  );
