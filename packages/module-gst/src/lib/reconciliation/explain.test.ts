import { describe, expect, it } from "vitest";
import { explainSupplierMatch, possibleCausesFor } from "./explain";
import type { SupplierReconciliationRow } from "./types";

function row(overrides: Partial<SupplierReconciliationRow>): SupplierReconciliationRow {
  return {
    status: "matched",
    gstin: "29AAAAA0000A1Z1",
    name: "Acme",
    booksTaxableValue: 1000,
    booksTax: 180,
    gstr2bTaxableValue: 1000,
    gstr2bTax: 180,
    taxableValueDelta: 0,
    taxDelta: 0,
    ...overrides,
  };
}

describe("possibleCausesFor", () => {
  it("returns an empty list for a matched status -- nothing to explain", () => {
    expect(possibleCausesFor("matched")).toEqual([]);
  });

  it("returns non-empty, distinct cause lists for each unmatched status", () => {
    const missingIn2b = possibleCausesFor("missing_in_2b");
    const missingInBooks = possibleCausesFor("missing_in_books");
    const mismatched = possibleCausesFor("mismatched");

    expect(missingIn2b.length).toBeGreaterThan(0);
    expect(missingInBooks.length).toBeGreaterThan(0);
    expect(mismatched.length).toBeGreaterThan(0);
    expect(missingIn2b).not.toEqual(missingInBooks);
    expect(missingIn2b).not.toEqual(mismatched);
  });

  it("mentions the supplier's own GSTR-1 filing status as a candidate cause for missing_in_2b (real GST practice, not invented)", () => {
    expect(possibleCausesFor("missing_in_2b").join(" ")).toMatch(/GSTR-1/);
  });
});

describe("explainSupplierMatch", () => {
  it("pairs a matched row with an empty cause list", () => {
    const explanation = explainSupplierMatch(row({ status: "matched" }));
    expect(explanation.possibleCauses).toEqual([]);
    expect(explanation.row.status).toBe("matched");
  });

  it("pairs a mismatched row with the mismatch cause list", () => {
    const explanation = explainSupplierMatch(row({ status: "mismatched", taxableValueDelta: 500 }));
    expect(explanation.possibleCauses).toEqual(possibleCausesFor("mismatched"));
  });

  it("pairs a missing_in_books row with the missing_in_books cause list", () => {
    const explanation = explainSupplierMatch(row({ status: "missing_in_books", booksTaxableValue: null, booksTax: null }));
    expect(explanation.possibleCauses).toEqual(possibleCausesFor("missing_in_books"));
  });
});
