/** FND-15. Burn and runway are computed only when there is a burn to compute. */
import { describe, expect, it } from "vitest";
import { burnAndRunway, lastCompleteMonths } from "./funding-snapshot";

describe("burnAndRunway", () => {
  it("divides cash by the average monthly loss", () => {
    expect(burnAndRunway(600_000, [-100_000, -200_000, -300_000])).toEqual({ averageMonthlyNet: -200_000, netBurn: 200_000, runwayMonths: 3 });
  });

  it("has no burn or runway for a profitable business", () => {
    expect(burnAndRunway(600_000, [50_000, 10_000, -20_000])).toMatchObject({ netBurn: null, runwayMonths: null });
  });

  it("reports zero runway when burning with no cash", () => {
    expect(burnAndRunway(0, [-10, -10, -10]).runwayMonths).toBe(0);
  });
});

describe("lastCompleteMonths", () => {
  it("returns the three whole months before today, oldest first, across a year boundary", () => {
    expect(lastCompleteMonths("2026-02-10")).toEqual([
      { from: "2025-11-01", to: "2025-11-30" },
      { from: "2025-12-01", to: "2025-12-31" },
      { from: "2026-01-01", to: "2026-01-31" },
    ]);
  });
});
