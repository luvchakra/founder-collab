import { describe, expect, it } from "vitest";
import { computeOpportunityOutcomeFunnel, type OpportunityOutcomeFact } from "./outcome-funnel";

function fact(overrides: Partial<OpportunityOutcomeFact> = {}): OpportunityOutcomeFact {
  return { sentToCrm: false, hasContact: false, hasConversation: false, outcome: "open", ...overrides };
}

describe("computeOpportunityOutcomeFunnel", () => {
  it("returns all zeros and a null win rate for no opportunities -- nothing to measure yet", () => {
    expect(computeOpportunityOutcomeFunnel([])).toEqual({
      totalOpportunities: 0,
      withContact: 0,
      withConversation: 0,
      sentToCrm: 0,
      won: 0,
      lost: 0,
      open: 0,
      winRate: null,
    });
  });

  it("counts each stage independently, not as a nested ladder", () => {
    const facts = [
      fact({ sentToCrm: true, outcome: "won" }), // sent to CRM and won, but never had a logged contact/conversation
      fact({ hasContact: true, hasConversation: true }),
    ];
    const funnel = computeOpportunityOutcomeFunnel(facts);
    expect(funnel.totalOpportunities).toBe(2);
    expect(funnel.sentToCrm).toBe(1);
    expect(funnel.withContact).toBe(1);
    expect(funnel.withConversation).toBe(1);
    expect(funnel.won).toBe(1);
  });

  it("splits outcome into won/lost/open and computes win rate as a share of the total", () => {
    const facts = [fact({ outcome: "won" }), fact({ outcome: "won" }), fact({ outcome: "lost" }), fact({ outcome: "open" })];
    const funnel = computeOpportunityOutcomeFunnel(facts);
    expect(funnel.won).toBe(2);
    expect(funnel.lost).toBe(1);
    expect(funnel.open).toBe(1);
    expect(funnel.winRate).toBe(50);
  });

  it("reproduces the doc's own goal -- Discovery producing zero useful opportunities reads as a real 0%, not null", () => {
    const facts = [fact({ outcome: "lost" }), fact({ outcome: "lost" })];
    expect(computeOpportunityOutcomeFunnel(facts).winRate).toBe(0);
  });

  it("rounds a non-integer win rate", () => {
    const facts = [fact({ outcome: "won" }), fact({ outcome: "open" }), fact({ outcome: "open" })];
    expect(computeOpportunityOutcomeFunnel(facts).winRate).toBe(33);
  });
});
