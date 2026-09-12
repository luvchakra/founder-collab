-- WonderArc Compliance backlog, COMPLY-P0-10.5 (Retention Rules): "Retention must be
-- country/regime-specific." A versioned, source-cited rule for how long GST records must
-- be kept, plus the `retention_until` column on `gst.compliance_evidence`
-- (COMPLY-P0-10.1's own migration comment named this exact follow-up: "adding it now,
-- before this story's own versioned retention rule exists, would mean guessing a number
-- this story has no rule to compute it from").
--
-- Research, not assumption (backlog rule 6): WebSearched Section 36 of the CGST Act,
-- 2017 before writing this. Confirmed across taxguru.in, the official CBIC tax
-- repository (taxinformation.cbic.gov.in), gstgyaan.com and aubsp.com, all independently
-- agreeing: every registered person must retain accounts/records for a MINIMUM of 72
-- months (6 years) from the due date of furnishing the ANNUAL RETURN (GSTR-9) for the
-- relevant financial year. A separate, longer-if-applicable clause extends retention to
-- one year after the final disposal of any appeal/revision/proceeding/investigation the
-- records relate to, whichever is LATER -- this migration does NOT model that extension
-- (this platform has no dispute/litigation-tracking concept anywhere to know whether a
-- given piece of evidence is even subject to one), a real, named limitation rather than a
-- silently-assumed-safe simplification.
--
-- `rule_key = 'gst_record_retention_months'` -- `value` carries the base period
-- (`months: 72`) and a `basis` string (`'annual_return_due_date'`) naming what the
-- months are counted FROM, since a bare number alone would not tell a future reader (or
-- this module's own `computeGstRetentionUntil`) what to add it to.
--
-- `gst.compliance_evidence.retention_until` is nullable and computed ONCE, at evidence-
-- creation time, from whichever financial year the caller declares the evidence
-- pertains to -- never recomputed live, matching backlog rule 13's "preserve historical
-- filing/evidence state" applied to a retention date the way COMPLY-P0-02.5 already
-- applies it to a tax determination: if the underlying rule is later amended (a real,
-- if rare, possibility -- CBIC does occasionally extend retention requirements), an
-- already-computed evidence row's own retention date should not silently drift out from
-- under a business that already knows what date it was told to keep the record until.
-- `null` means "not yet computed" (the caller did not declare which financial year this
-- evidence pertains to at upload time), never "no retention requirement" -- GST evidence
-- always has SOME retention requirement under Section 36; a null value here is a gap to
-- fill in, not a real answer.

insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, effective_to, source, treatment) values
  (
    'IN', null, 'GST', 'gst_record_retention_months',
    '{"months": 72, "basis": "annual_return_due_date", "label": "GST records: retain 72 months from the annual return due date"}'::jsonb,
    1, '2017-07-01', null,
    'Section 36 of the CGST Act, 2017: every registered person must retain accounts and records for a minimum of 72 months (6 years) from the due date of furnishing the annual return (GSTR-9) for the relevant financial year. A separate clause extends retention to one year after final disposal of any appeal/revision/proceeding/investigation the records relate to, whichever is later -- NOT modeled by this rule''s own value (this platform has no dispute-tracking concept to know whether that clause applies to a given record); a real, named limitation, not a silent simplification. Confirmed via taxguru.in, the official CBIC tax repository (taxinformation.cbic.gov.in), gstgyaan.com and aubsp.com as of this session (2026-09-12), all independently agreeing. Effective from GST''s own commencement (01-Jul-2017) -- Section 36 has been part of the CGST Act since enactment, no amendment to the 72-month figure found. Verify against the current, authoritative CBIC text before relying on this for a production retention decision -- this is reference content, not tax advice.',
    null
  );

alter table gst.compliance_evidence add column retention_until date;

comment on column gst.compliance_evidence.retention_until is
  'COMPLY-P0-10.5: computed once at creation from the gst_record_retention_months rule '
  'and the caller-declared financial year this evidence pertains to. Null means "not yet '
  'computed" (no financial year was declared at upload time), never "no retention '
  'requirement."';
