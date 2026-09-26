import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FIN-11 — end-to-end edge cases, in TypeScript: historical backfill, duplicate backfill,
 * and licence grace, run through the REAL posting path — `runFinanceBackfill` →
 * `postIssuedDocument` → `financeEventFromDocument` → `planPosting` → `postFinanceEvent` —
 * against an in-memory stand-in for the database that enforces the two rules the database
 * itself enforces here: one entry per (business, idempotency key), and no posting into a
 * locked period. Only the I/O is faked; every decision is the production code's.
 * (`scripts/test-finance-e2e-edge-cases.mjs` checks the same rules in real Postgres.)
 */

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  licensed: true,
  seq: 0,
}));

function makeClient() {
  const run = (table: string, filters: ((r: Row) => boolean)[]) => (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const query = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let inserted: Row[] | null = null;
    let error: unknown = null;
    const api = {
      select: () => api,
      eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), api),
      in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), api),
      lte: (col: string, v: string) => (filters.push((r) => String(r[col]) <= v), api),
      gte: (col: string, v: string) => (filters.push((r) => String(r[col]) >= v), api),
      order: () => api,
      limit: () => api,
      insert: (rows: Row | Row[]) => {
        const list: Row[] = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ id: `${table}-${++db.seq}`, ...r }));
        if (table === "journal_entries") {
          for (const r of list) {
            const clash = (db.tables.journal_entries ?? []).some(
              (e) => r.idempotency_key && e.business_id === r.business_id && e.idempotency_key === r.idempotency_key,
            );
            if (clash) error = { code: "23505", message: "duplicate key value violates unique constraint journal_entries_idempotency_key_idx" };
          }
        }
        if (!error) {
          db.tables[table] = [...(db.tables[table] ?? []), ...list];
          inserted = list;
        }
        return api;
      },
      maybeSingle: async () => {
        if (error) return { data: null, error };
        const rows = inserted ?? run(table, filters);
        return { data: rows[0] ?? null, error: null };
      },
      single: async () => {
        if (error) return { data: null, error };
        const rows = inserted ?? run(table, filters);
        return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "not found" } };
      },
      then: (resolve: (v: { data: Row[] | null; error: unknown }) => unknown) =>
        resolve(error ? { data: null, error } : { data: inserted ?? run(table, filters), error: null }),
    };
    return api;
  };
  return {
    from: query,
    rpc: async (fn: string) => {
      if (fn === "has_module_write") return { data: db.licensed, error: null };
      if (fn === "next_number_for_api") return { data: `JE-${++db.seq}`, error: null };
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    },
  };
}

vi.mock("@cofounderai/core/db/admin", () => ({ createAdminClient: () => makeClient() }));
vi.mock("../../db/admin", () => ({ createAdminClient: () => makeClient() }));
vi.mock("../../db/server", () => ({ createClient: async () => makeClient() }));
// The same rule `requireModule` applies in production: a write needs an ACTIVE licence.
vi.mock("@cofounderai/core/licensing/queries", () => ({
  requireModule: vi.fn(async () => {
    if (!db.licensed) throw new Error("Finance isn't licensed (or is in its read-only grace period) for this business.");
  }),
}));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission: vi.fn(async () => undefined) }));
vi.mock("../exceptions-queue/queries", () => ({
  getFinanceExceptionByKey: async (businessId: string, type: string, key: string) =>
    (db.tables.finance_exceptions ?? []).find((e) => e.business_id === businessId && e.exception_type === type && e.reference_key === key) ?? null,
}));
// The scan is the one read not reproduced here: it is "documents with no entry yet",
// derived from the same in-memory tables the posting path writes to.
vi.mock("./queries", () => ({
  scanFinanceBackfill: async (businessId: string) => {
    const posted = new Set((db.tables.journal_entries ?? []).map((e) => e.source_document_id));
    return {
      documents: (db.tables.documents ?? [])
        .filter((d) => d.business_id === businessId && !posted.has(d.id))
        .map((d) => ({ kind: "document" as const, id: d.id as string, documentId: d.id as string, label: `Invoice ${d.number}` })),
      paymentAllocations: [],
    };
  },
}));

import { runFinanceBackfill } from "./mutations";
import { postIssuedDocument } from "../accounting/event-posting";

const BUSINESS = "biz-1";
const ROLES = ["accounts_receivable", "accounts_payable", "bank", "cash", "inventory_asset", "gst_payable", "input_gst", "product_revenue", "service_revenue", "product_cogs"];

function invoice(n: number, date: string) {
  return {
    id: `inv-${n}`,
    business_id: BUSINESS,
    doc_type: "invoice",
    number: `INV-${n}`,
    source_module: "inventory",
    source_ref: {},
    party_id: "cust-1",
    doc_date: date,
    status: "issued",
    subtotal: 1000,
    discount_amount: 0,
    shipping_amount: 0,
    cgst_amount: 90,
    sgst_amount: 90,
    igst_amount: 0,
    total_amount: 1180,
  };
}

