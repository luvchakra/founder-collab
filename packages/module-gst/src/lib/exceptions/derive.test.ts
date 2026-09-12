import { describe, expect, it } from "vitest";
import { deriveReconciliationExceptions } from "./derive";
import type { PurchaseReconciliationResult, SupplierReconciliationRow } from "../reconciliation/types";
import type { ItcAvailabilitySummary, ItcAvailabilityRow } from "../itc/types";

function reconciliation(rows: SupplierReconciliationRow[]): PurchaseReconciliationResult {
  return {
    businessId: "biz-1",
    returnPeriod: "2026-09",
    rows,
    matchedCount: rows.filter((r) => r.status === "matched").length,
    mismatchedCount: rows.filter((r) => r.status === "mismatched").length,
    missingIn2bCount: rows.filter((r) => r.status === "missing_in_2b").length,
    missingInBooksCount: rows.filter((r) => r.status === "missing_in_books").length,
    excludedNoGstinTaxableValue: 0,
  };
}

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

function itcRow(overrides: Partial<ItcAvailabilityRow>): ItcAvailabilityRow {
  return {
    gstr2bDocumentId: "doc-1",
    supplierGstin: "29AAAAA0000A1Z1",
    supplierTradeName: "Acme",
    documentNumber: "INV-1",
    taxableValue: 1000,
    igstAmount: 0,
    cgstAmount: 90,
    sgstAmount: 90,
    cessAmount: 0,
    gstnItcAvailable: true,
    gstnIneligibilityReason: null,
    imsStatus: "accepted",
    bucket: "available",
    ...overrides,
  };
}

function itc(rows: ItcAvailabilityRow[]): ItcAvailabilitySummary {
  const zero = { count: 0, taxableValue: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, cessAmount: 0 };
  return { businessId: "biz-1", returnPeriod: "2026-09", rows, available: zero, pending: zero, rejected: zero, ineligibleByGstn: zero, totalFromGstr2b: zero };
}

describe("deriveReconciliationExceptions", () => {
  it("produces no candidates for an all-matched reconciliation and no pending IMS items", () => {
    expect(deriveReconciliationExceptions(reconciliation([row({ status: "matched" })]), itc([itcRow({ imsStatus: "accepted" })]))).toEqual([]);
  });

  it("produces a supplier_mismatch candidate keyed by GSTIN", () => {
    const candidates = deriveReconciliationExceptions(reconciliation([row({ status: "mismatched", gstin: "29X", name: "X Co" })]), null);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.exceptionType).toBe("supplier_mismatch");
    expect(candidates[0]!.referenceKey).toBe("29X");
    expect(candidates[0]!.summary).toMatch(/X Co/);
  });

  it("produces a missing_in_2b candidate", () => {
    const candidates = deriveReconciliationExceptions(reconciliation([row({ status: "missing_in_2b", gstin: "29Y", gstr2bTaxableValue: null, gstr2bTax: null })]), null);
    expect(candidates[0]!.exceptionType).toBe("missing_in_2b");
    expect(candidates[0]!.summary).toMatch(/not found in GSTR-2B/);
  });

  it("produces a missing_in_books candidate", () => {
    const candidates = deriveReconciliationExceptions(reconciliation([row({ status: "missing_in_books", gstin: "29Z", booksTaxableValue: null, booksTax: null })]), null);
    expect(candidates[0]!.exceptionType).toBe("missing_in_books");
    expect(candidates[0]!.summary).toMatch(/not found in your own books/);
  });

  it("produces an ims_pending candidate keyed by the gstr2b document id, ignoring accepted/rejected rows", () => {
    const candidates = deriveReconciliationExceptions(
      reconciliation([]),
      itc([itcRow({ gstr2bDocumentId: "doc-9", imsStatus: "pending", documentNumber: "INV-9" }), itcRow({ gstr2bDocumentId: "doc-2", imsStatus: "accepted" }), itcRow({ gstr2bDocumentId: "doc-3", imsStatus: "rejected" })]),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.exceptionType).toBe("ims_pending");
    expect(candidates[0]!.referenceKey).toBe("doc-9");
    expect(candidates[0]!.summary).toMatch(/INV-9/);
    expect(candidates[0]!.summary).toMatch(/Pending in IMS/);
  });

  it("handles a null itc summary gracefully (no GSTR-2B statement imported yet)", () => {
    expect(deriveReconciliationExceptions(reconciliation([row({ status: "mismatched" })]), null)).toHaveLength(1);
  });

  it("combines reconciliation and IMS-pending candidates from the same period", () => {
    const candidates = deriveReconciliationExceptions(
      reconciliation([row({ status: "mismatched", gstin: "29X" }), row({ status: "missing_in_books", gstin: "29Y", booksTaxableValue: null, booksTax: null })]),
      itc([itcRow({ gstr2bDocumentId: "doc-1", imsStatus: "pending" })]),
    );
    expect(candidates.map((c) => c.exceptionType).sort()).toEqual(["ims_pending", "missing_in_books", "supplier_mismatch"]);
  });
});
