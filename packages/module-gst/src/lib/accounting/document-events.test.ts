import { describe, expect, it } from "vitest";
import {
  financeEventFromAllocation,
  financeEventFromDocument,
  taxableValueOf,
  type PostableDocument,
} from "./document-events";
import { idempotencyKeyFor } from "./events";
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

describe("settling a payment", () => {
  const allocation = {
    allocationId: "alloc-1",
    amount: 600,
    paymentDate: "2026-09-18",
    method: "bank",
    reference: null,
    partyId: "party-1",
    docType: "invoice",
    documentId: "doc-1",
  };

  it("posts a receipt when the payment settles an invoice", () => {
    expect(financeEventFromAllocation(allocation)?.type).toBe("payment.received");
  });

  // core.payments has no direction column; the document the payment was applied to is
  // what says which way the money went.
  it("posts money out when the payment settles a purchase", () => {
    expect(financeEventFromAllocation({ ...allocation, docType: "purchase_order" })?.type).toBe(
      "supplier_bill.paid",
    );
  });

  // An advance against work not yet billed is real, but it settles no receivable, and
  // posting it as one would credit a debt that was never raised.
  it("posts nothing for a payment against a quote", () => {
    expect(financeEventFromAllocation({ ...allocation, docType: "estimate" })).toBeNull();
  });

  it("sends cash to cash and everything else to the bank", () => {
    expect(financeEventFromAllocation({ ...allocation, method: "cash" })?.settlementAccountRole).toBe("cash");
    for (const method of ["bank", "cheque", "upi", "card_offline"]) {
      expect(
        financeEventFromAllocation({ ...allocation, method })?.settlementAccountRole,
        method,
      ).toBe("bank");
    }
  });

  // A payment split across three invoices is three settlements; each needs its own
  // identity or a redelivery of one would collide with the others.
  it("keys each allocation separately, so a split payment posts three times", () => {
    const first = financeEventFromAllocation({ ...allocation, allocationId: "a1" })!;
    const second = financeEventFromAllocation({ ...allocation, allocationId: "a2" })!;
    expect(idempotencyKeyFor(first)).not.toBe(idempotencyKeyFor(second));
  });

  it("gives a redelivery of the same allocation the same key", () => {
    expect(idempotencyKeyFor(financeEventFromAllocation(allocation)!)).toBe(
      idempotencyKeyFor(financeEventFromAllocation({ ...allocation })!),
    );
  });

  it("posts nothing for a zero or negative allocation", () => {
    expect(financeEventFromAllocation({ ...allocation, amount: 0 })).toBeNull();
    expect(financeEventFromAllocation({ ...allocation, amount: -5 })).toBeNull();
  });

  // The whole point: the receipt has to clear the receivable the invoice raised, or the
  // two Finance screens disagree.
  it("clears the receivable the invoice raised", () => {
    const plan = planPosting(financeEventFromAllocation(allocation)!) as PostingPlan;
    expect(plan.posted).toBe(true);
    const ar = plan.lines.filter((l) => l.role === "accounts_receivable");
    expect(ar.reduce((s, l) => s + l.credit, 0)).toBe(600);
    expect(plan.lines.filter((l) => l.role === "bank").reduce((s, l) => s + l.debit, 0)).toBe(600);
  });

  it("does not book revenue a second time", () => {
    const plan = planPosting(financeEventFromAllocation(allocation)!) as PostingPlan;
    expect(plan.lines.some((l) => l.role.includes("revenue"))).toBe(false);
  });
});

describe("supplier bills", () => {
  const bill = doc({
    doc_type: "supplier_bill",
    source_module: "inventory",
    subtotal: 2000,
    cgst_amount: 180,
    sgst_amount: 180,
    total_amount: 2360,
  });

  it("posts a supplier bill as one", () => {
    expect(financeEventFromDocument(bill)?.type).toBe("supplier_bill.created");
  });

  // The posting rule puts `valueAccountRole` on the DEBIT side, so handing it a revenue
  // role would debit revenue with the cost of the bill — turning every purchase into
  // negative income.
  it("never puts a purchase's value against a revenue account", () => {
    expect(financeEventFromDocument(bill)?.valueAccountRole).toBeUndefined();
    const plan = planPosting(financeEventFromDocument(bill)!) as PostingPlan;
    expect(plan.lines.some((l) => l.role.includes("revenue"))).toBe(false);
  });

  it("owes the supplier the gross, with the cost and input GST on the debit side", () => {
    const plan = planPosting(financeEventFromDocument(bill)!) as PostingPlan;
    expect(plan.posted).toBe(true);
    expect(plan.lines.filter((l) => l.role === "accounts_payable").reduce((s, l) => s + l.credit, 0)).toBe(2360);
    expect(plan.lines.filter((l) => l.role === "inventory_asset").reduce((s, l) => s + l.debit, 0)).toBe(2000);
    expect(plan.lines.filter((l) => l.role === "input_gst").reduce((s, l) => s + l.debit, 0)).toBe(360);
  });

  it("balances", () => {
    const plan = planPosting(financeEventFromDocument(bill)!) as PostingPlan;
    expect(plan.lines.reduce((s, l) => s + l.debit - l.credit, 0)).toBe(0);
  });

  it("does not post a draft bill", () => {
    expect(financeEventFromDocument({ ...bill, status: "draft" })).toBeNull();
  });

  // Paying a supplier settles a payable; it is not a receipt.
  it("settles the payable when the bill is paid, not the receivable", () => {
    const event = financeEventFromAllocation({
      allocationId: "alloc-b",
      amount: 2360,
      paymentDate: "2026-09-18",
      method: "bank",
      reference: null,
      partyId: "supplier-1",
      docType: "supplier_bill",
      documentId: "bill-1",
    })!;
    expect(event.type).toBe("supplier_bill.paid");
    const plan = planPosting(event) as PostingPlan;
    expect(plan.lines.filter((l) => l.role === "accounts_payable").reduce((s, l) => s + l.debit, 0)).toBe(2360);
    expect(plan.lines.filter((l) => l.role === "bank").reduce((s, l) => s + l.credit, 0)).toBe(2360);
  });

  it("reverses stock and the payable on a supplier credit", () => {
    const plan = planPosting(
      financeEventFromDocument({ ...bill, doc_type: "supplier_credit" })!,
    ) as PostingPlan;
    expect(plan.lines.filter((l) => l.role === "accounts_payable").reduce((s, l) => s + l.debit, 0)).toBeGreaterThan(0);
  });
});
