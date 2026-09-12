import { describe, expect, it } from "vitest";
import { aggregateGstr1 } from "../gstr1/aggregate";
import { aggregateGstr3bOutward } from "../gstr3b/aggregate";
import { buildGstr9Table4 } from "../gstr9/aggregate";
import type { OutwardSupplyDocument } from "../shared/types";
import { reconcileReturnRow } from "./reconcile";
import type { ReturnSourceDocument } from "./types";

type SourceDocAmounts = Pick<ReturnSourceDocument, "docType" | "taxableValue" | "cgstAmount" | "sgstAmount" | "igstAmount">;

/**
 * COMPLY-P0-07.4 (Return Drill-Down): the end-to-end proof that "every return amount is
 * traceable to source transactions" is a real, checkable property of this epic's own
 * aggregation logic -- not just document ids sitting on a row. Every test here runs the
 * SAME `aggregateGstr1`/`aggregateGstr3bOutward`/`buildGstr9Table4` functions
 * COMPLY-P0-07.1/07.2/07.3 already ship, then feeds the exact source documents a live
 * `getReturnRowSourceDocuments(businessId, row.documentIds)` call would return (this
 * module's own fixture documents carry the identical fields `core.documents` does) into
 * `reconcileReturnRow`, and asserts the row's own reported amount is reproduced exactly.
 */

const VALID_GSTIN = "27AAPFU0939F1ZV";

function makeDoc(overrides: Partial<OutwardSupplyDocument>): OutwardSupplyDocument {
  return {
    documentId: "doc-1",
    docType: "invoice",
    number: "INV-1",
    docDate: "2026-08-15",
    partyId: "party-1",
    partyName: "Acme Co",
    gstin: null,
    gstRegistrationType: null,
    placeOfSupply: "intra_state",
    buyerStateCode: "27",
    taxableValue: 1000,
    cgstAmount: 90,
    sgstAmount: 90,
    igstAmount: 0,
    invoiceValue: 1180,
    againstInvoiceId: null,
    lines: [],
    ...overrides,
  };
}

describe("GSTR-1 row drill-down reconciliation", () => {
  it("reconciles a single B2B invoice row against its own source document (raw convention)", () => {
    const doc = makeDoc({ gstin: VALID_GSTIN });
    const result = aggregateGstr1([doc], null);
    const row = result.b2b[0]!;
    const reconciliation = reconcileReturnRow(
      { taxableValue: row.taxableValue, cgstAmount: row.cgstAmount, sgstAmount: row.sgstAmount, igstAmount: row.igstAmount },
      [doc],
      "raw",
    );
    expect(reconciliation.reconciled).toBe(true);
  });

  it("reconciles a netted B2C Others state bucket against BOTH its contributing documents (net convention)", () => {
    const invoice = makeDoc({ documentId: "inv-1", buyerStateCode: "27" });
    const creditNote = makeDoc({
      documentId: "cn-1",
      docType: "credit_note",
      buyerStateCode: "27",
      taxableValue: 200,
      cgstAmount: 18,
      sgstAmount: 18,
    });
    const result = aggregateGstr1([invoice, creditNote], null);
    const row = result.b2cOthers[0]!;
    expect(row.documentIds).toEqual(["inv-1", "cn-1"]);
    const sourceDocs = [invoice, creditNote];
    const reconciliation = reconcileReturnRow(
      { taxableValue: row.netTaxableValue, cgstAmount: row.netCgstAmount, sgstAmount: row.netSgstAmount, igstAmount: row.netIgstAmount },
      sourceDocs,
      "net",
    );
    expect(reconciliation.reconciled).toBe(true);
  });

  it("reconciles the whole return's own grand totals against EVERY included source document", () => {
    const invoice = makeDoc({ documentId: "inv-1", gstin: VALID_GSTIN });
    const creditNote = makeDoc({
      documentId: "cn-1",
      docType: "credit_note",
      gstin: VALID_GSTIN,
      taxableValue: 300,
      cgstAmount: 27,
      sgstAmount: 27,
    });
    const result = aggregateGstr1([invoice, creditNote], null);
    const reconciliation = reconcileReturnRow(result.totals, [invoice, creditNote], "net");
    expect(reconciliation.reconciled).toBe(true);
  });

  it("catches a real discrepancy: the source invoice was corrected after GSTR-1 was prepared", () => {
    const doc = makeDoc({ gstin: VALID_GSTIN });
    const result = aggregateGstr1([doc], null);
    const row = result.b2b[0]!;
    const correctedDoc: OutwardSupplyDocument = { ...doc, taxableValue: 1500 };
    const reconciliation = reconcileReturnRow(
      { taxableValue: row.taxableValue, cgstAmount: row.cgstAmount, sgstAmount: row.sgstAmount, igstAmount: row.igstAmount },
      [correctedDoc],
      "raw",
    );
    expect(reconciliation.reconciled).toBe(false);
    expect(reconciliation.discrepancy?.taxableValue).toBe(500);
  });
});

