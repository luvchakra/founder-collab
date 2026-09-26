import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeSupabase,
  eqFilters,
  opArgs,
  type FakeSupabase,
  type QueryResult,
  type RecordedQuery,
} from "@cofounderai/core/test-support/fake-supabase";

// EXP-FIN-03/04/05/06/08/17 -- the export-only twins of the capped page loaders: same
// predicates, the context's business on every read, paged past the 1,000-row cap.

type Responder = (call: RecordedQuery) => QueryResult;
const db = vi.hoisted(() => ({ responders: {} as Record<string, Responder>, fakes: {} as Record<string, FakeSupabase> }));

vi.mock("@cofounderai/core/db/server", () => ({
  createClient: async ({ schema }: { schema: string }) => db.fakes[schema],
}));

import { getLedgerCurrency } from "./shared";
import {
  getPayablesForExport,
  listAuditLogForExport,
  listBankTransactionsForExport,
  listBillsForExport,
  listJournalForExport,
} from "./queries";
import { TENANT } from "./test-support";

function respond(schema: "core" | "gst", table: string, answer: (call: RecordedQuery) => unknown[] | Record<string, unknown> | null) {
  db.responders[`${schema}.${table}`] = (call) => ({ data: answer(call), error: null });
}

/** What `.range(from, to)` asked for. */
function range(call: RecordedQuery): [number, number] {
  return opArgs(call, "range") as [number, number];
}

beforeEach(() => {
  db.responders = {};
  for (const schema of ["core", "gst"]) {
    db.fakes[schema] = createFakeSupabase({
      query: (call) => db.responders[`${schema}.${call.table}`]?.(call) ?? { data: [], error: null },
    });
  }
});

describe("listBillsForExport (EXP-FIN-03)", () => {
  it("pages every supplier bill of the business past 1,000 rows, keeping the page's kind rule", async () => {
    const doc = (i: number, kind?: string) => ({
      id: `doc-${i}`,
      number: `BILL-${i}`,
      party_id: "party-1",
      doc_date: "2026-09-01",
      due_date: null,
      subtotal: 100,
      cgst_amount: 9,
      sgst_amount: 9,
      igst_amount: 0,
      total_amount: 118,
      source_ref: kind ? { kind } : null,
    });
    respond("core", "documents", (call) => {
      const [from] = range(call);
      if (from === 0) return Array.from({ length: 1000 }, (_, i) => doc(i, i === 1 ? "expense" : undefined));
      return [doc(1000), doc(1001)];
    });
    respond("core", "payment_allocations", (call) =>
      (opArgs(call, "in")![1] as string[]).includes("doc-0") && range(call)[0] === 0
        ? [{ id: "a1", document_id: "doc-0", amount: 18 }, { id: "a2", document_id: "doc-0", amount: 100 }]
        : [],
    );
    respond("core", "parties", () => [{ id: "party-1", name: "Sharma Supplies" }]);
    respond("gst", "journal_entries", (call) =>
      (opArgs(call, "in")![1] as string[]).includes("doc-0") ? [{ id: "e-1", source_document_id: "doc-0", status: "posted" }] : [],
    );

    const rows = await listBillsForExport(TENANT, "bill");

    const docCalls = db.fakes.core!.queries("documents");
    expect(docCalls.map(range)).toEqual([[0, 999], [1000, 1999]]);
    for (const call of docCalls) expect(eqFilters(call)).toEqual({ business_id: TENANT, doc_type: "supplier_bill" });
    expect(docCalls[0]!.ops.filter((op) => op.method === "order").at(-1)!.args[0]).toBe("id");
    // The one recorded expense is not a bill; everything else (no recorded kind) is.
    expect(rows).toHaveLength(1001);
    expect(rows.find((r) => r.id === "doc-1")).toBeUndefined();
    expect(rows[0]).toMatchObject({
      partyName: "Sharma Supplies",
      taxableValue: 100,
      cgst: 9,
      paid: 118,
      outstanding: 0,
      status: "paid",
      postingState: "posted",
    });
    expect(rows[2]).toMatchObject({ status: "unpaid", postingState: "not_posted" });
    // Every follow-up read is scoped to the business and chunked for the URL.
    for (const call of [...db.fakes.core!.queries("payment_allocations"), ...db.fakes.core!.queries("parties"), ...db.fakes.gst!.queries("journal_entries")]) {
      expect(eqFilters(call).business_id).toBe(TENANT);
      expect((opArgs(call, "in")![1] as string[]).length).toBeLessThanOrEqual(150);
    }
  });
});

