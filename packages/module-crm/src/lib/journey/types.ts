/**
 * INT-01.1's own vocabulary -- shared by the resolver (queries.ts) and anything that
 * renders its result (the opportunity detail page's compact journey badge row).
 */
export type JourneyStageStatus = "ok" | "warning" | "blocked" | "not_available" | "not_applicable";

export type JourneyModuleSection = {
  status: JourneyStageStatus;
  /** Short plain-language label, e.g. "Awaiting fulfillment" -- what the compact
   * "Discovery ✓ / CRM ✓ / Inventory ⚠ / FSM —" rendering shows per module. */
  label: string;
};

export type CommercialJourneyState = {
  opportunityId: string;
  discovery: JourneyModuleSection & { prospectId: string | null };
  crm: JourneyModuleSection & { leadId: string | null; opportunityStatus: string; ownerId: string | null; nextActionId: string | null };
  inventory: JourneyModuleSection & { productCount: number };
  fsm: JourneyModuleSection & { fsmOpportunityId: string | null; jobStatus: string | null };
  /** A short machine-readable summary of where this journey stands overall --
   * deliberately coarse (not one code per possible per-module combination); the
   * per-module sections above carry the actual detail. */
  overallStage: "closed_lost" | "won_complete" | "won_in_progress" | "in_progress" | "blocked";
  blockedReason: string | null;
  /** Best-effort single hint for what to do next -- INT-01.2's own Next Cross-Module
   * Action Resolver is the real, rule-driven version of this (with explicit action
   * codes and disabled-reasons); this field is this story's own minimal placeholder,
   * superseded wherever INT-01.2's richer resolver is available. */
  nextRecommendedAction: string | null;
};
