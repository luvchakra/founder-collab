import { describe, expect, it } from "vitest";
import {
  agingByParty,
  buildOpenReceivables,
  creditedInvoiceId,
  isReceivable,
  summariseReceivables,
  type ReceivableDocument,
} from "./receivables";

const ASOF = new Date("2026-09-17T12:00:00Z");

function invoice(over: Partial<ReceivableDocument> & { id: string }): ReceivableDocument {
  return {
    doc_type: "invoice",
    number: `INV-${over.id}`,
    status: "issued",
    party_id: "cust-1",
    doc_date: "2026-09-01",
    due_date: "2026-09-15",
    total_amount: 1000,
    source_ref: null,
    ...over,
  };
}

const names = new Map([
  ["cust-1", "Acme Ltd"],
  ["cust-2", "Beta Traders"],
]);

const build = (
  docs: ReceivableDocument[],
  paid = new Map<string, number>(),
  credited = new Map<string, number>(),
) => buildOpenReceivables(docs, paid, credited, names, ASOF);

describe("which documents are receivable", () => {
  it("counts invoices and debit notes", () => {
    expect(isReceivable(invoice({ id: "a" }))).toBe(true);
    expect(isReceivable(invoice({ id: "b", doc_type: "debit_note" }))).toBe(true);
  });

  it("ignores documents that are commitments, not debts", () => {
    for (const docType of ["estimate", "sales_order", "purchase_order", "credit_note"]) {
      expect(isReceivable(invoice({ id: "x", doc_type: docType })), docType).toBe(false);
    }
  });

  // A voided invoice is offset by its own credit note in the ledger; it must not also be
  // chased.
  it("ignores drafts, cancellations and voids", () => {
    for (const status of ["draft", "cancelled", "voided"]) {
      expect(isReceivable(invoice({ id: "x", status })), status).toBe(false);
    }
  });
});

describe("linking a credit note to its invoice", () => {
  // Service and Inventory chose different names for the same link. Reading only one
  // would silently overstate receivables for whichever module the reader forgot.
  it("reads Service's key", () => {
    expect(creditedInvoiceId({ invoice_id: "inv-1" })).toBe("inv-1");
  });

  it("reads Inventory's key", () => {
    expect(creditedInvoiceId({ sales_invoice_id: "inv-2" })).toBe("inv-2");
  });

  it("returns nothing for a credit note that names no invoice", () => {
    expect(creditedInvoiceId(null)).toBeNull();
    expect(creditedInvoiceId({})).toBeNull();
    expect(creditedInvoiceId({ invoice_id: 42 })).toBeNull();
  });
});

describe("what is still owed", () => {
  it("shows an unpaid invoice at its full value", () => {
    const [item] = build([invoice({ id: "a" })]);
    expect(item!.outstanding).toBe(1000);
    expect(item!.status).toBe("unpaid");
  });

  it("nets off what has been paid", () => {
    const [item] = build([invoice({ id: "a" })], new Map([["a", 400]]));
    expect(item!.outstanding).toBe(600);
    expect(item!.status).toBe("partially_paid");
  });

  // A credit note reduces what is owed without money moving, which is why it is counted
  // separately from a payment.
  it("nets off credit notes as well as payments", () => {
    const [item] = build([invoice({ id: "a" })], new Map([["a", 200]]), new Map([["a", 300]]));
    expect(item!.outstanding).toBe(500);
    expect(item!.credited).toBe(300);
  });

  // A receivables screen is a list of what to chase; every paid invoice ever raised
  // would bury it.
  it("drops a document that owes nothing", () => {
    expect(build([invoice({ id: "a" })], new Map([["a", 1000]]))).toEqual([]);
    expect(build([invoice({ id: "a" })], new Map(), new Map([["a", 1000]]))).toEqual([]);
  });

  it("drops an overpaid document rather than reporting a negative debt", () => {
    expect(build([invoice({ id: "a" })], new Map([["a", 1200]]))).toEqual([]);
  });

  it("names the customer", () => {
    expect(build([invoice({ id: "a" })])[0]!.partyName).toBe("Acme Ltd");
  });

  it("says so plainly when the customer can't be resolved", () => {
    expect(build([invoice({ id: "a", party_id: "ghost" })])[0]!.partyName).toBe("Unknown customer");
  });
});

