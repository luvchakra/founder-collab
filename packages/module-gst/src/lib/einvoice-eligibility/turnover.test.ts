import { describe, expect, it } from "vitest";
import { sumInvoiceTotals } from "./turnover";

describe("sumInvoiceTotals", () => {
  it("sums multiple rows", () => {
    expect(sumInvoiceTotals([{ totalAmount: 100 }, { totalAmount: 250.5 }, { totalAmount: 49.5 }])).toBe(400);
  });

  it("returns 0 for an empty list", () => {
    expect(sumInvoiceTotals([])).toBe(0);
  });

  it("sums a single row", () => {
    expect(sumInvoiceTotals([{ totalAmount: 1000 }])).toBe(1000);
  });
});