describe("getPayablesForExport (EXP-FIN-04)", () => {
  it("nets supplier credits and payments with the page's own pure builders", async () => {
    respond("core", "documents", () => [
      { id: "b-1", doc_type: "supplier_bill", number: "BILL-1", status: "posted", party_id: "p-1", doc_date: "2026-07-01", due_date: "2026-07-31", total_amount: 1000, source_ref: null },
      { id: "c-1", doc_type: "supplier_credit", number: "DN-1", status: "posted", party_id: "p-1", doc_date: "2026-07-05", due_date: null, total_amount: 100, source_ref: { bill_id: "b-1" } },
    ]);
    respond("core", "payment_allocations", () => [{ id: "a-1", document_id: "b-1", amount: 400 }]);
    respond("core", "parties", () => [{ id: "p-1", name: "Sharma Supplies" }]);

    const ledger = await getPayablesForExport(TENANT);
    expect(eqFilters(db.fakes.core!.queries("documents")[0]!)).toEqual({ business_id: TENANT });
    expect(opArgs(db.fakes.core!.queries("documents")[0]!, "in")).toEqual(["doc_type", ["supplier_bill", "supplier_credit"]]);
    expect(ledger.items).toEqual([expect.objectContaining({ number: "BILL-1", credited: 100, paid: 400, outstanding: 500 })]);
    expect(ledger.bySupplier[0]).toMatchObject({ partyName: "Sharma Supplies", total: 500 });
  });
});

describe("listJournalForExport (EXP-FIN-06)", () => {
  it("reads every entry and line of the business, with each entry's source document number", async () => {
    respond("gst", "journal_entries", () => [
      { id: "e-1", entry_number: "JE-1", posting_date: "2026-09-01", source_document_id: "doc-1", status: "posted" },
      { id: "e-2", entry_number: "JE-2", posting_date: "2026-09-02", source_document_id: null, status: "draft" },
    ]);
    respond("gst", "journal_lines", () => [
      { id: "l-1", entry_id: "e-1", line_number: 1, account_id: "a-1", debit: "118.00", credit: 0, memo: null, tax_code: null, accounts: { account_number: "1100", name: "Receivable" } },
      { id: "l-2", entry_id: "e-1", line_number: 2, account_id: "a-9", debit: 0, credit: "118", memo: null, tax_code: null, accounts: null },
    ]);
    respond("core", "documents", () => [{ id: "doc-1", number: "INV-1" }]);

    const { entries, lines } = await listJournalForExport(TENANT);
    expect(eqFilters(db.fakes.gst!.queries("journal_entries")[0]!)).toEqual({ business_id: TENANT });
    expect(eqFilters(db.fakes.gst!.queries("journal_lines")[0]!)).toEqual({ business_id: TENANT });
    expect(opArgs(db.fakes.core!.queries("documents")[0]!, "in")).toEqual(["id", ["doc-1"]]);
    expect(entries.map((e) => e.sourceDocumentNumber)).toEqual(["INV-1", null]);
    expect(lines[0]).toMatchObject({ account_number: "1100", account_name: "Receivable", debit: 118 });
    expect(lines[1]).toMatchObject({ account_number: "", account_name: "Unknown account", credit: 118 });
  });
});

describe("listBankTransactionsForExport (EXP-FIN-08)", () => {
  it("reads every line of one account of the business, naming the matched entry", async () => {
    respond("gst", "bank_transactions", () => [
      { id: "t-1", bank_account_id: "bank-1", txn_date: "2026-09-01", description: "x", reference: null, amount: "-50", balance_after: null, status: "matched", matched_entry_id: "e-5" },
    ]);
    respond("gst", "journal_entries", () => [{ id: "e-5", entry_number: "JE-5" }]);

    const rows = await listBankTransactionsForExport(TENANT, "bank-1");
    expect(eqFilters(db.fakes.gst!.queries("bank_transactions")[0]!)).toEqual({ business_id: TENANT, bank_account_id: "bank-1" });
    expect(eqFilters(db.fakes.gst!.queries("journal_entries")[0]!)).toEqual({ business_id: TENANT });
    expect(rows[0]).toMatchObject({ amount: -50, balance_after: null, matchedEntryNumber: "JE-5" });
  });
});

describe("listAuditLogForExport (EXP-FIN-17)", () => {
  it("applies the page's filters the way core's listAuditLogForBusiness does, without its 200 cap", async () => {
    await listAuditLogForExport(TENANT, { entityType: "document", actorId: "user-1", dateFrom: "2026-09-01", dateTo: "2026-09-30" });
    const [call] = db.fakes.core!.queries("audit_log");
    expect(eqFilters(call!)).toEqual({ business_id: TENANT, entity_type: "document", actor_id: "user-1" });
    expect(opArgs(call!, "gte")).toEqual(["created_at", "2026-09-01T00:00:00"]);
    expect(opArgs(call!, "lte")).toEqual(["created_at", "2026-09-30T23:59:59.999"]);
    expect(opArgs(call!, "limit")).toBeUndefined();
    expect(range(call!)).toEqual([0, 999]);

    await listAuditLogForExport(TENANT, { entityType: "", actorId: "", dateFrom: "", dateTo: "" });
    const last = db.fakes.core!.queries("audit_log").at(-1)!;
    expect(eqFilters(last)).toEqual({ business_id: TENANT });
    expect(opArgs(last, "gte")).toBeUndefined();
  });
});

describe("getLedgerCurrency", () => {
  it("reads the business's own currency, INR when unset", async () => {
    respond("core", "business_settings", () => ({ currency: "usd" }));
    expect(await getLedgerCurrency(TENANT)).toBe("USD");
    expect(eqFilters(db.fakes.core!.queries("business_settings")[0]!)).toEqual({ business_id: TENANT });
    respond("core", "business_settings", () => null);
    expect(await getLedgerCurrency(TENANT)).toBe("INR");
  });
});
