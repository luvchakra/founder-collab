import { describe, expect, it } from "vitest";
import { monthPeriod, generateMonthlyPeriods, qrmpQuarterContaining, generateQrmpQuarters, financialYearContaining, generateFinancialYears } from "./periods";

describe("monthPeriod", () => {
  it("returns the first/last day of a 30-day month", () => {
    expect(monthPeriod(2026, 8)).toEqual({ periodStart: "2026-09-01", periodEnd: "2026-09-30" });
  });

  it("returns the first/last day of a 31-day month", () => {
    expect(monthPeriod(2026, 0)).toEqual({ periodStart: "2026-01-01", periodEnd: "2026-01-31" });
  });

  it("handles February in a leap year", () => {
    expect(monthPeriod(2028, 1)).toEqual({ periodStart: "2028-02-01", periodEnd: "2028-02-29" });
  });

  it("handles February in a non-leap year", () => {
    expect(monthPeriod(2026, 1)).toEqual({ periodStart: "2026-02-01", periodEnd: "2026-02-28" });
  });

  it("rolls a December month correctly", () => {
    expect(monthPeriod(2026, 11)).toEqual({ periodStart: "2026-12-01", periodEnd: "2026-12-31" });
  });
});

describe("generateMonthlyPeriods", () => {
  it("generates the requested back/forward window, oldest first", () => {
    const periods = generateMonthlyPeriods("2026-09-15", 1, 1);
    expect(periods).toEqual([
      { periodStart: "2026-08-01", periodEnd: "2026-08-31" },
      { periodStart: "2026-09-01", periodEnd: "2026-09-30" },
      { periodStart: "2026-10-01", periodEnd: "2026-10-31" },
    ]);
  });

  it("rolls across a year boundary in both directions", () => {
    const periods = generateMonthlyPeriods("2027-01-05", 1, 1);
    expect(periods).toEqual([
      { periodStart: "2026-12-01", periodEnd: "2026-12-31" },
      { periodStart: "2027-01-01", periodEnd: "2027-01-31" },
      { periodStart: "2027-02-01", periodEnd: "2027-02-28" },
    ]);
  });

  it("returns just the current month when back/forward are both 0", () => {
    expect(generateMonthlyPeriods("2026-09-15", 0, 0)).toEqual([{ periodStart: "2026-09-01", periodEnd: "2026-09-30" }]);
  });
});

describe("qrmpQuarterContaining", () => {
  it("resolves the Apr-Jun quarter", () => {
    expect(qrmpQuarterContaining("2026-05-10")).toEqual({ periodStart: "2026-04-01", periodEnd: "2026-06-30" });
  });

  it("resolves the Jul-Sep quarter", () => {
    expect(qrmpQuarterContaining("2026-08-01")).toEqual({ periodStart: "2026-07-01", periodEnd: "2026-09-30" });
  });

  it("resolves the Oct-Dec quarter", () => {
    expect(qrmpQuarterContaining("2026-11-30")).toEqual({ periodStart: "2026-10-01", periodEnd: "2026-12-31" });
  });

  it("resolves the Jan-Mar quarter, which starts in the FOLLOWING calendar year relative to the FY's own start", () => {
    expect(qrmpQuarterContaining("2027-02-14")).toEqual({ periodStart: "2027-01-01", periodEnd: "2027-03-31" });
  });

  it("resolves a leap-year Jan-Mar quarter's own February correctly", () => {
    expect(qrmpQuarterContaining("2028-02-14")).toEqual({ periodStart: "2028-01-01", periodEnd: "2028-03-31" });
  });

  it("boundary: the exact first day of a quarter belongs to that quarter", () => {
    expect(qrmpQuarterContaining("2026-04-01")).toEqual({ periodStart: "2026-04-01", periodEnd: "2026-06-30" });
  });

  it("boundary: the exact last day of a quarter belongs to that quarter", () => {
    expect(qrmpQuarterContaining("2026-06-30")).toEqual({ periodStart: "2026-04-01", periodEnd: "2026-06-30" });
  });
});

describe("generateQrmpQuarters", () => {
  it("generates the requested back/forward window across a financial-year boundary, oldest first", () => {
    const quarters = generateQrmpQuarters("2027-02-01", 1, 1);
    expect(quarters).toEqual([
      { periodStart: "2026-10-01", periodEnd: "2026-12-31" },
      { periodStart: "2027-01-01", periodEnd: "2027-03-31" },
      { periodStart: "2027-04-01", periodEnd: "2027-06-30" },
    ]);
  });
});

describe("financialYearContaining", () => {
  it("resolves a date after April to the FY starting that same calendar year", () => {
    expect(financialYearContaining("2026-09-12")).toEqual({ periodStart: "2026-04-01", periodEnd: "2027-03-31" });
  });

  it("resolves a date before April to the FY starting the PRIOR calendar year", () => {
    expect(financialYearContaining("2027-02-01")).toEqual({ periodStart: "2026-04-01", periodEnd: "2027-03-31" });
  });

  it("boundary: 1 April itself is the FY's own first day", () => {
    expect(financialYearContaining("2026-04-01")).toEqual({ periodStart: "2026-04-01", periodEnd: "2027-03-31" });
  });

  it("boundary: 31 March itself is the FY's own last day", () => {
    expect(financialYearContaining("2027-03-31")).toEqual({ periodStart: "2026-04-01", periodEnd: "2027-03-31" });
  });
});

describe("generateFinancialYears", () => {
  it("generates the requested back/forward window, oldest first", () => {
    expect(generateFinancialYears("2026-09-12", 1, 1)).toEqual([
      { periodStart: "2025-04-01", periodEnd: "2026-03-31" },
      { periodStart: "2026-04-01", periodEnd: "2027-03-31" },
      { periodStart: "2027-04-01", periodEnd: "2028-03-31" },
    ]);
  });
});
