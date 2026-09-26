import { describe, expect, it } from "vitest";
import { explainDocumentPostings, postingKindOf, unpostedReason } from "./document-postings";
import type { JournalEntryDetail, JournalLineRow } from "./journal-queries";
import type { PostableDocument } from "./document-events";

// FIN-12 — explainable accounting, in reverse.

function line(n: number, accountId: string, number: string, debit: number, credit: number): JournalLineRow {
  return {
    id: `${accountId}-${n}-${debit}-${credit}`,
    line_number: n,
    account_id: accountId,
    account_number: number,
    account_name: number,
    account_type: "asset",
    debit,
    credit,
    memo: null,
    tax_code: null,
  };
}

function entry(id: string, overrides: Partial<JournalEntryDetail>, lines: JournalLineRow[]): JournalEntryDetail {
  return {
    id,
    entry_number: id.toUpperCase(),
    posting_date: "2026-09-01",
    memo: null,
    status: "posted",
    source_module: "inventory",
    source_entity_type: "invoice",
    source_document_id: "doc-1",
    posting_rule_key: "invoice.finalized",
    posting_rule_version: 1,
    reversal_of_entry_id: null,
    document_date: "2026-09-01",
    posted_at: null,
    amount: 0,
    balanced: true,
    lines,
    ...overrides,
  };
}

const invoice = entry("je-1", {}, [
  line(1, "ar", "1300", 1180, 0),
  line(2, "rev", "4100", 0, 1000),
  line(3, "gst", "2200", 0, 180),
]);
const cogs = entry("je-2", { posting_rule_key: "sale.cogs" }, [line(1, "cogs", "5100", 600, 0), line(2, "inv", "1400", 0, 600)]);
const payment = entry(
  "je-3",
  { source_entity_type: "payment_allocation", posting_rule_key: "payment.received", posting_date: "2026-09-10" },
  [line(1, "bank", "1100", 1180, 0), line(2, "ar", "1300", 0, 1180)],
);

describe("postingKindOf", () => {
  it("tells a document's own posting, its cost of sale, a payment and a reversal apart", () => {
    expect(postingKindOf(invoice)).toBe("document");
    expect(postingKindOf(cogs)).toBe("cost_of_sale");
    expect(postingKindOf(payment)).toBe("payment");
    expect(postingKindOf({ ...invoice, reversal_of_entry_id: "je-1" })).toBe("reversal");
  });
});

describe("explainDocumentPostings", () => {
  it("reports a document with no entries as not posted", () => {
    const summary = explainDocumentPostings([]);
    expect(summary.status).toBe("not_posted");
    expect(summary.netEffect).toEqual([]);
  });

  it("nets every entry per account: a paid invoice leaves nothing in receivables", () => {
    const summary = explainDocumentPostings([invoice, cogs, payment]);
    expect(summary.status).toBe("posted");
    expect(summary.entries.map((e) => e.kind)).toEqual(["document", "cost_of_sale", "payment"]);
    const byNumber = Object.fromEntries(summary.netEffect.map((r) => [r.accountNumber, r]));
    expect(byNumber["1300"]).toBeUndefined(); // receivable raised then cleared
    expect(byNumber["1100"]).toMatchObject({ debit: 1180, credit: 0 });
    expect(byNumber["4100"]).toMatchObject({ debit: 0, credit: 1000 });
    expect(byNumber["5100"]).toMatchObject({ debit: 600, credit: 0 });
    // Net effect is itself balanced.
    const debits = summary.netEffect.reduce((s, r) => s + r.debit, 0);
    const credits = summary.netEffect.reduce((s, r) => s + r.credit, 0);
    expect(debits).toBe(credits);
  });

  it("reports a fully reversed document as reversed, netting to nothing", () => {
    const reversed = { ...invoice, status: "reversed" as const };
    const reversal = entry("je-9", { reversal_of_entry_id: "je-1", source_document_id: null }, [
      line(1, "ar", "1300", 0, 1180),
      line(2, "rev", "4100", 1000, 0),
      line(3, "gst", "2200", 180, 0),
    ]);
    const summary = explainDocumentPostings([reversed, reversal]);
    expect(summary.status).toBe("reversed");
    expect(summary.netEffect).toEqual([]);
    expect(summary.entries[1]!.why).toMatch(/Reverses an earlier entry/);
  });

  it("explains each automatic entry with its rule and version", () => {
    const summary = explainDocumentPostings([invoice]);
    expect(summary.entries[0]!.why).toBe("Posted automatically from an invoice in Inventory. Rule invoice.finalized v1.");
  });

  it("ignores drafts in the net effect", () => {
    const draft = entry("je-5", { status: "draft" }, [line(1, "x", "6100", 50, 0), line(2, "y", "1100", 0, 50)]);
    expect(explainDocumentPostings([draft]).netEffect).toEqual([]);
  });
});

describe("unpostedReason", () => {
  const base: PostableDocument = {
    id: "d",
    doc_type: "invoice",
    source_module: "inventory",
    party_id: "p",
    doc_date: "2026-09-01",
    status: "issued",
    subtotal: 100,
    discount_amount: 0,
    shipping_amount: 0,
    cgst_amount: 9,
    sgst_amount: 9,
    igst_amount: 0,
    total_amount: 118,
  };

  it("says a draft posts once issued", () => {
    expect(unpostedReason({ ...base, status: "draft" })).toMatch(/still a draft/);
  });

  it("says a commitment never posts", () => {
    expect(unpostedReason({ ...base, doc_type: "purchase_order" })).toMatch(/commitment/);
  });

  it("points a postable but unposted document at backfill and the exceptions queue", () => {
    expect(unpostedReason(base)).toMatch(/backfill/);
  });
});