describe("aging", () => {
  it("buckets by how far past the due date each invoice is", () => {
    const items = build([
      invoice({ id: "future", due_date: "2026-10-01" }),
      invoice({ id: "recent", due_date: "2026-09-10" }),
      invoice({ id: "old", due_date: "2026-08-01" }),
      invoice({ id: "ancient", due_date: "2026-01-01" }),
    ]);
    const bucketOf = Object.fromEntries(items.map((i) => [i.id, i.bucket]));
    expect(bucketOf.future).toBe("current");
    expect(bucketOf.recent).toBe("1-30");
    expect(bucketOf.old).toBe("31-60");
    expect(bucketOf.ancient).toBe("90+");
  });

  // Absent a due date there is nothing to be late against, and guessing one would
  // invent overdue debt.
  it("treats an invoice with no due date as current", () => {
    expect(build([invoice({ id: "a", due_date: null })])[0]!.bucket).toBe("current");
  });

  it("puts the oldest due date at the top, where what to chase today belongs", () => {
    const items = build([
      invoice({ id: "b", due_date: "2026-09-10" }),
      invoice({ id: "a", due_date: "2026-08-01" }),
      invoice({ id: "c", due_date: null }),
    ]);
    expect(items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("splits the total between not-yet-due and overdue", () => {
    const summary = summariseReceivables(
      build([
        invoice({ id: "a", due_date: "2026-10-01" }),
        invoice({ id: "b", due_date: "2026-08-01" }),
      ]),
    );
    expect(summary.totalOutstanding).toBe(2000);
    expect(summary.notYetDue).toBe(1000);
    expect(summary.overdue).toBe(1000);
    expect(summary.count).toBe(2);
  });

  it("reports nothing owed as nothing owed, not as an error", () => {
    const summary = summariseReceivables([]);
    expect(summary.totalOutstanding).toBe(0);
    expect(summary.count).toBe(0);
  });
});

describe("who owes the most", () => {
  const items = build([
    invoice({ id: "a", party_id: "cust-1", total_amount: 500, due_date: "2026-08-01" }),
    invoice({ id: "b", party_id: "cust-1", total_amount: 300, due_date: "2026-10-01" }),
    invoice({ id: "c", party_id: "cust-2", total_amount: 2000, due_date: "2026-09-10" }),
  ]);

  it("groups by customer, largest debt first", () => {
    const byParty = agingByParty(items);
    expect(byParty.map((p) => p.partyName)).toEqual(["Beta Traders", "Acme Ltd"]);
    expect(byParty[0]!.total).toBe(2000);
    expect(byParty[1]!.total).toBe(800);
  });

  it("spreads one customer's debt across its own buckets", () => {
    const acme = agingByParty(items).find((p) => p.partyId === "cust-1")!;
    expect(acme.buckets["31-60"]).toBe(500);
    expect(acme.buckets.current).toBe(300);
    expect(acme.count).toBe(2);
  });

  // The per-customer view and the row above it must never disagree about which bucket
  // an invoice is in.
  it("agrees with the overall summary", () => {
    const byParty = agingByParty(items);
    const summary = summariseReceivables(items);
    const partyTotal = byParty.reduce((s, p) => s + p.total, 0);
    expect(Math.round(partyTotal * 100) / 100).toBe(summary.totalOutstanding);
    for (const bucket of ["current", "1-30", "31-60", "61-90", "90+"] as const) {
      const fromParties = byParty.reduce((s, p) => s + p.buckets[bucket], 0);
      expect(Math.round(fromParties * 100) / 100, bucket).toBe(summary.buckets[bucket]);
    }
  });
});
