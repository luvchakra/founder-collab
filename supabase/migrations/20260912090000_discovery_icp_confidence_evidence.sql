-- DISC-OFFER-P0-13.1 "Structured Stage Outputs" -- the doc's own worked ICP example
-- (industries[]/company_size/geographies[]/technologies[]/pain_points[]/buyer_roles[]/
-- disqualifiers[]/confidence/evidence[]) names two fields `discovery.icp_profiles`
-- (20260906100000) never had: `confidence` and `evidence`. Every other field in that
-- example already exists on this table under its own name (industries, company_sizes,
-- geographies, technology, pain_points, roles, exclusions -- see icp/types.ts's own
-- comment tying each to the doc's vocabulary); this migration closes the two genuine
-- gaps rather than duplicating what's already there.
--
-- `confidence` is nullable with no default, NOT `not null default 0` (contrast
-- `website_onboarding_offering_candidates.confidence`, 09.3's own precedent, where every
-- row has always been AI-generated fresh): this column is being retrofitted onto an
-- existing table that may already hold rows created before this story, and a bare `0`
-- would misread as "generated, and the model was maximally unconfident" rather than the
-- true "never computed" -- the same "absence of evidence isn't evidence of absence"
-- precision DISC-OFFER-P0-05.2/05.5 already established for missing score components.
--
-- `evidence` is `text[]` (short quotes/paraphrases from the product profile backing this
-- ICP's own claims), not the richer `EvidenceItem` object shape (`lib/research/types.ts`)
-- used by prospect research/buyer intelligence: that shape's per-item `source_url`/
-- `observed_at`/`supporting_signal`/`source_type` fields exist to distinguish *multiple,
-- dated, first-party-vs-external* sources gathered across several calls (a live web
-- search plus a separate website fetch, DISC-OFFER-P0-12.2) -- a single-call synthesis
-- over one already-approved ProductProfile has none of that to distinguish, and forcing
-- the fuller shape here would only produce nulled-out noise. Kept as a plain `text[]` to
-- match every sibling column already on this exact table (industries/pain_points/
-- exclusions/etc.), not a new jsonb shape on a table that has never used one.
alter table discovery.icp_profiles
  add column confidence numeric check (confidence >= 0 and confidence <= 1),
  add column evidence text[] not null default '{}';
