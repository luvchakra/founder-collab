export type OpportunityStatus = "open" | "won" | "lost";

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
