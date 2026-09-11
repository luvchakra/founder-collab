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

/** INT-01.2's own vocabulary. Deliberately scoped to CROSS-module actions only --
 * ordinary CRM pipeline progression (advance stage, mark won/lost) is already the
 * opportunity detail page's own "Next action" card (`crm.activity`/`next_action_id`,
 * CRM-05.2); this resolver exists for the handoffs a founder would otherwise have to
 * remember to go trigger by hand in another module. */
export type JourneyActionCode = "create_fsm_quote" | "create_fsm_job" | "request_fulfillment" | "follow_up_customer";

export type JourneyAction = {
  code: JourneyActionCode;
  label: string;
  enabled: boolean;
  /** Set whenever `enabled` is false -- INT-01.2's own "disabled actions must explain
   * missing prerequisites" acceptance criterion. */
  disabledReason: string | null;
};

export type NextActionResolution = {
  /** The single action this story asks for ("one primary next action") -- null when
   * nothing cross-module is currently applicable (an early-stage opportunity with no
   * products and no FSM engagement yet has nothing for this resolver to say; the
   * page's own general "Next action" card already covers that case). */
  primary: JourneyAction | null;
  /** Other permitted actions the user may choose instead ("user can manually choose
   * another permitted action") -- kept short and only populated when a genuine second
   * option exists, never padded out to look exhaustive. */
  alternatives: JourneyAction[];
};
