import { describe, expect, it } from "vitest";
import { buildGstr9Table4 } from "./aggregate";
import type { Gstr1Aggregation } from "../gstr1/aggregate";
import type { Gstr3bOutwardBucket } from "../gstr3b/types";

function emptyGstr1Aggregation(): Gstr1Aggregation {
  return {
    b2b: [],
    b2cLarge: [],
    b2cOthers: [],
    creditDebitNotes: [],
    hsnSummary: [],
    totals: { taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 },
    excluded: [],
  };
}

function emptyZeroRated(): Gstr3bOutwardBucket {
  return { taxableValue: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, documentIds: [] };
}

describe("buildGstr9Table4", () => {
  it("combines b2b invoices into the 4B bucket", () => {
    const gstr1 = emptyGstr1Aggregation();
    gstr1.b2b.push({
      documentId: "b2b-1",
      invoiceNumber: "INV-1",
      invoiceDate: "2026-05-01",
      recipientGstin: "27AAPFU0939F1ZV",
      recipientName: "Acme",
      invoiceValue: 1180,
      taxableValue: 1000,
      cgstAmount: 90,
      sgstAmount: 90,
      igstAmount: 0,
    });
    const table4 = buildGstr9Table4(gstr1, emptyZeroRated());
    expect(table4.b2b).toEqual({ taxableValue: 1000, igstAmount: 0, cgstAmount: 90, sgstAmount: 90, documentIds: ["b2b-1"] });
    expect(table4.b2c.documentIds).toHaveLength(0);
  });

  it("combines b2cLarge and b2cOthers into one 4A bucket", () => {
    const gstr1 = emptyGstr1Aggregation();
    gstr1.b2cLarge.push({ documentId: "large-1", invoiceNumber: "INV-2", invoiceDate: "2026-05-02", invoiceValue: 150000, taxableValue: 127119, igstAmount: 22881 });
    gstr1.b2cOthers.push({ buyerStateCode: "27", netTaxableValue: 500, netCgstAmount: 45, netSgstAmount: 45, netIgstAmount: 0, documentIds: ["small-1"] });
    const table4 = buildGstr9Table4(gstr1, emptyZeroRated());
    expect(table4.b2c).toEqual({
      taxableValue: 127119 + 500,
      igstAmount: 22881,
      cgstAmount: 45,
      sgstAmount: 45,
      documentIds: ["large-1", "small-1"],
    });
  });

  it("carries the zero-rated export bucket through to 4C unchanged", () => {
    const zeroRated: Gstr3bOutwardBucket = { taxableValue: 5000, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, documentIds: ["exp-1"] };
    const table4 = buildGstr9Table4(emptyGstr1Aggregation(), zeroRated);
    expect(table4.zeroRatedExports).toEqual({ taxableValue: 5000, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, documentIds: ["exp-1"] });
  });

  it("splits credit and debit notes into separate 4I/4J buckets", () => {
    const gstr1 = emptyGstr1Aggregation();
    gstr1.creditDebitNotes.push(
      {
        documentId: "cn-1",
        docType: "credit_note",
        noteNumber: "CN-1",
        noteDate: "2026-05-10",
        recipientGstin: "27AAPFU0939F1ZV",
        recipientName: "Acme",
        againstInvoiceId: null,
        noteValue: 118,
        taxableValue: 100,
        cgstAmount: 9,
        sgstAmount: 9,
        igstAmount: 0,
      },
      {
        documentId: "dn-1",
        docType: "debit_note",
        noteNumber: "DN-1",
        noteDate: "2026-05-11",
        recipientGstin: "27AAPFU0939F1ZV",
        recipientName: "Acme",
        againstInvoiceId: null,
        noteValue: 59,
        taxableValue: 50,
        cgstAmount: 4.5,
        sgstAmount: 4.5,
        igstAmount: 0,
      },
    );
    const table4 = buildGstr9Table4(gstr1, emptyZeroRated());
    expect(table4.creditNotes).toEqual({ taxableValue: 100, igstAmount: 0, cgstAmount: 9, sgstAmount: 9, documentIds: ["cn-1"] });
    expect(table4.debitNotes).toEqual({ taxableValue: 50, igstAmount: 0, cgstAmount: 4.5, sgstAmount: 4.5, documentIds: ["dn-1"] });
  });
});
