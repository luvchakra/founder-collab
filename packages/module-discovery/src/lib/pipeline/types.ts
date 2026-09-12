/** DISC-OFFER-P0-10.2's own exact fourteen-stage list -- the doc's own pipeline diagram
 * (§14, DISC-OFFER-P0-10.1) collapsed to these keys 1:1: "Understand Offering" +
 * "Research Website" together map to `website_understanding`/`offering_profile` (the
 * existing `understandProduct()` does both halves in one AI call -- see the orchestrator's
 * own comment for why those two keys still get their own distinct stage rows), and
 * "Find Accounts" + "Enrich Accounts" collapse into `account_discovery` (the existing
 * `discoverProspects()` already returns enriched fields -- industry/size/location/
 * description -- for each candidate in the same call, so there is no separate
 * "enrichment" step to run afterward). Order here is execution order. */
export type PipelineStageKey =
  | "website_understanding"
  | "offering_profile"
  | "icp"
  | "buyer_personas"
  | "discovery_strategy"
  | "account_discovery"
  | "signals"
  | "signal_correlation"
  | "opportunity_scoring"
  | "why_now"
  | "research"
  | "buyer_intelligence"
  | "recommended_action"
  | "crm_handoff";

export const PIPELINE_STAGE_KEYS: PipelineStageKey[] = [
  "website_understanding",
  "offering_profile",
  "icp",
  "buyer_personas",
  "discovery_strategy",
  "account_discovery",
  "signals",
  "signal_correlation",
  "opportunity_scoring",
  "why_now",
  "research",
  "buyer_intelligence",
  "recommended_action",
  "crm_handoff",
];

export const PIPELINE_STAGE_LABEL: Record<PipelineStageKey, string> = {
  website_understanding: "Research Website",
  offering_profile: "Offering Profile",
  icp: "Build / Refine ICP",
  buyer_personas: "Identify Buyer Personas",
  discovery_strategy: "Build Discovery Strategy",
  account_discovery: "Find & Enrich Accounts",
  signals: "Collect Signals",
  signal_correlation: "Correlate Signals",
  opportunity_scoring: "Score Opportunities",
  why_now: "Generate Why Now",
  research: "Research Top Opportunities",
  buyer_intelligence: "Identify Buying Committee",
  recommended_action: "Recommend Next Action",
  crm_handoff: "Prepare CRM Handoff",
};

/** DISC-OFFER-P0-10.2's own exact six-state vocabulary. `needs_review` is defined by the
 * doc for this epic but has no producer yet in DISC-OFFER-P0-10.1's own handlers (every
 * handler here either completes or fails outright) -- DISC-OFFER-P1-02.1 "Review
 * Required Indicators" is the story that actually decides when a stage's own result is
 * uncertain enough to land there instead of `completed`. Included in the check
 * constraint now (schema-first, per this module's own established precedent -- e.g.
 * DISC-OFFER-P0-01.1 widening `products.status` ahead of 01.3 needing it) rather than
 * added later as a second migration. */
export type PipelineStageStatus = "not_started" | "running" | "completed" | "failed" | "needs_review" | "skipped";

export type PipelineStage = {
  id: string;
  workspace_id: string;
  stage_key: PipelineStageKey;
  status: PipelineStageStatus;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  error: string | null;
  last_ai_run_id: string | null;
  created_at: string;
  updated_at: string;
};
