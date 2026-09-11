/** DISC-OFFER-P0-05.1: "Discovery Opportunity Model" -- a specific, time-bound
 * buying-signal moment for one prospect against one offering, distinct from the
 * prospect's own persistent qualification state (`prospects.status`). A prospect can
 * have several opportunities over time (e.g. one from a "Recently Funded" discovery
 * definition, a separate later one from "Hiring Relevant Roles"). */
export type OpportunityStatus = "new" | "reviewing" | "action_required" | "watching" | "sent_to_crm" | "dismissed" | "expired";

export const OPPORTUNITY_STATUS_LABEL: Record<OpportunityStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  action_required: "Action required",
  watching: "Watching",
  sent_to_crm: "Sent to CRM",
  dismissed: "Dismissed",
  expired: "Expired",
};

export type OpportunityPriority = "high" | "medium" | "low";
export type OpportunityConfidence = "low" | "medium" | "high";

export type Opportunity = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  discovery_definition_id: string | null;
  score: number | null;
  priority: OpportunityPriority;
  why_them: string | null;
  why_now: string | null;
  recommended_action: string | null;
  confidence: OpportunityConfidence;
  status: OpportunityStatus;
  evidence_count: number;
  created_at: string;
  updated_at: string;
  last_evaluated_at: string | null;
  /** DISC-OFFER-P0-05.2's own score-component breakdown -- see scoring.ts. */
  icp_fit_score: number | null;
  buyer_fit_score: number | null;
  need_fit_score: number | null;
  timing_score: number | null;
  signal_strength_score: number | null;
  contactability_score: number | null;
  evidence_confidence_score: number | null;
  score_reason: string | null;
  /** DISC-OFFER-P0-05.3: which `discovery.signal_correlations` row (if any) most
   * recently justified this opportunity's `signal_strength_score` -- see
   * `attachSignalCorrelation` in mutations.ts. Soft reference, same "on delete set
   * null" treatment as `discovery_definition_id`. */
  signal_correlation_id: string | null;
  /** DISC-OFFER-P0-05.4's own "Why Now" outputs -- `why_now` above (05.1) already
   * carries the summary text, reused as-is; these two are the genuinely new fields.
   * `why_now_confidence` is distinct from the opportunity's own overall `confidence`
   * above (05.2's, which reflects score-component completeness, not timing-claim
   * quality specifically) -- see `computeWhyNow` in why-now.ts. */
  timing_strength: OpportunityConfidence | null;
  why_now_confidence: OpportunityConfidence;
};
