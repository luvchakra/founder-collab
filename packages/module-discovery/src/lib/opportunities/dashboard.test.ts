import { describe, expect, it } from "vitest";
import { classifyOpportunityForDashboard } from "./dashboard";
import type { OpportunityStatus } from "./types";

describe("classifyOpportunityForDashboard", () => {
  it("returns null for every resolved status", () => {
    for (const status of ["sent_to_crm", "dismissed", "expired"] as OpportunityStatus[]) {
      expect(classifyOpportunityForDashboard({ status, score: 90, priority: "high" })).toBeNull();
    }
  });

  it("always bins a watching opportunity as watching, regardless of score", () => {
    expect(classifyOpportunityForDashboard({ status: "watching", score: null, priority: "low" })).toBe("watching");
    expect(classifyOpportunityForDashboard({ status: "watching", score: 90, priority: "high" })).toBe("watching");
  });

  it("bins a null score as insufficient_evidence regardless of status", () => {
    expect(classifyOpportunityForDashboard({ status: "new", score: null, priority: "high" })).toBe("insufficient_evidence");
    expect(classifyOpportunityForDashboard({ status: "action_required", score: null, priority: "medium" })).toBe(
      "insufficient_evidence",
    );
  });

  it("bins a high-priority or high-scoring new opportunity as hot", () => {
    expect(classifyOpportunityForDashboard({ status: "new", score: 40, priority: "high" })).toBe("hot");
    expect(classifyOpportunityForDashboard({ status: "new", score: 80, priority: "medium" })).toBe("hot");
  });

  it("bins an ordinary new opportunity as new", () => {
    expect(classifyOpportunityForDashboard({ status: "new", score: 50, priority: "medium" })).toBe("new");
  });

  it("bins a hot action_required/reviewing opportunity as hot, otherwise needs_review", () => {
    expect(classifyOpportunityForDashboard({ status: "action_required", score: 80, priority: "medium" })).toBe("hot");
    expect(classifyOpportunityForDashboard({ status: "action_required", score: 50, priority: "medium" })).toBe(
      "needs_review",
    );
    expect(classifyOpportunityForDashboard({ status: "reviewing", score: 50, priority: "low" })).toBe("needs_review");
  });
});
