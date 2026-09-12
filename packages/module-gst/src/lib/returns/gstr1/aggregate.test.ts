import { describe, expect, it } from "vitest";
import { aggregateGstr1 } from "./aggregate";
import type { Gstr1SourceDocument } from "./types";

const VALID_GSTIN = "27AAPFU0939F1ZV";

function makeDoc(overrides: Partial<Gstr1SourceDocument>): Gstr1SourceDocument {
  return {
    documentId: "doc-1",
    docType: "invoice",
    number: "INV-1",
    docDate: "2026-08-15",
    partyId: "party-1",
    partyName: "Acme Co",
    gstin: null,
    placeOfSupply: "intra_state",
    buyerStateCode: "27",
    taxableValue: 1000,
    cgstAmount: 90,
    sgstAmount: 90,
    igstAmount: 0,
    invoiceValue: 1180,
    againstInvoiceId: null,
    lines: [{ hsnCode: "1006", quantity: 10, taxableValue: 1000, cgstAmount: 90, sgstAmount: 90, igstAmount: 0 }],
    ...overrides,
  };
}

const THRESHOLD = 100000;

describe("aggregateGstr1", () => {
  it("puts a B2B invoice in the b2b table and includes it in totals and HSN summary", () => {
    const result = aggregateGstr1([makeDoc({ gstin: VALID_GSTIN })], THRESHOLD);
    expect(result.b2b).toHaveLength(1);
    expect(result.b2b[0]?.recipientGstin).toBe(VALID_GSTIN);
    expect(result.totals.taxableValue).toBe(1000);
    expect(result.hsnSummary).toEqual([
      { hsnCode: "1006", totalQuantity: 10, totalValue: 1180, taxableValue: 1000, cgstAmount: 90, sgstAmount: 90, igstAmount: 0 },
    ]);
    expect(result.b2cOthers).toHaveLength(0);
  });

  it("puts an inter-state unregistered invoice above the threshold in b2cLarge, not b2cOthers", () => {
    const result = aggregateGstr1(
      [
        makeDoc({
          placeOfSupply: "inter_state",
          buyerStateCode: "07",
          invoiceValue: 150000,
          taxableValue: 127119,
          igstAmount: 22881,
          cgstAmount: 0,
          sgstAmount: 0,
        }),
      ],
      THRESHOLD,
    );
    expect(result.b2cLarge).toHaveLength(1);
    expect(result.b2cOthers).toHaveLength(0);
  });

  it("nets a small unregistered invoice into the b2cOthers state bucket", () => {
    const result = aggregateGstr1([makeDoc({ buyerStateCode: "27" })], THRESHOLD);
    expect(result.b2cOthers).toEqual([
      { buyerStateCode: "27", netTaxableValue: 1000, netCgstAmount: 90, netSgstAmount: 90, netIgstAmount: 0, documentIds: ["doc-1"] },
    ]);
  });

  it("subtracts a credit note from the same state's b2cOthers net figures", () => {
    const invoice = makeDoc({ documentId: "doc-1", buyerStateCode: "27", taxableValue: 1000, cgstAmount: 90, sgstAmount: 90 });
    const creditNote = makeDoc({
      documentId: "doc-2",
      docType: "credit_note",
      buyerStateCode: "27",
      taxableValue: 200,
      cgstAmount: 18,
      sgstAmount: 18,
      lines: [{ hsnCode: "1006", quantity: 2, taxableValue: 200, cgstAmount: 18, sgstAmount: 18, igstAmount: 0 }],
    });
    const result = aggregateGstr1([invoice, creditNote], THRESHOLD);
    expect(result.b2cOthers).toEqual([
      {
        buyerStateCode: "27",
        netTaxableValue: 800,
        netCgstAmount: 72,
        netSgstAmount: 72,
        netIgstAmount: 0,
        documentIds: ["doc-1", "doc-2"],
      },
    ]);
    expect(result.totals).toEqual({ taxableValue: 800, cgstAmount: 72, sgstAmount: 72, igstAmount: 0 });
    expect(result.hsnSummary[0]).toMatchObject({ totalQuantity: 8, taxableValue: 800 });
  });

  it("puts a credit note to a registered GSTIN in cdnr, and to an unregistered above-threshold buyer in cdnur", () => {
    const cdnr = makeDoc({ documentId: "cdnr-1", docType: "credit_note", gstin: VALID_GSTIN, placeOfSupply: "inter_state" });
    const cdnur = makeDoc({
      documentId: "cdnur-1",
      docType: "credit_note",
      placeOfSupply: "inter_state",
      invoiceValue: 200000,
    });
    const result = aggregateGstr1([cdnr, cdnur], THRESHOLD);
    expect(result.creditDebitNotes).toHaveLength(2);
    expect(result.creditDebitNotes.find((n) => n.documentId === "cdnr-1")?.recipientGstin).toBe(VALID_GSTIN);
    expect(result.creditDebitNotes.find((n) => n.documentId === "cdnur-1")?.recipientGstin).toBeNull();
  });

  it("excludes an export document, never placing it in any table", () => {
    const result = aggregateGstr1([makeDoc({ placeOfSupply: "export", buyerStateCode: null })], THRESHOLD);
    expect(result.excluded).toEqual([{ documentId: "doc-1", reason: "export" }]);
    expect(result.b2b).toHaveLength(0);
    expect(result.b2cOthers).toHaveLength(0);
    expect(result.totals).toEqual({ taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 });
    expect(result.hsnSummary).toHaveLength(0);
  });

  it("excludes a document with unknown place of supply", () => {
    const result = aggregateGstr1([makeDoc({ placeOfSupply: "unknown", buyerStateCode: null })], THRESHOLD);
    expect(result.excluded).toEqual([{ documentId: "doc-1", reason: "unknown_place_of_supply" }]);
  });

  it("treats a b2c_others_net document with no resolvable state as excluded, defensively", () => {
    const result = aggregateGstr1([makeDoc({ placeOfSupply: "intra_state", buyerStateCode: null })], THRESHOLD);
    expect(result.excluded).toEqual([{ documentId: "doc-1", reason: "unknown_place_of_supply" }]);
    expect(result.totals).toEqual({ taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 });
  });

  it("aggregates multiple line HSN codes across multiple documents", () => {
    const docA = makeDoc({
      documentId: "a",
      gstin: VALID_GSTIN,
      lines: [{ hsnCode: "1006", quantity: 5, taxableValue: 500, cgstAmount: 45, sgstAmount: 45, igstAmount: 0 }],
    });
    const docB = makeDoc({
      documentId: "b",
      gstin: VALID_GSTIN,
      lines: [{ hsnCode: "1006", quantity: 3, taxableValue: 300, cgstAmount: 27, sgstAmount: 27, igstAmount: 0 }],
    });
    const result = aggregateGstr1([docA, docB], THRESHOLD);
    expect(result.hsnSummary).toHaveLength(1);
    expect(result.hsnSummary[0]?.totalQuantity).toBe(8);
    expect(result.hsnSummary[0]?.taxableValue).toBe(800);
  });
});