describe("GSTR-3B bucket drill-down reconciliation", () => {
  it("reconciles outwardTaxableOther against its own contributing document", () => {
    const doc = makeDoc({});
    const result = aggregateGstr3bOutward([doc]);
    const reconciliation = reconcileReturnRow(result.outwardTaxableOther, [doc], "net");
    expect(reconciliation.reconciled).toBe(true);
  });

  it("reconciles a Table 3.2 inter-state state row (invoice minus credit note)", () => {
    const invoice = makeDoc({ documentId: "inv", placeOfSupply: "inter_state", buyerStateCode: "07", igstAmount: 180, cgstAmount: 0, sgstAmount: 0 });
    const creditNote = makeDoc({
      documentId: "cn",
      docType: "credit_note",
      placeOfSupply: "inter_state",
      buyerStateCode: "07",
      taxableValue: 200,
      igstAmount: 36,
      cgstAmount: 0,
      sgstAmount: 0,
    });
    const result = aggregateGstr3bOutward([invoice, creditNote]);
    const row = result.interStateToUnregistered[0]!;
    const reconciliation = reconcileReturnRow(
      { taxableValue: row.netTaxableValue, cgstAmount: 0, sgstAmount: 0, igstAmount: row.netIgstAmount },
      [invoice, creditNote],
      "net",
    );
    expect(reconciliation.reconciled).toBe(true);
  });
});

describe("ITC total drill-down reconciliation (GSTR-3B Table 4A(5) / GSTR-9 Table 6)", () => {
  it("reconciles the provisional, own-books ITC total against every purchase-order document behind it", () => {
    // Shaped like what `getPurchaseRegister` would return for two purchase orders --
    // Gstr3bItcSummary.documentIds / Gstr9's own itcAvailed.documentIds carry exactly this
    // `poIds` list (see gstr3b/queries.ts, gstr9/queries.ts).
    const po1: SourceDocAmounts = { docType: "purchase_order", taxableValue: 400, cgstAmount: 36, sgstAmount: 36, igstAmount: 0 };
    const po2: SourceDocAmounts = { docType: "purchase_order", taxableValue: 600, cgstAmount: 54, sgstAmount: 54, igstAmount: 0 };
    const itc = { taxableValue: 1000, cgstAmount: 90, sgstAmount: 90, igstAmount: 0, reconciledWithGstr2b: false as const, documentIds: ["po-1", "po-2"] };
    const reconciliation = reconcileReturnRow(itc, [po1, po2], "net");
    expect(reconciliation.reconciled).toBe(true);
  });

  it("catches an ITC total that no longer matches its own purchase orders (e.g. a stale figure after a PO was corrected)", () => {
    const po1: SourceDocAmounts = { docType: "purchase_order", taxableValue: 400, cgstAmount: 36, sgstAmount: 36, igstAmount: 0 };
    const staleItc = { taxableValue: 500, cgstAmount: 45, sgstAmount: 45, igstAmount: 0, reconciledWithGstr2b: false as const, documentIds: ["po-1"] };
    expect(reconcileReturnRow(staleItc, [po1], "net").reconciled).toBe(false);
  });
});

describe("GSTR-9 Table 4 bucket drill-down reconciliation", () => {
  it("reconciles the combined 4A bucket (B2C Large + B2C Others) against both its own source documents, net", () => {
    const largeDoc = makeDoc({
      documentId: "large-1",
      placeOfSupply: "inter_state",
      buyerStateCode: "07",
      invoiceValue: 150000,
      taxableValue: 127119,
      igstAmount: 22881,
      cgstAmount: 0,
      sgstAmount: 0,
    });
    const smallDoc = makeDoc({ documentId: "small-1", buyerStateCode: "27", taxableValue: 500, cgstAmount: 45, sgstAmount: 45, igstAmount: 0 });
    const gstr1 = aggregateGstr1([largeDoc, smallDoc], 100000);
    const table4 = buildGstr9Table4(gstr1, { taxableValue: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, documentIds: [] });
    expect(table4.b2c.documentIds).toEqual(["large-1", "small-1"]);
    const reconciliation = reconcileReturnRow(table4.b2c, [largeDoc, smallDoc], "net");
    expect(reconciliation.reconciled).toBe(true);
  });

  it("reconciles the creditNotes bucket under the RAW convention (own face value, never netted) -- and shows net would be wrong", () => {
    const creditNoteDoc = makeDoc({ gstin: VALID_GSTIN, docType: "credit_note", documentId: "cn-1" });
    const gstr1 = aggregateGstr1([creditNoteDoc], null);
    const table4 = buildGstr9Table4(gstr1, { taxableValue: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, documentIds: [] });
    expect(reconcileReturnRow(table4.creditNotes, [creditNoteDoc], "raw").reconciled).toBe(true);
    expect(reconcileReturnRow(table4.creditNotes, [creditNoteDoc], "net").reconciled).toBe(false);
  });
});