beforeEach(() => {
  db.licensed = true;
  db.seq = 0;
  db.tables = {
    account_mappings: ROLES.map((role) => ({ business_id: BUSINESS, role_key: role, account_id: `acct-${role}` })),
    accounting_periods: [
      { id: "p-apr", business_id: BUSINESS, start_date: "2026-04-01", end_date: "2026-04-30", status: "locked" },
      { id: "p-may", business_id: BUSINESS, start_date: "2026-05-01", end_date: "2026-05-31", status: "open" },
    ],
    // History from before Finance was licensed: two invoices in a locked April, three in May.
    documents: [invoice(1, "2026-04-10"), invoice(2, "2026-04-20"), invoice(3, "2026-05-02"), invoice(4, "2026-05-15"), invoice(5, "2026-05-30")],
    journal_entries: [],
    journal_lines: [],
    finance_exceptions: [],
  };
});

describe("FIN-11: historical backfill", () => {
  it("posts every document it can and routes the locked-period ones to exceptions — without aborting the run", async () => {
    const result = await runFinanceBackfill(BUSINESS);
    expect(result).toMatchObject({ scannedDocuments: 5, posted: 3, alreadyPosted: 0, exceptions: 2 });
    expect(db.tables.journal_entries).toHaveLength(3);
    // Each posted entry balances: 1180 receivable against 1000 revenue + 180 GST.
    for (const entry of db.tables.journal_entries!) {
      const lines = db.tables.journal_lines!.filter((l) => l.entry_id === entry.id);
      const debit = lines.reduce((s, l) => s + Number(l.debit), 0);
      const credit = lines.reduce((s, l) => s + Number(l.credit), 0);
      expect(debit).toBe(credit);
      expect(debit).toBe(1180);
    }
    expect(db.tables.finance_exceptions!.map((e) => e.reference_key).sort()).toEqual(["inv-1", "inv-2"]);
    expect(String(db.tables.finance_exceptions![0]!.summary)).toMatch(/locked/);
  });
});

describe("FIN-11: duplicate backfill", () => {
  it("running the backfill twice posts nothing new and raises no second exception", async () => {
    await runFinanceBackfill(BUSINESS);
    const second = await runFinanceBackfill(BUSINESS);
    expect(second).toMatchObject({ scannedDocuments: 2, posted: 0, exceptions: 2 });
    expect(db.tables.journal_entries).toHaveLength(3);
    expect(db.tables.finance_exceptions).toHaveLength(2);
  });

  it("a backfill overlapping the live drain converges on the entry the drain already posted", async () => {
    // The drain got to invoice 3 first...
    expect(await postIssuedDocument(BUSINESS, "inv-3", "event-1")).toMatchObject({ posted: true, duplicate: false });
    // ...and a redelivery of the same event is caught, not double-posted.
    expect(await postIssuedDocument(BUSINESS, "inv-3", "event-1")).toMatchObject({ posted: true, duplicate: true });
    const result = await runFinanceBackfill(BUSINESS);
    expect(result.posted).toBe(2);
    expect(db.tables.journal_entries!.filter((e) => e.source_document_id === "inv-3")).toHaveLength(1);
  });

  it("even a scan that races the drain cannot double-post: the idempotency key refuses it", async () => {
    await postIssuedDocument(BUSINESS, "inv-4");
    // Simulate a stale scan that still lists inv-4 by posting it again directly.
    expect(await postIssuedDocument(BUSINESS, "inv-4")).toMatchObject({ posted: true, duplicate: true });
    expect(db.tables.journal_entries!.filter((e) => e.source_document_id === "inv-4")).toHaveLength(1);
  });
});

describe("FIN-11: licence cancellation (ADR-9 grace)", () => {
  it("posts nothing while Finance is in its read-only grace period, and everything once reactivated", async () => {
    db.licensed = false; // cancelled: `has_module_write` is false during grace
    // The backfill is refused up front...
    await expect(runFinanceBackfill(BUSINESS)).rejects.toThrow(/grace period/);
    // ...and the drain's path (an event replayed or redelivered during grace) refuses as a
    // value, so the event is not retried into a posting ADR-9 forbids.
    expect(await postIssuedDocument(BUSINESS, "inv-3")).toMatchObject({ posted: false, reason: expect.stringMatching(/grace period/) });
    expect(db.tables.journal_entries).toHaveLength(0);

    db.licensed = true; // reactivated
    const after = await runFinanceBackfill(BUSINESS);
    expect(after.posted).toBe(3);
    expect(db.tables.journal_entries).toHaveLength(3);
  });
});
