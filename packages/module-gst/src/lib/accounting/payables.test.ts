import { describe, expect, it } from "vitest";
import {
  agingBySupplier,
  buildOpenPayables,
  creditedBillId,
  isPayable,
  summarisePayables,
  type PayableDocument,
} from "./payables";

const ASOF = new Date("2026-09-18T12:00:00Z");

function bill(over: Partial<PayableDocument> & { id: string }): PayableDocument {
  return {
    doc_type: "supplier_bill",
    number: `BILL-${over.id}`,
    status: "posted",
    party_id: "supplier-1",
    doc_date: "2026-09-01",
    due_date: "2026-09-15",
    total_amount: 2360,
    source_ref: null,
    ...over,
  };
}

const names = new Map([["supplier-1", "Acme Supplies"], ["supplier-2", "Beta Parts"]]);
const build = (docs: PayableDocument[], paid = new Map<string, number>(), credited = new Map<string, number>()) =>
  buildOpenPayables(docs, paid, credited, names, ASOF);

describe("what counts as owed", () => {
  it("counts a supplier bill", () => {
    expect(isPayable(bill({ id: "a" }))).toBe(true);
  });

  // A purchase order creates no liability and is routinely for a different amount than
  // what is eventually billed. Counting it would inflate payables with money not yet owed.
  it("never counts a purchase order", () => {
    expect(isPayable(bill({ id: "a", doc_type: "purchase_order" }))).toBe(false);
  });

  it("never counts a sales document", () => {
    for (const docType of ["invoice", "credit_note", "estimate"]) {
      expect(isPayable(bill({ id: "a", doc_type: docType })), docType).toBe(false);
    }
  });

  it("ignores drafts, cancellations and voids", () => {
    for (const status of ["draft", "cancelled", "voided"]) {
      expect(isPayable(bill({ id: "a", status })), status).toBe(false);
    }
  });
});

describe("what is still owed", () => {
  it("shows an unpaid bill at its full value", () => {
    const [item] = build([bill({ id: "a" })]);
    expect(item!.outstanding).toBe(2360);
    expect(item!.status).toBe("unpaid");
  });

  it("nets off payments and supplier credits separately", () => {
    const [item] = build([bill({ id: "a" })], new Map([["a", 1000]]), new Map([["a", 360]]));
    expect(item!.outstanding).toBe(1000);
    expect(item!.credited).toBe(360);
    expect(item!.status).toBe("partially_paid");
  });

  it("drops a bill that owes nothing", () => {
    expect(build([bill({ id: "a" })], new Map([["a", 2360]]))).toEqual([]);
  });

  it("names the supplier, and says so when it can't", () => {
    expect(build([bill({ id: "a" })])[0]!.partyName).toBe("Acme Supplies");
    expect(build([bill({ id: "a", party_id: "ghost" })])[0]!.partyName).toBe("Unknown supplier");
  });
});

describe("what to pay next", () => {
  // This is a list of what to pay, so the thing due tomorrow belongs above the thing due
  // in a month.
  it("puts the soonest due first", () => {
    const items = build([
      bill({ id: "later", due_date: "2026-10-30" }),
      bill({ id: "soon", due_date: "2026-09-20" }),
      bill({ id: "undated", due_date: null }),
    ]);
    expect(items.map((i) => i.id)).toEqual(["soon", "later", "undated"]);
  });

  it("buckets by how overdue each bill is", () => {
    const items = build([
      bill({ id: "future", due_date: "2026-10-01" }),
      bill({ id: "recent", due_date: "2026-09-10" }),
      bill({ id: "old", due_date: "2026-07-01" }),
    ]);
    const bucketOf = Object.fromEntries(items.map((i) => [i.id, i.bucket]));
    expect(bucketOf.future).toBe("current");
    expect(bucketOf.recent).toBe("1-30");
    expect(bucketOf.old).toBe("61-90");
  });

  it("splits the total between not yet due and overdue", () => {
    const summary = summarisePayables(
      build([bill({ id: "a", due_date: "2026-10-01" }), bill({ id: "b", due_date: "2026-07-01" })]),
    );
    expect(summary.totalOutstanding).toBe(4720);
    expect(summary.notYetDue).toBe(2360);
    expect(summary.overdue).toBe(2360);
  });
});

describe("by supplier", () => {
  const items = build([
    bill({ id: "a", party_id: "supplier-1", total_amount: 1000, due_date: "2026-07-01" }),
    bill({ id: "b", party_id: "supplier-2", total_amount: 5000, due_date: "2026-10-01" }),
  ]);

  it("groups by supplier, largest owed first", () => {
    expect(agingBySupplier(items).map((s) => s.partyName)).toEqual(["Beta Parts", "Acme Supplies"]);
  });

  it("agrees with the overall summary", () => {
    const total = agingBySupplier(items).reduce((s, p) => s + p.total, 0);
    expect(total).toBe(summarisePayables(items).totalOutstanding);
  });
});

describe("linking a supplier credit to its bill", () => {
  it("reads either spelling", () => {
    expect(creditedBillId({ bill_id: "b1" })).toBe("b1");
    expect(creditedBillId({ supplier_bill_id: "b2" })).toBe("b2");
  });

  it("returns nothing when no bill is named", () => {
    expect(creditedBillId(null)).toBeNull();
    expect(creditedBillId({})).toBeNull();
  });
});
