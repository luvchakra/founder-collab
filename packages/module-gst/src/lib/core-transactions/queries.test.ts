import { describe, expect, it } from "vitest";
import { mapDocument, mapDocumentLine } from "./queries";

describe("core transaction contract mapping", () => {
  it("mapDocumentLine translates a core.document_lines row to camelCase, snapshot fields untouched", () => {
    const line = mapDocumentLine({
      id: "line-1",
      item_id: "item-1",
      description: "Widget",
      quantity: 3,
      unit_price: 100,
      hsn_code: "8471",
      tax_rate: 18,
      taxable: true,
      cgst_amount: 27,
      sgst_amount: 27,
      igst_amount: 0,
    });
    expect(line).toEqual({
      id: "line-1",
      itemId: "item-1",
      description: "Widget",
      quantity: 3,
      unitPrice: 100,
      hsnCode: "8471",
      taxRate: 18,
      taxable: true,
      cgstAmount: 27,
      sgstAmount: 27,
      igstAmount: 0,
    });
  });

  it("mapDocumentLine passes through a null hsn_code/description (not every item has one)", () => {
    const line = mapDocumentLine({
      id: "line-2",
      item_id: "item-2",
      description: null,
      quantity: 1,
      unit_price: 50,
      hsn_code: null,
      tax_rate: 0,
      taxable: false,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
    });
    expect(line.hsnCode).toBeNull();
    expect(line.description).toBeNull();
  });

  it("mapDocument combines a document row with its already-mapped lines", () => {
    const doc = mapDocument(
      {
        id: "doc-1",
        business_id: "biz-1",
        doc_type: "invoice",
        party_id: "party-1",
        number: "INV-0001",
        status: "sent",
        payment_status: "unpaid",
        doc_date: "2026-09-01",
        due_date: "2026-09-15",
        subtotal: 300,
        discount_amount: 0,
        cgst_amount: 27,
        sgst_amount: 27,
        igst_amount: 0,
        shipping_amount: 0,
        total_amount: 354,
      },
      [
        {
          id: "line-1",
          itemId: "item-1",
          description: "Widget",
          quantity: 3,
          unitPrice: 100,
          hsnCode: "8471",
          taxRate: 18,
          taxable: true,
          cgstAmount: 27,
          sgstAmount: 27,
          igstAmount: 0,
        },
      ],
    );
    expect(doc.id).toBe("doc-1");
    expect(doc.businessId).toBe("biz-1");
    expect(doc.docType).toBe("invoice");
    expect(doc.totalAmount).toBe(354);
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0]?.itemId).toBe("item-1");
  });

  it("mapDocument handles zero lines (a document with nothing on it yet)", () => {
    const doc = mapDocument(
      {
        id: "doc-2",
        business_id: "biz-1",
        doc_type: "estimate",
        party_id: "party-1",
        number: null,
        status: "draft",
        payment_status: null,
        doc_date: "2026-09-01",
        due_date: null,
        subtotal: 0,
        discount_amount: 0,
        cgst_amount: 0,
        sgst_amount: 0,
        igst_amount: 0,
        shipping_amount: 0,
        total_amount: 0,
      },
      [],
    );
    expect(doc.lines).toEqual([]);
    expect(doc.number).toBeNull();
  });
});
