-- DISC-OFFER-P0-05.2: "Opportunity Score" -- "Display score components" means the seven
-- inputs the doc lists (ICP fit, buyer fit, need/problem fit, timing, signal strength,
-- contactability, evidence confidence) are stored explicitly, not just a single opaque
-- overall number. Each is nullable: an unpopulated component is a real, displayable
-- "not yet evaluated" state (matches "No false precision" -- see scoring.ts), not
-- defaulted to 0 (which would silently drag the average down as if it were evidence of a
-- poor fit rather than an absence of evidence). `opportunities.score` itself already
-- exists (05.1) as the overall computed figure.
alter table discovery.opportunities
  add column icp_fit_score integer check (icp_fit_score is null or (icp_fit_score between 0 and 100)),
  add column buyer_fit_score integer check (buyer_fit_score is null or (buyer_fit_score between 0 and 100)),
  add column need_fit_score integer check (need_fit_score is null or (need_fit_score between 0 and 100)),
  add column timing_score integer check (timing_score is null or (timing_score between 0 and 100)),
  add column signal_strength_score integer check (signal_strength_score is null or (signal_strength_score between 0 and 100)),
  add column contactability_score integer check (contactability_score is null or (contactability_score between 0 and 100)),
  add column evidence_confidence_score integer check (evidence_confidence_score is null or (evidence_confidence_score between 0 and 100)),
  add column score_reason text;
