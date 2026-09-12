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
  /** DISC-OFFER-P0-10.2: how many times this stage has actually been run -- 0 before
   * its first run, 1 after, 2 after one retry, and so on. "Reruns create new versions
   * rather than silently destroying history" -- each prior attempt's own outcome is
   * preserved as its own `PipelineStageRun` row rather than overwritten in place. */
  version: number;
  /** DISC-OFFER-P0-10.2's own named field -- deliberately unpopulated (null) until
   * DISC-OFFER-P0-11.3's "Stage Dependency Graph" gives it something real to record
   * (which upstream stage's own version this run consumed). See this table's own
   * migration comment. */
  input_version: number | null;
  output_version: number | null;
  created_at: string;
  updated_at: string;
};

/** DISC-OFFER-P0-10.2: one immutable row per finished attempt at a stage -- what a
 * retry would otherwise have silently overwritten on the current-state row above. Only
 * terminal outcomes are ever recorded (a stage that's still `running` has nothing to
 * preserve yet). */
export type PipelineStageRun = {
  id: string;
  workspace_id: string;
  stage_key: PipelineStageKey;
  version: number;
  status: "completed" | "failed" | "skipped";
  started_at: string;
  completed_at: string;
  error: string | null;
  created_at: string;
  /** DISC-OFFER-P0-14.1: which `PipelineRun` (below), if any, drove this particular
   * attempt -- null for a stage run/retried with no enclosing "run" (see that table's
   * own migration comment for why this stays optional). */
  run_id: string | null;
};

/** DISC-OFFER-P0-14.1's own exact three trigger points that start a "run" -- the main
 * "Run AI Discovery"/"Resume AI Discovery" CTA (DISC-OFFER-P0-10.1), a per-group "Retry"
 * on a failed stage (DISC-OFFER-P0-10.3), and the auto-resume after "Save & Run
 * Downstream" on an edited stage (DISC-OFFER-P0-11.1/11.2). Not an open-ended free-text
 * field -- every call site in this module is one of these three, and a run whose trigger
 * doesn't match any of them would be a real bug worth failing loudly on (the check
 * constraint in this table's own migration), not silently accepted. */
export type PipelineRunTrigger = "run_ai_discovery_cta" | "retry_failed_stage" | "save_and_run_downstream";

export const PIPELINE_RUN_TRIGGERS: PipelineRunTrigger[] = [
  "run_ai_discovery_cta",
  "retry_failed_stage",
  "save_and_run_downstream",
];

export type PipelineRunStatus = "running" | "completed" | "failed";

/** DISC-OFFER-P0-14.1: "Discovery Run History" -- one row per client-driven walk through
 * some contiguous suffix of the fourteen technical stages (`run-ai-discovery-panel.tsx`'s
 * own `runFrom()`), distinct from `PipelineStageRun` above (one row per *individual
 * technical stage* attempt). `offering_id` in the doc's own field list is `workspace_id`
 * here -- see this table's own migration comment for why. "AI provider/model where
 * applicable" and "stages executed" are deliberately not columns here -- they're derived
 * at read time from `discovery.ai_runs` (via `listAiRunsInWindow`) and
 * `discovery.pipeline_stage_runs` (via `listPipelineStageRunsForRun`) respectively, same
 * migration comment. */
export type PipelineRun = {
  id: string;
  workspace_id: string;
  trigger: PipelineRunTrigger;
  starting_stage: PipelineStageKey;
  status: PipelineRunStatus;
  started_at: string;
  /** Null while the run is still in progress -- "no false precision" (this run's own
   * completion time is genuinely unknown until it actually finishes, not "now" and not
   * `started_at`). */
  completed_at: string | null;
  /** The terminal error that actually stopped this run (the client's own loop breaks on
   * the first stage that doesn't succeed) -- null for a run still in progress or one that
   * completed every stage it attempted. */
  error: string | null;
  created_at: string;
};
