import { describe, expect, it } from "vitest";
import { financeEventFromDocument, taxableValueOf, type PostableDocument } from "./document-events";
import { planPosting, type PostingPlan } from "./posting-rules";

function doc(over: Partial<PostableDocument> = {}): PostableDocument {
  return {
    id: "doc-1",
    doc_type: "invoice",
    source_module: "fsm",
    party_id: "party-1",
    doc_date: "2026-09-17",
    status: "issued",
    subtotal: 1000,
    discount_amount: 0,
    shipping_amount: 0,
    cgst_amount: 90,
    sgst_amount: 90,
    igst_amount: 0,
    total_amount: 1180,
    ...over,
  };
}

describe("which documents post", () => {
  it("posts an issued invoice", () => {
    expect(financeEventFromDocument(doc())?.type).toBe("invoice.finalized");
  });

  it("maps credit and debit notes to their own events", () => {
    expect(financeEventFromDocument(doc({ doc_type: "credit_note" }))?.type).toBe("credit_note.created");
    expect(financeEventFromDocument(doc({ doc_type: "debit_note" }))?.type).toBe("debit_note.created");
  });

  // A sales return reverses a sale, which is what a credit note does.
  it("treats a sales return as a credit note", () => {
    expect(financeEventFromDocument(doc({ doc_type: "sales_return" }))?.type).toBe("credit_note.created");
  });

  // A quote or an order is a commitment, not a transaction: no revenue has been earned
  // and no money has moved.
  it("posts nothing for a commitment", () => {
    for (const docType of ["estimate", "sales_order", "purchase_order", "proforma_invoice"]) {
      expect(financeEventFromDocument(doc({ doc_type: docType })), docType).toBeNull();
    }
  });

  it("posts nothing for a draft or a cancelled document", () => {
    expect(financeEventFromDocument(doc({ status: "draft" }))).toBeNull();
    expect(financeEventFromDocument(doc({ status: "cancelled" }))).toBeNull();
  });

  it("posts nothing for a document with no value at all", () => {
    expect(
      financeEventFromDocument(
        doc({ subtotal: 0, cgst_amount: 0, sgst_amount: 0, total_amount: 0 }),
      ),
    ).toBeNull();
  });
});

describe("the taxable value", () => {
  // core.documents' own trigger computes tax on subtotal - discount + shipping; deriving
  // it any other way here would put the entry out of balance against the document.
  it("is the subtotal less discount plus shipping", () => {
    expect(taxableValueOf(doc({ subtotal: 1000, discount_amount: 100, shipping_amount: 50 }))).toBe(950);
  });

  it("rounds to paise", () => {
    expect(taxableValueOf(doc({ subtotal: 0.1, discount_amount: 0, shipping_amount: 0.2 }))).toBe(0.3);
  });
});

describe("where the value lands", () => {
  // Merging goods and work into one "sales" account makes gross margin unreadable.
  it("posts Inventory sales to product revenue and Service work to service revenue", () => {
    expect(financeEventFromDocument(doc({ source_module: "inventory" }))?.valueAccountRole).toBe(
      "product_revenue",
    );
    expect(financeEventFromDocument(doc({ source_module: "fsm" }))?.valueAccountRole).toBe(
      "service_revenue",
    );
  });

  // The package is named fsm; the event vocabulary says service.
  it("speaks the event vocabulary's name for the module", () => {
    expect(financeEventFromDocument(doc({ source_module: "fsm" }))?.sourceModule).toBe("service");
  });

  it("keeps a document from a module it doesn't know postable", () => {
    expect(financeEventFromDocument(doc({ source_module: "payroll" }))?.sourceModule).toBe("finance");
  });
});

describe("what the event carries", () => {
  const event = financeEventFromDocument(doc(), { sourceEventId: "evt-9" })!;

  it("points back at the canonical document and the event that delivered it", () => {
    expect(event.sourceDocumentId).toBe("doc-1");
    expect(event.sourceEventId).toBe("evt-9");
  });

  it("carries the customer, so the receivable has a name against it", () => {
    expect(event.partyId).toBe("party-1");
  });

  it("splits the tax the way the document does", () => {
    expect(event.tax).toEqual({ cgst: 90, sgst: 90, igst: 0 });
  });

  it("dates the entry from the document, not from when it was drained", () => {
    expect(event.occurredAt.slice(0, 10)).toBe("2026-09-17");
  });
});

describe("end to end, document to balanced entry", () => {
  it("produces a balanced posting for an intra-state invoice", () => {
    const plan = planPosting(financeEventFromDocument(doc())!) as PostingPlan;
    expect(plan.posted).toBe(true);
    const debit = plan.lines.reduce((s, l) => s + l.debit, 0);
    const credit = plan.lines.reduce((s, l) => s + l.credit, 0);
    expect(debit).toBe(1180);
    expect(credit).toBe(1180);
  });

  it("produces a balanced posting for an inter-state invoice", () => {
    const plan = planPosting(
      financeEventFromDocument(doc({ cgst_amount: 0, sgst_amount: 0, igst_amount: 180 }))!,
    ) as PostingPlan;
    expect(plan.lines.filter((l) => l.taxCode).map((l) => l.taxCode)).toEqual(["IGST"]);
    expect(plan.lines.reduce((s, l) => s + l.debit - l.credit, 0)).toBe(0);
  });

  // Shipping is part of the consideration for the supply, so it has to reach revenue --
  // otherwise the entry is short by the shipping amount and cannot balance.
  it("balances an invoice that charges shipping", () => {
    const plan = planPosting(
      financeEventFromDocument(
        doc({ subtotal: 1000, shipping_amount: 100, cgst_amount: 99, sgst_amount: 99, total_amount: 1298 }),
      )!,
    ) as PostingPlan;
    expect(plan.posted).toBe(true);
    expect(plan.lines.reduce((s, l) => s + l.debit - l.credit, 0)).toBe(0);
  });

  it("reverses the receivable for a credit note", () => {
    const plan = planPosting(financeEventFromDocument(doc({ doc_type: "credit_note" }))!) as PostingPlan;
    const ar = plan.lines.filter((l) => l.role === "accounts_receivable");
    expect(ar.reduce((s, l) => s + l.credit, 0)).toBe(1180);
  });
});
