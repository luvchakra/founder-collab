import { describe, expect, it } from "vitest";
import { aggregateGstr3bOutward } from "./aggregate";
import type { OutwardSupplyDocument } from "../shared/types";

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

describe("aggregateGstr3bOutward", () => {
  it("puts an intra-state supply in outwardTaxableOther and nowhere in Table 3.2", () => {
    const result = aggregateGstr3bOutward([makeDoc({})]);
    expect(result.outwardTaxableOther).toEqual({ taxableValue: 1000, igstAmount: 0, cgstAmount: 90, sgstAmount: 90, documentIds: ["doc-1"] });
    expect(result.outwardZeroRated.documentIds).toHaveLength(0);
    expect(result.interStateToUnregistered).toHaveLength(0);
    expect(result.interStateToComposition).toHaveLength(0);
  });

  it("puts an export in outwardZeroRated, not outwardTaxableOther", () => {
    const result = aggregateGstr3bOutward([makeDoc({ placeOfSupply: "export", buyerStateCode: null, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 })]);
    expect(result.outwardZeroRated.taxableValue).toBe(1000);
    expect(result.outwardTaxableOther.documentIds).toHaveLength(0);
  });

  it("excludes a document with unknown place of supply from every bucket", () => {
    const result = aggregateGstr3bOutward([makeDoc({ placeOfSupply: "unknown", buyerStateCode: null })]);
    expect(result.excludedUnknownPlaceOfSupply).toEqual(["doc-1"]);
    expect(result.outwardTaxableOther.documentIds).toHaveLength(0);
    expect(result.outwardZeroRated.documentIds).toHaveLength(0);
  });

  it("double-counts an inter-state unregistered supply into both outwardTaxableOther and Table 3.2 (a subset view, not a deduction)", () => {
    const doc = makeDoc({
      placeOfSupply: "inter_state",
      buyerStateCode: "07",
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 180,
    });
    const result = aggregateGstr3bOutward([doc]);
    expect(result.outwardTaxableOther).toEqual({ taxableValue: 1000, igstAmount: 180, cgstAmount: 0, sgstAmount: 0, documentIds: ["doc-1"] });
    expect(result.interStateToUnregistered).toEqual([{ buyerStateCode: "07", netTaxableValue: 1000, netIgstAmount: 180, documentIds: ["doc-1"] }]);
  });

  it("buckets an inter-state composition-dealer supply into interStateToComposition, not interStateToUnregistered", () => {
    const doc = makeDoc({
      placeOfSupply: "inter_state",
      buyerStateCode: "07",
      gstin: "27AAPFU0939F1ZV",
      gstRegistrationType: "composition",
      igstAmount: 180,
      cgstAmount: 0,
      sgstAmount: 0,
    });
    const result = aggregateGstr3bOutward([doc]);
    expect(result.interStateToComposition).toEqual([{ buyerStateCode: "07", netTaxableValue: 1000, netIgstAmount: 180, documentIds: ["doc-1"] }]);
    expect(result.interStateToUnregistered).toHaveLength(0);
  });

  it("does not put an inter-state supply to a validly-registered regular recipient in Table 3.2", () => {
    const doc = makeDoc({
      placeOfSupply: "inter_state",
      buyerStateCode: "07",
      gstin: "27AAPFU0939F1ZV",
      gstRegistrationType: "regular",
      igstAmount: 180,
      cgstAmount: 0,
      sgstAmount: 0,
    });
    const result = aggregateGstr3bOutward([doc]);
    expect(result.outwardTaxableOther.taxableValue).toBe(1000);
    expect(result.interStateToUnregistered).toHaveLength(0);
    expect(result.interStateToComposition).toHaveLength(0);
  });

  it("subtracts a credit note from the same state's Table 3.2 net figures", () => {
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
    expect(result.interStateToUnregistered).toEqual([
      { buyerStateCode: "07", netTaxableValue: 800, netIgstAmount: 144, documentIds: ["inv", "cn"] },
    ]);
    expect(result.outwardTaxableOther.taxableValue).toBe(800);
  });
});
