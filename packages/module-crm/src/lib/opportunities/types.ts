export type OpportunityStatus = "open" | "won" | "lost";

/** INT-02.1's "Fulfillment Requirement Gate" -- an explicit CRM-owned classification,
 * not auto-derived and overwritten on every read (see `fulfillment.ts`'s own
 * `suggestFulfillmentRequirement()` for the deterministic *default* a user confirms or
 * overrides). Null means "not yet gated." */
export type FulfillmentRequirement = "inventory_required" | "service_only" | "product_and_service" | "fulfilled_externally" | "not_required";

/** INT-04.1's "Opportunity Requires Assessment" gate -- see `assessment.ts`'s own
 * `setAssessmentRequirement()`. Null means "not yet gated," same convention as
 * `fulfillment_requirement`. */
export type AssessmentRequirement = "none" | "remote" | "on_site" | "technical";

export type OpportunityStage = {
  id: string;
  business_id: string;
  key: string;
  name: string;
  sort_order: number;
  is_won: boolean;
  is_lost: boolean;
};

export type Opportunity = {
  id: string;
  business_id: string;
  party_id: string;
  lead_id: string | null;
  stage_id: string | null;
  status: OpportunityStatus;
  source: string;
  owner_id: string | null;
  /** CRM-04.3. Null until a founder sets it -- an unestimated opportunity contributes
   * nothing to pipeline value rather than a fabricated zero or default amount. */
  estimated_value: number | null;
  currency: string;
  probability: number | null;
  expected_close_date: string | null;
  /** CRM-05.2. The one activity currently designated this opportunity's next action --
   * owner/due date are read from that crm.activity row, not duplicated here. */
  next_action_id: string | null;
  /** CRM-11.1. The `fsm.opportunities` row `createFsmQuoteFromCrmOpportunity()` created
   * for this opportunity, once created -- the one pointer CRM stores; quote/job status
   * are always read live through the FSM contract (`getFsmQuoteStatus()`), never copied
   * here ("no duplicated quote master in CRM"). Bare id, no FK -- fsm.opportunities lives
   * in another module's schema. */
  fsm_opportunity_id: string | null;
  /** INT-02.1. Null until a human confirms or overrides the suggested default. */
  fulfillment_requirement: FulfillmentRequirement | null;
  /** INT-02.2. The Inventory sales order `createFulfillmentRequest()` created for this
   * opportunity, once requested -- same "one pointer, everything else read live" shape
   * as `fsm_opportunity_id`. Bare id, no FK -- lives in another module's schema. */
  fulfillment_request_id: string | null;
  /** INT-04.1. Null until a human confirms or overrides it -- no smart default exists
   * for this one (see `assessment.ts`'s own docstring). */
  assessment_requirement: AssessmentRequirement | null;
  /** INT-04.2. The `fsm.assessments` row `createAssessmentRequestForOpportunity()`
   * created, once requested -- same "one pointer, everything else read live" shape as
   * `fsm_opportunity_id`/`fulfillment_request_id`. Bare id, no FK -- lives in another
   * module's schema. */
  assessment_request_id: string | null;
  created_at: string;
  updated_at: string;
};

/** CRM-04.2's default pipeline: new -> qualification -> discovery -> proposal ->
 * negotiation -> won/lost. `won`/`lost` are both terminal, sitting side by side as the
 * pipeline's two possible outcomes rather than one final "closed" stage. */
export const DEFAULT_OPPORTUNITY_STAGES: { key: string; name: string; isWon?: boolean; isLost?: boolean }[] = [
  { key: "new", name: "New" },
  { key: "qualification", name: "Qualification" },
  { key: "discovery", name: "Discovery" },
  { key: "proposal", name: "Proposal" },
  { key: "negotiation", name: "Negotiation" },
  { key: "won", name: "Won", isWon: true },
  { key: "lost", name: "Lost", isLost: true },
];

/**
 * CRM-04.3: "Pipeline value is calculated consistently" / "closed-won values are
 * distinguishable from estimates" -- the one place this sum is computed, rather than
 * every consumer (page, future dashboard widget) writing its own reduce. `open` and
 * `won` are summed separately on purpose: pipeline value is a forecast of what might
 * still close, won value is what actually did -- adding them together would blend an
 * estimate with a closed fact into one meaningless number. `lost` and unestimated
 * (`estimated_value: null`) opportunities contribute to neither.
 */
export function calculatePipelineValue(opportunities: Opportunity[]): { openValue: number; wonValue: number } {
  let openValue = 0;
  let wonValue = 0;
  for (const opportunity of opportunities) {
    if (!opportunity.estimated_value) continue;
    if (opportunity.status === "open") openValue += opportunity.estimated_value;
    else if (opportunity.status === "won") wonValue += opportunity.estimated_value;
  }
  return { openValue, wonValue };
}
