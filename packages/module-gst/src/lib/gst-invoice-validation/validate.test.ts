import { describe, expect, it } from "vitest";
import { validateGstInvoiceFields } from "./validate";
import type { DocumentContext, DocumentLineContext } from "../core-transactions/types";

function makeLine(overrides: Partial<DocumentLineContext> = {}): DocumentLineContext {
  return {
    id: "line-1",
    itemId: "item-1",
    description: null,
    quantity: 1,
    unitPrice: 1000,
    hsnCode: "8471",
    taxRate: 18,
    taxable: true,
    cgstAmount: 90,
    sgstAmount: 90,
    igstAmount: 0,
    ...overrides,
  };
}

function makeDocument(overrides: Partial<DocumentContext> = {}): DocumentContext {
  return {
    id: "doc-1",
    businessId: "biz-1",
    docType: "sales_invoice",
    partyId: "party-1",
    number: "INV-0001",
    status: "issued",
    paymentStatus: "unpaid",
    docDate: "2026-09-11",
    dueDate: null,
    subtotal: 1000,
    discountAmount: 0,
    cgstAmount: 90,
    sgstAmount: 90,
    igstAmount: 0,
    shippingAmount: 0,
    totalAmount: 1180,
    lines: [makeLine()],
    ...overrides,
  };
}

describe("validateGstInvoiceFields", () => {
  it("passes a fully valid intra-state invoice with no issues", () => {
    const result = validateGstInvoiceFields({
      document: makeDocument(),
      lineItemKinds: new Map([["item-1", "good"]]),
      placeOfSupply: "intra_state",
    });
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("flags a missing invoice number as an error", () => {
    const result = validateGstInvoiceFields({
      document: makeDocument({ number: null }),
      lineItemKinds: new Map([["item-1", "good"]]),
      placeOfSupply: "intra_state",
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "missing_invoice_number", severity: "error" }),
    );
  });

  it("flags an invoice with no lines as an error", () => {
    const result = validateGstInvoiceFields({
      document: makeDocument({ lines: [] }),
      lineItemKinds: new Map(),
      placeOfSupply: "intra_state",
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "no_lines", severity: "error" }));
  });

  it("flags a taxable line missing its HSN code", () => {
    const result = validateGstInvoiceFields({
      document: makeDocument({ lines: [makeLine({ hsnCode: null })] }),
      lineItemKinds: new Map([["item-1", "good"]]),
      placeOfSupply: "intra_state",
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "line_hsn_sac_missing", severity: "error", lineId: "line-1" }),
    );
  });

  it("flags a taxable line with an invalid HSN/SAC shape", () => {
    const result = validateGstInvoiceFields({
      document: makeDocument({ lines: [makeLine({ hsnCode: "998314" })] }), // SAC on a good
      lineItemKinds: new Map([["item-1", "good"]]),
      placeOfSupply: "intra_state",
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "line_hsn_sac_invalid", severity: "error" }),
    );
  });

  it("skips HSN/SAC validation for a non-taxable line", () => {
    const result = validateGstInvoiceFields({
      document: makeDocument({ lines: [makeLine({ taxable: false, hsnCode: null })] }),
      lineItemKinds: new Map([["item-1", "good"]]),
      placeOfSupply: "intra_state",
    });
    expect(result.valid).toBe(true);
  });

  it("skips HSN/SAC validation for a line whose item kind can't be resolved", () => {
    const result = validateGstInvoiceFields({
      document: makeDocument({ lines: [makeLine({ hsnCode: null })] }),
      lineItemKinds: new Map(), // item-1 not found
      placeOfSupply: "intra_state",
    });
    expect(result.valid).toBe(true);
  });

  it("does not require HSN/SAC on labour/expense lines", () => {
    const result = validateGstInvoiceFields({
      document: makeDocument({ lines: [makeLine({ hsnCode: null, itemId: "item-2" })] }),
      lineItemKinds: new Map([["item-2", "labour"]]),
      placeOfSupply: "intra_state",
    });
    expect(result.valid).toBe(true);
  });

  it("flags an unknown place of supply as an error", () => {
    const result = validateGstInvoiceFields({
      document: makeDocument(),
      lineItemKinds: new Map([["item-1", "good"]]),
      placeOfSupply: "unknown",
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "place_of_supply_unknown", severity: "error" }),
    );
  });

  it("warns (does not block) when an intra-state invoice charges IGST", () => {
    const result = validateGstInvoiceFields({
      document: makeDocument({ cgstAmount: 0, sgstAmount: 0, igstAmount: 180 }),
      lineItemKinds: new Map([["item-1", "good"]]),
      placeOfSupply: "intra_state",
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "tax_split_mismatch", severity: "warning" }),
    );
  });

  it("warns (does not block) when an inter-state invoice charges CGST/SGST", () => {
    const result = validateGstInvoiceFields({
      document: makeDocument({ cgstAmount: 90, sgstAmount: 90, igstAmount: 0 }),
      lineItemKinds: new Map([["item-1", "good"]]),
      placeOfSupply: "inter_state",
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "tax_split_mismatch", severity: "warning" }),
    );
  });

  it("does not warn about tax-split mismatch when the invoice has no tax charged at all", () => {
    const result = validateGstInvoiceFields({
      document: makeDocument({ cgstAmount: 0, sgstAmount: 0, igstAmount: 0 }),
      lineItemKinds: new Map([["item-1", "good"]]),
      placeOfSupply: "inter_state",
    });
    expect(result.issues.filter((i) => i.code === "tax_split_mismatch")).toHaveLength(0);
  });

  it("accumulates multiple independent issues at once", () => {
    const result = validateGstInvoiceFields({
      document: makeDocument({ number: null, docDate: null as unknown as string }),
      lineItemKinds: new Map([["item-1", "good"]]),
      placeOfSupply: "unknown",
    });
    expect(result.valid).toBe(false);
    const codes = result.issues.map((i) => i.code).sort();
    expect(codes).toEqual(["missing_invoice_date", "missing_invoice_number", "place_of_supply_unknown"]);
  });
});
