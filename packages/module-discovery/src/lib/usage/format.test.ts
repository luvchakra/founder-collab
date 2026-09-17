import { describe, expect, it } from "vitest";
import { creditsUsedPercent } from "./format";
import { FREE_TIER_MONTHLY_COST_LIMIT_USD } from "./limits";

describe("creditsUsedPercent", () => {
  it("reports 0% for no spend", () => {
    expect(creditsUsedPercent(0)).toBe(0);
  });

  it("scales spend against the free-tier cap", () => {
    expect(creditsUsedPercent(FREE_TIER_MONTHLY_COST_LIMIT_USD / 2)).toBe(50);
    expect(creditsUsedPercent(FREE_TIER_MONTHLY_COST_LIMIT_USD)).toBe(100);
  });

  it("clamps at 100% when spend briefly overshoots the cap", () => {
    expect(creditsUsedPercent(FREE_TIER_MONTHLY_COST_LIMIT_USD * 3)).toBe(100);
  });

  it("rounds to a whole percent", () => {
    expect(creditsUsedPercent(1.234, 10)).toBe(12);
  });

  it("returns 0 rather than dividing by a zero or negative limit", () => {
    expect(creditsUsedPercent(5, 0)).toBe(0);
    expect(creditsUsedPercent(5, -1)).toBe(0);
  });
});
