import { describe, expect, it } from "vitest";
import { classifyQrmpState, gstr1DueDate, gstr3bDueDate, gstr3bQrmpInstallmentDueDates, gstr9DueDate, type Gstr3bDueDateRuleValue } from "./due-dates";

const GSTR1_RULE = { monthlyDueDay: 11, quarterlyDueDay: 13 };
const GSTR3B_RULE: Gstr3bDueDateRuleValue = {
  monthlyDueDay: 20,
  qrmpInstallmentDueDay: 25,
  categoryX: { dueDay: 22, states: ["Maharashtra", "Karnataka"] },
  categoryY: { dueDay: 24, states: ["Uttar Pradesh", "Delhi"] },
};
const GSTR9_RULE = { dueMonth: 12, dueDay: 31 };

describe("gstr1DueDate", () => {
  it("is the 11th of the following month for a monthly filer", () => {
    expect(gstr1DueDate("2026-09-30", "monthly", GSTR1_RULE)).toBe("2026-10-11");
  });

  it("is the 13th of the month following the quarter for a QRMP quarterly filer", () => {
    expect(gstr1DueDate("2026-06-30", "quarterly", GSTR1_RULE)).toBe("2026-07-13");
  });

  it("rolls across a year boundary", () => {
    expect(gstr1DueDate("2026-12-31", "monthly", GSTR1_RULE)).toBe("2027-01-11");
  });
});

describe("classifyQrmpState", () => {
  it("classifies a Category X state", () => {
    expect(classifyQrmpState("Maharashtra", GSTR3B_RULE)).toBe("X");
  });

  it("classifies a Category Y state", () => {
    expect(classifyQrmpState("Delhi", GSTR3B_RULE)).toBe("Y");
  });

  it("returns null for an unrecognized jurisdiction", () => {
    expect(classifyQrmpState("Atlantis", GSTR3B_RULE)).toBeNull();
  });

  it("returns null for no jurisdiction on file", () => {
    expect(classifyQrmpState(null, GSTR3B_RULE)).toBeNull();
  });
});

describe("gstr3bDueDate", () => {
  it("is the 20th of the following month for a monthly filer", () => {
    expect(gstr3bDueDate("2026-09-30", "monthly", null, GSTR3B_RULE)).toBe("2026-10-20");
  });

  it("is the 22nd of the month following the quarter for a Category X quarterly filer", () => {
    expect(gstr3bDueDate("2026-06-30", "quarterly", "Maharashtra", GSTR3B_RULE)).toBe("2026-07-22");
  });

  it("is the 24th of the month following the quarter for a Category Y quarterly filer", () => {
    expect(gstr3bDueDate("2026-06-30", "quarterly", "Delhi", GSTR3B_RULE)).toBe("2026-07-24");
  });

  it("falls back to the later Category Y due day when the jurisdiction can't be classified, never understating the obligation", () => {
    expect(gstr3bDueDate("2026-06-30", "quarterly", null, GSTR3B_RULE)).toBe("2026-07-24");
    expect(gstr3bDueDate("2026-06-30", "quarterly", "Atlantis", GSTR3B_RULE)).toBe("2026-07-24");
  });
});

describe("gstr3bQrmpInstallmentDueDates", () => {
  it("returns the 25th of the quarter's own first and second month", () => {
    expect(gstr3bQrmpInstallmentDueDates("2026-04-01", GSTR3B_RULE)).toEqual(["2026-05-25", "2026-06-25"]);
  });

  it("rolls across a year boundary for the Jan-Mar quarter", () => {
    expect(gstr3bQrmpInstallmentDueDates("2027-01-01", GSTR3B_RULE)).toEqual(["2027-02-25", "2027-03-25"]);
  });
});

describe("gstr9DueDate", () => {
  it("is 31 December of the same calendar year the financial year (periodEnd) ends in -- FY 2025-26 (ending 31-Mar-2026) is due 31-Dec-2026", () => {
    expect(gstr9DueDate("2026-03-31", GSTR9_RULE)).toBe("2026-12-31");
  });

  it("is 31 December of the following calendar year for the next FY", () => {
    expect(gstr9DueDate("2027-03-31", GSTR9_RULE)).toBe("2027-12-31");
  });
});
