import { describe, expect, it } from "vitest";
import {
  accountingStatus,
  countNeedingAttention,
  deriveFinanceInvoice,
  einvoiceStatus,
  filterInvoices,
  gstStatus,
  type InvoiceDocument,
} from "./derive";

// FIN-4 — the Finance invoice view: four statuses, kept independent.

const doc = (overrides: Partial<InvoiceDocument> = {}): InvoiceDocument => ({
  id: "inv-1",
  doc_type: "invoice",
  number: "INV-001",
  source_module: "inventory",
  source_ref: {},
  party_id: "p-1",
  doc_date: "2026-09-10",
  due_date: "2026-10-10",
  status: "issued",
  subtotal: 1000,
  discount_amount: 0,
  shipping_amount: 0,
  cgst_amount: 90,
  sgst_amount: 90,
  igst_amount: 0,
  total_amount: 1180,
  ...overrides,
});

const september = { periodStart: "2026-09-01", periodEnd: "2026-09-30" };

describe("accountingStatus", () => {
  it("is posted when the invoice's own entry is posted", () => {
    expect(accountingStatus(doc(), [{ status: "posted", source_entity_type: "invoice" }])).toBe("posted");
  });

  it("does not count a posted payment as the invoice being posted", () => {
    expect(accountingStatus(doc(), [{ status: "posted", source_entity_type: "payment_allocation" }])).toBe("not_posted");
  });

  it("is reversed when every posting of the invoice has been reversed", () => {
    expect(accountingStatus(doc(), [{ status: "reversed", source_entity_type: "invoice" }])).toBe("reversed");
  });

  it("is 'no entry' for an invoice with no accounting consequence", () => {
    expect(accountingStatus(doc({ status: "cancelled" }), [])).toBe("not_applicable");
    expect(accountingStatus(doc({ subtotal: 0, cgst_amount: 0, sgst_amount: 0, total_amount: 0 }), [])).toBe("not_applicable");
  });
});

describe("gstStatus", () => {
  it("is filed when the covering GSTR-1 period is filed", () => {
    expect(gstStatus(doc(), [{ ...september, status: "filed" }])).toEqual({ status: "filed", returnStatus: "filed" });
  });

  it("is in a return while that period is still being prepared", () => {
    expect(gstStatus(doc(), [{ ...september, status: "in_review" }])).toEqual({ status: "in_return", returnStatus: "in_review" });
  });

  it("is not in a return when no period covers its date", () => {
    expect(gstStatus(doc(), [{ periodStart: "2026-08-01", periodEnd: "2026-08-31", status: "filed" }]).status).toBe("not_in_return");
  });

  it("has nothing to report when it carries no GST", () => {
    expect(gstStatus(doc({ cgst_amount: 0, sgst_amount: 0, total_amount: 1000 }), []).status).toBe("no_gst");
  });
});

describe("einvoiceStatus", () => {
  it("reports the generation record first", () => {
    expect(einvoiceStatus({ status: "generated", irn: "IRN1" }, "boom")).toEqual({ status: "generated", irn: "IRN1", error: null });
  });

  it("reports a failed attempt as failed, keeping its error", () => {
    expect(einvoiceStatus(null, "GSP unreachable")).toEqual({ status: "failed", irn: null, error: "GSP unreachable" });
  });

  it("is not generated when nobody has tried", () => {
    expect(einvoiceStatus(null, null).status).toBe("not_generated");
  });
});

describe("deriveFinanceInvoice keeps the four statuses independent", () => {
  it("can be paid but unposted, filed and never e-invoiced — all at once", () => {
    const invoice = deriveFinanceInvoice({
      document: doc(),
      partyName: "Acme",
      entries: [{ status: "posted", source_entity_type: "payment_allocation" }],
      allocated: 1180,
      credited: 0,
      gstr1Periods: [{ ...september, status: "filed" }],
      einvoice: null,
      failedAttemptError: null,
    });
    expect(invoice.accounting).toBe("not_posted");
    expect(invoice.payment).toEqual({ status: "paid", paid: 1180, credited: 0, outstanding: 0 });
    expect(invoice.gst.status).toBe("filed");
    expect(invoice.einvoice.status).toBe("not_generated");
  });

  it("counts a credit note against what is owed", () => {
    const invoice = deriveFinanceInvoice({
      document: doc(),
      partyName: "Acme",
      entries: [],
      allocated: 500,
      credited: 180,
      gstr1Periods: [],
      einvoice: null,
      failedAttemptError: null,
    });
    expect(invoice.payment).toEqual({ status: "partially_paid", paid: 500, credited: 180, outstanding: 500 });
  });

  it("does not chase a voided invoice for payment", () => {
    const invoice = deriveFinanceInvoice({
      document: doc({ status: "voided" }),
      partyName: "Acme",
      entries: [{ status: "posted", source_entity_type: "invoice" }],
      allocated: 0,
      credited: 1180,
      gstr1Periods: [],
      einvoice: { status: "cancelled", irn: "IRN1" },
      failedAttemptError: null,
    });
    expect(invoice.payment.status).toBe("not_applicable");
    expect(invoice.accounting).toBe("posted");
    expect(invoice.einvoice.status).toBe("cancelled");
  });
});

describe("attention counts and filters", () => {
  const make = (overrides: Parameters<typeof deriveFinanceInvoice>[0]) => deriveFinanceInvoice(overrides);
  const base = { partyName: "A", credited: 0, gstr1Periods: [], einvoice: null };
  const list = [
    make({ ...base, document: doc({ id: "a" }), entries: [], allocated: 0, failedAttemptError: "down" }),
    make({ ...base, document: doc({ id: "b" }), entries: [{ status: "posted", source_entity_type: "invoice" }], allocated: 1180, failedAttemptError: null }),
  ];

  it("counts one per status dimension", () => {
    expect(countNeedingAttention(list)).toEqual({ notPosted: 1, unpaid: 1, notReported: 2, einvoiceFailed: 1 });
  });

  it("filters by one dimension from the URL, showing all for anything unknown", () => {
    expect(filterInvoices(list, "accounting:not_posted").map((i) => i.id)).toEqual(["a"]);
    expect(filterInvoices(list, "einvoice:failed").map((i) => i.id)).toEqual(["a"]);
    expect(filterInvoices(list, "payment:unpaid").map((i) => i.id)).toEqual(["a"]);
    expect(filterInvoices(list, "nonsense")).toHaveLength(2);
  });
});
