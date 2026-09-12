-- WonderArc Compliance backlog, COMPLY-P0-06.2 (Movement Data): the "distance" half of
-- this story needs a real, versioned, source-cited rule for how many kilometers of
-- movement one day of e-way bill validity covers -- Rule 138(10) of the CGST Rules, 2017.
-- Same data-only-migration-seed precedent COMPLY-P0-04.7/05.1/05.5/06.1 already
-- established.
--
-- Researched via web search before writing (backlog rule 6, "country rules must be
-- versioned and source-referenced"), not assumed from memory. Confirmed across multiple
-- independent sources (taxguru.in, a2ztaxcorp.com, caclubindia.com, gstextract.com,
-- simpletaxindia.net -- all describing the same 2020 amendment consistently):
--
-- Version 1 -- Rule 138(10) as originally enacted (CGST Rules, 2017, in force
-- 01-Apr-2018 per the same Notification No. 15/2018-Central Tax already cited by
-- COMPLY-P0-06.1's own threshold seed): one day of validity per 100 km (or part thereof)
-- for cargo other than Over Dimensional Cargo (ODC), and one day per 20 km (or part
-- thereof) for ODC -- ODC meaning a cargo carried as a single indivisible unit exceeding
-- the dimensional limits prescribed under Rule 93 of the Central Motor Vehicle Rules,
-- 1989.
--
-- Version 2 -- Rule 138(10) as amended by the CGST (Fourteenth Amendment) Rules, 2020
-- (CBIC Notification No. 94/2020-Central Tax, dated 22-Dec-2020), effective 01-Jan-2021:
-- the non-ODC figure widened from 100 km/day to 200 km/day; the ODC figure (20 km/day) is
-- UNCHANGED by this amendment -- multiple sources describe only the non-ODC distance
-- changing. This is the version still in effect as of this session's own "today"
-- (2026-09-12); no further amendment to either figure was found.
--
-- `rule_key = 'eway_bill_validity_km_per_day'` -- `value` carries both figures together
-- (`normalKmPerDay`, `odcKmPerDay`), since a validity computation always needs to know
-- which one applies to the specific movement's own vehicle/cargo type, not either number
-- in isolation. `jurisdiction` is null -- this is a central, uniform rule with no
-- state-specific variation reported anywhere in this session's research (unlike
-- COMPLY-P0-06.1's own consignment-value threshold, which does have documented
-- state-specific intra-state variants). `treatment` is null -- a validity-period
-- computation rule, not a supply's tax treatment classification.
--
-- Same "verify against the current, authoritative CBIC notification before relying on
-- this for a production filing/obligation decision -- this is reference content, not tax
-- advice" caveat as every other seeded rule row in this module.

insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, effective_to, source, treatment) values
  (
    'IN', null, 'GST', 'eway_bill_validity_km_per_day',
    '{"normalKmPerDay": 100, "odcKmPerDay": 20, "label": "E-Way Bill validity: 1 day per 100 km (non-ODC) / 20 km (ODC)"}'::jsonb,
    1, '2018-04-01', '2021-01-01',
    'CGST Rule 138(10), as originally enacted (in force 01-Apr-2018 per CBIC Notification No. 15/2018-Central Tax): one day of e-way bill validity per 100 km (or part thereof) for cargo other than Over Dimensional Cargo (ODC), and one day per 20 km (or part thereof) for ODC. Superseded 01-Jan-2021 by CBIC Notification No. 94/2020-Central Tax. Verify against the current, authoritative CBIC notification before relying on this for a production obligation decision -- this is reference content, not tax advice.',
    null
  ),
  (
    'IN', null, 'GST', 'eway_bill_validity_km_per_day',
    '{"normalKmPerDay": 200, "odcKmPerDay": 20, "label": "E-Way Bill validity: 1 day per 200 km (non-ODC) / 20 km (ODC)"}'::jsonb,
    2, '2021-01-01', null,
    'CGST Rule 138(10), as amended by the CGST (Fourteenth Amendment) Rules, 2020 -- CBIC Notification No. 94/2020-Central Tax, dated 22-Dec-2020, effective 01-Jan-2021: widened the non-ODC validity distance from 100 km/day to 200 km/day (the ODC figure of 20 km/day is unchanged by this amendment). Confirmed still current as of this row''s own creation (2026-09-12) -- no later amendment found. Verify against the current, authoritative CBIC notification before relying on this for a production obligation decision -- this is reference content, not tax advice.',
    null
  );
