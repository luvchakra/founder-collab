import { describe, expect, it } from "vitest";
import { computeGstRetentionUntil } from "./compute";

const GSTR9_RULE = { dueMonth: 12, dueDay: 31 };

describe("computeGstRetentionUntil", () => {
  it("is 72 months after the annual return due date for FY 2025-26 (ending 31-Mar-2026, due 31-Dec-2026)", () => {
    // 31-Dec-2026 + 72 months (6 years) = 31-Dec-2032.
    expect(computeGstRetentionUntil("2026-03-31", 72, GSTR9_RULE)).toBe("2032-12-31");
  });

  it("rolls correctly for a different financial year", () => {
    expect(computeGstRetentionUntil("2027-03-31", 72, GSTR9_RULE)).toBe("2033-12-31");
  });

  it("respects a different retentionMonths value (a future amended rule)", () => {
    expect(computeGstRetentionUntil("2026-03-31", 60, GSTR9_RULE)).toBe("2031-12-31");
  });
});
