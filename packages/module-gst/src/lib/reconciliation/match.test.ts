import { describe, expect, it } from "vitest";
import { matchPurchasesTo2b, RECONCILIATION_TOLERANCE } from "./match";
import type { BookSupplierTotal, Gstr2bSupplierTotal } from "./types";

const BIZ = "biz-1";
const PERIOD = "2026-09";

describe("matchPurchasesTo2b", () => {
  it("marks a supplier matched when books and GSTR-2B agree exactly", () => {
    const books: BookSupplierTotal[] = [{ gstin: "29AAAAA0000A1Z1", name: "Acme Supplies", taxableValue: 10000, tax: 1800 }];
    const gstr2b: Gstr2bSupplierTotal[] = [{ gstin: "29AAAAA0000A1Z1", tradeName: "Acme Supplies Pvt Ltd", taxableValue: 10000, tax: 1800 }];

    const result = matchPurchasesTo2b(BIZ, PERIOD, books, gstr2b);
    expect(result.matchedCount).toBe(1);
    expect(result.mismatchedCount).toBe(0);
    expect(result.rows).toEqual([
      {
        status: "matched",
        gstin: "29AAAAA0000A1Z1",
        name: "Acme Supplies",
        booksTaxableValue: 10000,
        booksTax: 1800,
        gstr2bTaxableValue: 10000,
        gstr2bTax: 1800,
        taxableValueDelta: 0,
        taxDelta: 0,
      },
    ]);
  });

  it("stays matched within the reconciliation tolerance (rounding), not just exact equality", () => {
    const books: BookSupplierTotal[] = [{ gstin: "29AAAAA0000A1Z1", name: "Acme", taxableValue: 10000, tax: 1800 }];
    const gstr2b: Gstr2bSupplierTotal[] = [{ gstin: "29AAAAA0000A1Z1", tradeName: "Acme", taxableValue: 10000 + RECONCILIATION_TOLERANCE, tax: 1800 }];

    expect(matchPurchasesTo2b(BIZ, PERIOD, books, gstr2b).matchedCount).toBe(1);
  });

  it("flags a mismatch once the delta exceeds tolerance", () => {
    const books: BookSupplierTotal[] = [{ gstin: "29AAAAA0000A1Z1", name: "Acme", taxableValue: 10000, tax: 1800 }];
    const gstr2b: Gstr2bSupplierTotal[] = [{ gstin: "29AAAAA0000A1Z1", tradeName: "Acme", taxableValue: 10500, tax: 1800 }];

    const result = matchPurchasesTo2b(BIZ, PERIOD, books, gstr2b);
    expect(result.mismatchedCount).toBe(1);
    expect(result.rows[0]!.status).toBe("mismatched");
    expect(result.rows[0]!.taxableValueDelta).toBe(500);
  });

  it("flags a mismatch when taxable value matches but tax differs", () => {
    const books: BookSupplierTotal[] = [{ gstin: "29AAAAA0000A1Z1", name: "Acme", taxableValue: 10000, tax: 1800 }];
    const gstr2b: Gstr2bSupplierTotal[] = [{ gstin: "29AAAAA0000A1Z1", tradeName: "Acme", taxableValue: 10000, tax: 900 }];

    const result = matchPurchasesTo2b(BIZ, PERIOD, books, gstr2b);
    expect(result.rows[0]!.status).toBe("mismatched");
    expect(result.rows[0]!.taxDelta).toBe(-900);
  });

  it("flags a supplier present in books but absent from GSTR-2B as missing_in_2b", () => {
    const books: BookSupplierTotal[] = [{ gstin: "29AAAAA0000A1Z1", name: "Acme", taxableValue: 10000, tax: 1800 }];
    const result = matchPurchasesTo2b(BIZ, PERIOD, books, []);

    expect(result.missingIn2bCount).toBe(1);
    expect(result.rows[0]).toEqual({
      status: "missing_in_2b",
      gstin: "29AAAAA0000A1Z1",
      name: "Acme",
      booksTaxableValue: 10000,
      booksTax: 1800,
      gstr2bTaxableValue: null,
      gstr2bTax: null,
      taxableValueDelta: null,
      taxDelta: null,
    });
  });

  it("flags a supplier present in GSTR-2B but absent from books as missing_in_books", () => {
    const gstr2b: Gstr2bSupplierTotal[] = [{ gstin: "29BBBBB1111B1Z1", tradeName: "Beta Traders", taxableValue: 5000, tax: 900 }];
    const result = matchPurchasesTo2b(BIZ, PERIOD, [], gstr2b);

    expect(result.missingInBooksCount).toBe(1);
    expect(result.rows[0]!.status).toBe("missing_in_books");
    expect(result.rows[0]!.name).toBe("Beta Traders");
  });

  it("excludes a no-GSTIN supplier from matching entirely -- never counted as missing_in_2b", () => {
    const books: BookSupplierTotal[] = [{ gstin: null, name: "Unregistered Vendor", taxableValue: 2000, tax: 0 }];
    const result = matchPurchasesTo2b(BIZ, PERIOD, books, []);

    expect(result.rows).toEqual([]);
    expect(result.missingIn2bCount).toBe(0);
    expect(result.excludedNoGstinTaxableValue).toBe(2000);
  });

  it("sums multiple book rows for the same GSTIN rather than dropping one", () => {
    const books: BookSupplierTotal[] = [
      { gstin: "29AAAAA0000A1Z1", name: "Acme", taxableValue: 5000, tax: 900 },
      { gstin: "29AAAAA0000A1Z1", name: "Acme Pvt Ltd", taxableValue: 3000, tax: 540 },
    ];
    const gstr2b: Gstr2bSupplierTotal[] = [{ gstin: "29AAAAA0000A1Z1", tradeName: "Acme", taxableValue: 8000, tax: 1440 }];

    const result = matchPurchasesTo2b(BIZ, PERIOD, books, gstr2b);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.status).toBe("matched");
    expect(result.rows[0]!.booksTaxableValue).toBe(8000);
  });

  it("handles multiple independent suppliers with mixed outcomes and sorts rows by GSTIN", () => {
    const books: BookSupplierTotal[] = [
      { gstin: "29ZZZZZ0000Z1Z1", name: "Zulu Co", taxableValue: 1000, tax: 180 },
      { gstin: "29AAAAA0000A1Z1", name: "Acme", taxableValue: 2000, tax: 360 },
    ];
    const gstr2b: Gstr2bSupplierTotal[] = [
      { gstin: "29ZZZZZ0000Z1Z1", tradeName: "Zulu Co", taxableValue: 1000, tax: 180 },
      { gstin: "29AAAAA0000A1Z1", tradeName: "Acme", taxableValue: 9999, tax: 360 },
    ];

    const result = matchPurchasesTo2b(BIZ, PERIOD, books, gstr2b);
    expect(result.rows.map((r) => r.gstin)).toEqual(["29AAAAA0000A1Z1", "29ZZZZZ0000Z1Z1"]);
    expect(result.matchedCount).toBe(1);
    expect(result.mismatchedCount).toBe(1);
  });

  it("returns an empty, zeroed result for no data on either side", () => {
    const result = matchPurchasesTo2b(BIZ, PERIOD, [], []);
    expect(result).toEqual({
      businessId: BIZ,
      returnPeriod: PERIOD,
      rows: [],
      matchedCount: 0,
      mismatchedCount: 0,
      missingIn2bCount: 0,
      missingInBooksCount: 0,
      excludedNoGstinTaxableValue: 0,
    });
  });
});
