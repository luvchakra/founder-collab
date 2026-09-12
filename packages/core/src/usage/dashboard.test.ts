import { describe, expect, it } from "vitest";
import { projectedMonthlyUsage } from "./dashboard";

describe("projectedMonthlyUsage", () => {
  it("projects flat linear usage to month end", () => {
    // 10 used by day 10 of a 30-day month -> 1/day pace -> 30 by month end.
    expect(projectedMonthlyUsage(10, new Date(Date.UTC(2026, 8, 10)))).toBe(30);
  });

  it("returns zero usage as zero projected", () => {
    expect(projectedMonthlyUsage(0, new Date(Date.UTC(2026, 8, 10)))).toBe(0);
  });

  it("projects on the first day of the month without dividing by zero", () => {
    expect(projectedMonthlyUsage(1, new Date(Date.UTC(2026, 8, 1)))).toBe(30);
  });

  it("rounds to the nearest whole unit", () => {
    // 7 used by day 10 of a 30-day month -> 21 by month end (0.7/day * 30 = 21).
    expect(projectedMonthlyUsage(7, new Date(Date.UTC(2026, 8, 10)))).toBe(21);
  });

  it("accounts for the target month's real day count (28-day February)", () => {
    expect(projectedMonthlyUsage(14, new Date(Date.UTC(2026, 1, 14)))).toBe(28);
  });
});
