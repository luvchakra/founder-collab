import { describe, expect, it } from "vitest";
import { deriveOverallState } from "./queries";
import type { CommercialJourneyState } from "./types";

function crm(status: CommercialJourneyState["crm"]["status"], label: string) {
  return { status, label, leadId: null, opportunityStatus: "open", ownerId: null, nextActionId: null };
}
function inventory(status: CommercialJourneyState["inventory"]["status"], productCount: number) {
  return { status, label: "", productCount };
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
