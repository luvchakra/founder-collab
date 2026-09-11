import { describe, expect, it } from "vitest";
import { deriveOverallState, resolveNextCrossModuleAction } from "./queries";
import type { CommercialJourneyState } from "./types";

function journeyState(overrides: Partial<CommercialJourneyState>): CommercialJourneyState {
  return {
    opportunityId: "opp-1",
    discovery: { status: "not_available", label: "", prospectId: null },
    crm: { status: "ok", label: "Qualification", leadId: null, opportunityStatus: "open", ownerId: null, nextActionId: null },
    inventory: { status: "not_applicable", label: "", productCount: 0, fulfillmentRequestId: null },
    fsm: { status: "not_applicable", label: "", fsmOpportunityId: null, jobStatus: null },
    overallStage: "in_progress",
    blockedReason: null,
    nextRecommendedAction: null,
    ...overrides,
  };
}

function crm(status: CommercialJourneyState["crm"]["status"], label: string) {
  return { status, label, leadId: null, opportunityStatus: "open", ownerId: null, nextActionId: null };
}
function inventory(status: CommercialJourneyState["inventory"]["status"], productCount: number, fulfillmentRequestId: string | null = null) {
  return { status, label: "", productCount, fulfillmentRequestId };
}
function fsm(status: CommercialJourneyState["fsm"]["status"]) {
  return { status, label: "", fsmOpportunityId: null, jobStatus: null };
}

describe("deriveOverallState", () => {
  it("marks a lost opportunity closed_lost regardless of the other sections", () => {
    const result = deriveOverallState(crm("blocked", "Lost"), inventory("not_applicable", 0), fsm("not_applicable"));
    expect(result.overallStage).toBe("closed_lost");
    expect(result.blockedReason).toBe("Opportunity marked lost");
  });

  it("marks a won opportunity with nothing left to do as won_complete", () => {
    const result = deriveOverallState(crm("ok", "Won"), inventory("not_applicable", 0), fsm("not_applicable"));
    expect(result.overallStage).toBe("won_complete");
    expect(result.nextRecommendedAction).toBeNull();
  });

  it("marks a won opportunity with linked products still to fulfill as won_in_progress", () => {
    const result = deriveOverallState(crm("ok", "Won"), inventory("ok", 2), fsm("not_applicable"));
    expect(result.overallStage).toBe("won_in_progress");
    expect(result.nextRecommendedAction).toBe("Fulfill the linked products.");
  });

  it("marks a won opportunity with a cancelled/stale fulfillment reference as won_in_progress", () => {
    const result = deriveOverallState(crm("ok", "Won"), inventory("warning", 2, "so-1"), fsm("not_applicable"));
    expect(result.overallStage).toBe("won_in_progress");
    expect(result.nextRecommendedAction).toBe("Fulfill the linked products.");
  });

  it("marks a won opportunity with an accepted-but-not-jobbed FSM quote as won_in_progress", () => {
    const result = deriveOverallState(crm("ok", "Won"), inventory("not_applicable", 0), fsm("warning"));
    expect(result.overallStage).toBe("won_in_progress");
    expect(result.nextRecommendedAction).toBe("Create the FSM job for the accepted quote.");
  });

  it("surfaces the FSM warning as the next action even before the opportunity is won", () => {
    const result = deriveOverallState(crm("ok", "Proposal"), inventory("not_applicable", 0), fsm("warning"));
    expect(result.overallStage).toBe("in_progress");
    expect(result.nextRecommendedAction).toBe("Create the FSM job for the accepted quote.");
  });

  it("has no recommended action for an ordinary open opportunity", () => {
    const result = deriveOverallState(crm("ok", "Qualification"), inventory("not_applicable", 0), fsm("not_applicable"));
    expect(result.overallStage).toBe("in_progress");
    expect(result.nextRecommendedAction).toBeNull();
  });
});

describe("resolveNextCrossModuleAction", () => {
  it("recommends creating the FSM job once a quote is accepted", () => {
    const result = resolveNextCrossModuleAction(
      journeyState({ fsm: { status: "warning", label: "Quote accepted -- job not created yet", fsmOpportunityId: "fsm-opp-1", jobStatus: null } }),
    );
    expect(result.primary).toEqual({ code: "create_fsm_job", label: "Create FSM job", enabled: true, disabledReason: null });
  });

  it("recommends creating an FSM quote for an open opportunity with linked products and no FSM engagement yet", () => {
    const result = resolveNextCrossModuleAction(journeyState({ inventory: { status: "ok", label: "2 products linked", productCount: 2, fulfillmentRequestId: null } }));
    expect(result.primary?.code).toBe("create_fsm_quote");
    expect(result.primary?.enabled).toBe(true);
  });

  it("recommends requesting inventory fulfillment for a won opportunity with linked, unrequested products", () => {
    const result = resolveNextCrossModuleAction(
      journeyState({ crm: { status: "ok", label: "Won", leadId: null, opportunityStatus: "won", ownerId: null, nextActionId: null }, inventory: { status: "ok", label: "3 products linked", productCount: 3, fulfillmentRequestId: null } }),
    );
    expect(result.primary).toEqual({ code: "request_fulfillment", label: "Request inventory fulfillment", enabled: true, disabledReason: null });
  });

  it("recommends nothing further once fulfillment has already been requested", () => {
    const result = resolveNextCrossModuleAction(
      journeyState({
        crm: { status: "ok", label: "Won", leadId: null, opportunityStatus: "won", ownerId: null, nextActionId: null },
        inventory: { status: "ok", label: "Fulfillment requested", productCount: 3, fulfillmentRequestId: "so-1" },
      }),
    );
    expect(result.primary).toBeNull();
  });

  it("recommends a customer follow-up for a won opportunity with nothing else pending", () => {
    const result = resolveNextCrossModuleAction(journeyState({ crm: { status: "ok", label: "Won", leadId: null, opportunityStatus: "won", ownerId: null, nextActionId: null } }));
    expect(result.primary?.code).toBe("follow_up_customer");
    expect(result.primary?.enabled).toBe(true);
  });

  it("returns no primary action for an ordinary open opportunity with no products and no FSM engagement", () => {
    const result = resolveNextCrossModuleAction(journeyState({}));
    expect(result.primary).toBeNull();
    expect(result.alternatives).toEqual([]);
  });

  it("prioritizes create_fsm_job over every other applicable action", () => {
    const result = resolveNextCrossModuleAction(
      journeyState({
        crm: { status: "ok", label: "Won", leadId: null, opportunityStatus: "won", ownerId: null, nextActionId: null },
        inventory: { status: "ok", label: "1 product linked", productCount: 1, fulfillmentRequestId: null },
        fsm: { status: "warning", label: "Quote accepted -- job not created yet", fsmOpportunityId: "fsm-opp-1", jobStatus: null },
      }),
    );
    expect(result.primary?.code).toBe("create_fsm_job");
    expect(result.alternatives.some((a) => a.code === "request_fulfillment")).toBe(true);
  });
});
