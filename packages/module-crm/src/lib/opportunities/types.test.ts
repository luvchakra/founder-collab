import { describe, expect, it } from "vitest";
import { calculatePipelineValue } from "./types";
import type { Opportunity } from "./types";

function opp(overrides: Partial<Opportunity>): Opportunity {
  return {
    id: "o1",
    business_id: "b1",
    party_id: "p1",
    lead_id: null,
    stage_id: null,
    status: "open",
    source: "manual",
    owner_id: null,
    estimated_value: null,
    currency: "INR",
    probability: null,
    expected_close_date: null,
    next_action_id: null,
    fsm_opportunity_id: null,
    fulfillment_requirement: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

describe("calculatePipelineValue", () => {
  it("sums open and won estimated values separately, per CRM-04.3", () => {
    const result = calculatePipelineValue([
      opp({ status: "open", estimated_value: 1000 }),
      opp({ status: "open", estimated_value: 2000 }),
      opp({ status: "won", estimated_value: 5000 }),
      opp({ status: "lost", estimated_value: 9999 }),
      opp({ status: "open", estimated_value: null }),
    ]);
    expect(result).toEqual({ openValue: 3000, wonValue: 5000 });
  });

  it("returns zero for both when there are no estimated opportunities", () => {
    expect(calculatePipelineValue([opp({ estimated_value: null })])).toEqual({ openValue: 0, wonValue: 0 });
  });
});
