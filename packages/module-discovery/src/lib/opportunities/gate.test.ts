import { describe, expect, it } from "vitest";
import { selectTopGateOpportunity, type GateCandidate } from "./gate";

function candidate(overrides: Partial<GateCandidate> & { id: string }): GateCandidate & { id: string } {
  return { status: "new", score: 50, created_at: "2026-09-01T00:00:00Z", ...overrides };
}

describe("selectTopGateOpportunity", () => {
  it("returns null for an empty list", () => {
    expect(selectTopGateOpportunity([])).toBeNull();
  });

  it("excludes resolved and watched opportunities", () => {
    const candidates = [
      candidate({ id: "sent", status: "sent_to_crm", score: 99 }),
      candidate({ id: "dismissed", status: "dismissed", score: 98 }),
      candidate({ id: "expired", status: "expired", score: 97 }),
      candidate({ id: "watching", status: "watching", score: 96 }),
    ];
    expect(selectTopGateOpportunity(candidates)).toBeNull();
  });

  it("excludes an unscored opportunity even if nothing else qualifies", () => {
    const candidates = [candidate({ id: "unscored", status: "new", score: null })];
    expect(selectTopGateOpportunity(candidates)).toBeNull();
  });

  it("picks the highest-scored pending opportunity", () => {
    const candidates = [
      candidate({ id: "low", status: "new", score: 40 }),
      candidate({ id: "high", status: "action_required", score: 85 }),
      candidate({ id: "mid", status: "reviewing", score: 60 }),
    ];
    expect(selectTopGateOpportunity(candidates)?.id).toBe("high");
  });

  it("breaks a score tie by whichever has been waiting longest", () => {
    const candidates = [
      candidate({ id: "newer", status: "new", score: 70, created_at: "2026-09-05T00:00:00Z" }),
      candidate({ id: "older", status: "new", score: 70, created_at: "2026-09-01T00:00:00Z" }),
    ];
    expect(selectTopGateOpportunity(candidates)?.id).toBe("older");
  });
});
