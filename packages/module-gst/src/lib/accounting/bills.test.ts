import { describe, expect, it } from "vitest";
import { billProblems, billTotals, initialStatus } from "./bills";

describe("splitting GST on a purchase", () => {
  // Seller and buyer are the reverse of a sale. Getting it backwards flips CGST/SGST
  // against IGST on every purchase, which is what makes input credit unclaimable.
  it("splits CGST and SGST when supplier and business are in the same state", () => {
    const t = billTotals({ taxableValue: 2000, gstRatePercent: 18, supplierStateCode: "27", businessStateCode: "27" });
    expect(t.cgstAmount).toBe(180);
    expect(t.sgstAmount).toBe(180);
    expect(t.igstAmount).toBe(0);
    expect(t.total).toBe(2360);
  });

  it("charges IGST when they are in different states", () => {
    const t = billTotals({ taxableValue: 2000, gstRatePercent: 18, supplierStateCode: "29", businessStateCode: "27" });
    expect(t.igstAmount).toBe(360);
    expect(t.cgstAmount).toBe(0);
    expect(t.total).toBe(2360);
  });

  // Silently defaulting to the wrong split is the single most common manual-invoicing
  // mistake; the form shows "incomplete" rather than a confident wrong answer.
  it("refuses to guess when a state is unknown", () => {
    const t = billTotals({ taxableValue: 2000, gstRatePercent: 18, supplierStateCode: null, businessStateCode: "27" });
    expect(t.incomplete).toBe(true);
    expect(t.totalTax).toBe(0);
  });

  it("handles a zero-rated purchase", () => {
    const t = billTotals({ taxableValue: 1000, gstRatePercent: 0, supplierStateCode: "27", businessStateCode: "27" });
    expect(t.totalTax).toBe(0);
    expect(t.total).toBe(1000);
    expect(t.incomplete).toBe(false);
  });

  it("rounds to paise", () => {
    const t = billTotals({ taxableValue: 0.1 + 0.2, gstRatePercent: 0, supplierStateCode: "27", businessStateCode: "27" });
    expect(t.total).toBe(0.3);
  });
});

describe("validating a bill", () => {
  const good = {
    kind: "bill" as const,
    partyId: "supplier-1",
    valueAccountId: "acct-1",
    billDate: "2026-09-18",
    taxableValue: 2000,
    gstRatePercent: 18,
  };

  it("accepts a complete bill", () => {
    expect(billProblems(good)).toEqual([]);
  });

  it("wants a supplier, an account, a date and an amount", () => {
    const problems = billProblems({});
    expect(problems.length).toBeGreaterThanOrEqual(4);
  });

  // Almost always a typo, and it would drop the bill into the oldest aging bucket and
  // stay there, looking like a supplier nobody has paid for months.
  it("refuses a due date before the bill date", () => {
    expect(billProblems({ ...good, dueDate: "2026-09-01" }).join(" ")).toMatch(/due date can't be before/i);
  });

  it("accepts a due date on the bill date", () => {
    expect(billProblems({ ...good, dueDate: "2026-09-18" })).toEqual([]);
  });

  it("refuses a zero or negative amount", () => {
    expect(billProblems({ ...good, taxableValue: 0 }).join(" ")).toMatch(/greater than zero/i);
    expect(billProblems({ ...good, taxableValue: -5 }).join(" ")).toMatch(/greater than zero/i);
  });

  it("refuses an amount that isn't a number", () => {
    expect(billProblems({ ...good, taxableValue: Number.NaN }).join(" ")).toMatch(/has to be a number/i);
  });

  it("refuses an impossible GST rate", () => {
    expect(billProblems({ ...good, gstRatePercent: 150 }).join(" ")).toMatch(/between 0 and 100/i);
    expect(billProblems({ ...good, gstRatePercent: -1 }).join(" ")).toMatch(/between 0 and 100/i);
  });

  it("reports everything wrong at once, not one thing per attempt", () => {
    expect(billProblems({ taxableValue: -1, gstRatePercent: 999 }).length).toBeGreaterThan(3);
  });
});

describe("what a bill starts as", () => {
  it("posts a bill on terms as unpaid", () => {
    expect(initialStatus({ kind: "bill" })).toBe("posted");
  });

  it("settles an expense paid on the spot", () => {
    expect(initialStatus({ kind: "expense", paidImmediately: true })).toBe("paid");
  });

  it("leaves an expense on terms as a normal payable", () => {
    expect(initialStatus({ kind: "expense", paidImmediately: false })).toBe("posted");
  });
});
