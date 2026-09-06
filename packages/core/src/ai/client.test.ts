import { describe, expect, it } from "vitest";
import { estimateCost } from "./client";

describe("estimateCost", () => {
  it("returns 0 for an unknown model", () => {
    expect(estimateCost("unknown-model", 1000, 1000)).toBe(0);
  });

  it("computes cost from per-million-token pricing", () => {
    // claude-sonnet-5: input $2/M, output $10/M
    const cost = estimateCost("claude-sonnet-5", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(12, 5);
  });

  it("scales linearly with token count", () => {
    const half = estimateCost("claude-sonnet-5", 500_000, 500_000);
    const full = estimateCost("claude-sonnet-5", 1_000_000, 1_000_000);
    expect(half * 2).toBeCloseTo(full, 5);
  });
});
