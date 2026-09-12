import { describe, expect, it } from "vitest";
import { computeMissingDocumentIds, reconcileReturnRow } from "./reconcile";
import type { ReturnSourceDocument } from "./types";

type SourceDoc = Pick<ReturnSourceDocument, "docType" | "taxableValue" | "cgstAmount" | "sgstAmount" | "igstAmount">;

function invoiceDoc(overrides: Partial<SourceDoc> = {}): SourceDoc {
  return { docType: "invoice", taxableValue: 1000, cgstAmount: 90, sgstAmount: 90, igstAmount: 0, ...overrides };
}

describe("reconcileReturnRow", () => {
  it("reconciles a single-invoice row under the raw convention", () => {
    const reported = { taxableValue: 1000, cgstAmount: 90, sgstAmount: 90, igstAmount: 0 };
    const result = reconcileReturnRow(reported, [invoiceDoc()], "raw");
    expect(result.reconciled).toBe(true);
    expect(result.discrepancy).toBeNull();
    expect(result.computedFromSources).toEqual(reported);
  });

  it("reconciles a netted bucket (invoice minus credit note) under the net convention", () => {
    const invoice = invoiceDoc();
    const creditNote: SourceDoc = { docType: "credit_note", taxableValue: 200, cgstAmount: 18, sgstAmount: 18, igstAmount: 0 };
    const reported = { taxableValue: 800, cgstAmount: 72, sgstAmount: 72, igstAmount: 0 };
    const result = reconcileReturnRow(reported, [invoice, creditNote], "net");
    expect(result.reconciled).toBe(true);
  });

  it("does NOT reconcile the same invoice+credit-note pair under the raw convention (proves the two conventions are not interchangeable)", () => {
    const invoice = invoiceDoc();
    const creditNote: SourceDoc = { docType: "credit_note", taxableValue: 200, cgstAmount: 18, sgstAmount: 18, igstAmount: 0 };
    // Raw sums both face values positively: 1000 + 200 = 1200, not the net 800.
    const reportedAsIfNet = { taxableValue: 800, cgstAmount: 72, sgstAmount: 72, igstAmount: 0 };
    const result = reconcileReturnRow(reportedAsIfNet, [invoice, creditNote], "raw");
    expect(result.reconciled).toBe(false);
    expect(result.computedFromSources.taxableValue).toBe(1200);
    expect(result.discrepancy?.taxableValue).toBe(400);
  });

  it("treats a debit note and a purchase order as adding under both conventions (only credit_note ever subtracts)", () => {
    const debitNote: SourceDoc = { docType: "debit_note", taxableValue: 50, cgstAmount: 4.5, sgstAmount: 4.5, igstAmount: 0 };
    const purchaseOrder: SourceDoc = { docType: "purchase_order", taxableValue: 300, cgstAmount: 27, sgstAmount: 27, igstAmount: 0 };
    const reported = { taxableValue: 350, cgstAmount: 31.5, sgstAmount: 31.5, igstAmount: 0 };
    expect(reconcileReturnRow(reported, [debitNote, purchaseOrder], "net").reconciled).toBe(true);
    expect(reconcileReturnRow(reported, [debitNote, purchaseOrder], "raw").reconciled).toBe(true);
  });

  it("detects a real discrepancy: a source document was corrected after the row was computed", () => {
    const reported = { taxableValue: 1000, cgstAmount: 90, sgstAmount: 90, igstAmount: 0 };
    // The real document on file now says 1100, not the 1000 the return reported.
    const correctedDoc = invoiceDoc({ taxableValue: 1100 });
    const result = reconcileReturnRow(reported, [correctedDoc], "raw");
    expect(result.reconciled).toBe(false);
    expect(result.discrepancy).toEqual({ taxableValue: 100, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 });
  });

  it("flags a row that reports a nonzero amount with zero source documents (e.g. every id came back missing)", () => {
    const reported = { taxableValue: 1000, cgstAmount: 90, sgstAmount: 90, igstAmount: 0 };
    const result = reconcileReturnRow(reported, [], "raw");
    expect(result.reconciled).toBe(false);
    expect(result.computedFromSources).toEqual({ taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 });
  });

  it("reconciles a genuinely empty row against zero source documents", () => {
    const reported = { taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 };
    expect(reconcileReturnRow(reported, [], "net").reconciled).toBe(true);
  });

  it("absorbs sub-paisa floating-point rounding noise without masking a real one-rupee discrepancy", () => {
    const reported = { taxableValue: 1000.005, cgstAmount: 90, sgstAmount: 90, igstAmount: 0 };
    const tinyRoundingDoc = invoiceDoc({ taxableValue: 1000 });
    expect(reconcileReturnRow(reported, [tinyRoundingDoc], "raw").reconciled).toBe(true);

    const reportedOffByOneRupee = { taxableValue: 1001, cgstAmount: 90, sgstAmount: 90, igstAmount: 0 };
    expect(reconcileReturnRow(reportedOffByOneRupee, [tinyRoundingDoc], "raw").reconciled).toBe(false);
  });
});

describe("computeMissingDocumentIds", () => {
  it("returns an empty list when every requested id was found", () => {
    expect(computeMissingDocumentIds(["a", "b"], ["a", "b", "c"])).toEqual([]);
  });

  it("names every requested id absent from the found set, preserving requested order", () => {
    expect(computeMissingDocumentIds(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
  });

  it("deduplicates the requested list before diffing", () => {
    expect(computeMissingDocumentIds(["a", "a", "b"], ["a"])).toEqual(["b"]);
  });

  it("returns an empty list for an empty request", () => {
    expect(computeMissingDocumentIds([], ["a"])).toEqual([]);
  });
});
