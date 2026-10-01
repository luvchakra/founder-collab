-- E2E-DEF-001 (docs/testing/E2E_DEFECTS.md): gst.tax_rules' lineage/version uniqueness
-- did not hold for rules with no sub-national jurisdiction.
--
-- COMPLY-P0-02.3's `unique (country, regime, jurisdiction, rule_key, version)` treats
-- NULL as distinct from itself, so two rows for the same national rule (jurisdiction
-- NULL -- every IN/SG/CA GST rule seeded so far) could share a version number. The
-- as-of lookup (`order by version desc limit 1`) would then pick either row
-- arbitrarily: an ambiguous tax rate, not just a cosmetic duplicate. The original
-- migration recorded this as a known limitation, but
-- scripts/test-gst-tax-rules-rls.mjs asserts the opposite, and that assertion failing
-- has kept `npm run test:db` -- and with it every later CI step, including the
-- production build -- red on main.
--
-- NULLS NOT DISTINCT (Postgres 15+) is exactly the intended rule: NULL keeps meaning
-- "this regime has no sub-national jurisdiction concept" (no sentinel value needed),
-- while two NULL-jurisdiction rows of the same lineage and version now collide. Verified
-- on the dev project before writing this: zero existing duplicate groups, so the new
-- constraint applies cleanly. The seed migrations' `on conflict (country, regime,
-- jurisdiction, rule_key, version)` clauses keep inferring this same column list.

alter table gst.tax_rules
  drop constraint tax_rules_country_regime_jurisdiction_rule_key_version_key;

alter table gst.tax_rules
  add constraint tax_rules_country_regime_jurisdiction_rule_key_version_key
  unique nulls not distinct (country, regime, jurisdiction, rule_key, version);
