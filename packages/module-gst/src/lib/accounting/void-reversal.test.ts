import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEC-7 — Finance's half of voiding a payment: `reverseVoidedPaymentSettlements` reverses
 * the settlement entries posted for the released allocations, and nothing else. Run
 * against an in-memory stand-in that enforces the one rule the database enforces here
 * (one entry per business + idempotency key); every decision is the production code's.
 */

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  licensed: true,
  seq: 0,
  periodStatus: "open",
}));

function makeClient() {
  const query = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let inserted: Row[] | null = null;
    let patch: Row | null = null;
    let error: unknown = null;
    const rows = () => (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const api = {
      select: () => api,
      eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), api),
      in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), api),
      is: (col: string, v: unknown) => (filters.push((r) => (r[col] ?? null) === v), api),
      lte: () => api,
      gte: () => api,
      order: () => api,
      insert: (input: Row | Row[]) => {
        const list: Row[] = (Array.isArray(input) ? input : [input]).map((r) => ({ id: `${table}-${++db.seq}`, ...r }));
        if (table === "journal_entries") {
          for (const r of list) {
            if (
              r.idempotency_key &&
              (db.tables.journal_entries ?? []).some((e) => e.business_id === r.business_id && e.idempotency_key === r.idempotency_key)
            ) {
              error = { code: "23505", message: "duplicate key" };
            }
          }
        }
        if (!error) {
          db.tables[table] = [...(db.tables[table] ?? []), ...list];
          inserted = list;
        }
        return api;
      },
      update: (values: Row) => ((patch = values), api),
      maybeSingle: async () => {
        if (table === "accounting_periods") return { data: { id: "period-1", status: db.periodStatus }, error: null };
        return error ? { data: null, error } : { data: (inserted ?? rows())[0] ?? null, error: null };
      },
      single: async () => {
        if (error) return { data: null, error };
        const found = (inserted ?? rows())[0];
        return found ? { data: found, error: null } : { data: null, error: { message: "not found" } };
      },
      then: (resolve: (v: { data: Row[] | null; error: unknown }) => unknown) => {
        if (patch) for (const r of rows()) Object.assign(r, patch);
        return resolve(error ? { data: null, error } : { data: inserted ?? rows(), error: null });
      },
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
vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: vi.fn() }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission: vi.fn() }));
vi.mock("@cofounderai/core/numbering/mutations", () => ({ nextNumber: vi.fn() }));

const { reverseVoidedPaymentSettlements } = await import("./journal-mutations");

const BUSINESS = "b-1";
const OTHER = "b-2";

function settlement(id: string, allocationId: string, business = BUSINESS, extra: Row = {}) {
  db.tables.journal_entries!.push({
    id,
    business_id: business,
    entry_number: `JE-${id}`,
    status: "posted",
    memo: "Receipt",
    source_module: "core",
    source_entity_type: "payment_allocation",
    source_entity_id: allocationId,
    reversal_of_entry_id: null,
    ...extra,
  });
  db.tables.journal_lines!.push(
    { business_id: business, entry_id: id, line_number: 1, account_id: "bank", debit: 600, credit: 0 },
    { business_id: business, entry_id: id, line_number: 2, account_id: "receivables", debit: 0, credit: 600 },
  );
}

const entry = (id: string) => db.tables.journal_entries!.find((e) => e.id === id)!;
const reversalsOf = (id: string) => db.tables.journal_entries!.filter((e) => e.reversal_of_entry_id === id);

beforeEach(() => {
  db.tables = { journal_entries: [], journal_lines: [] };
  db.licensed = true;
  db.periodStatus = "open";
  db.seq = 0;
});

describe("reverseVoidedPaymentSettlements", () => {
  it("reverses each released allocation's settlement, with every side swapped", async () => {
    settlement("e1", "alloc-a");
    settlement("e2", "alloc-b");

    const result = await reverseVoidedPaymentSettlements(BUSINESS, ["alloc-a", "alloc-b"]);

    expect(result.reversed).toHaveLength(2);
    expect(entry("e1").status).toBe("reversed");
    expect(entry("e2").status).toBe("reversed");
    const [reversal] = reversalsOf("e1");
    expect(reversal).toMatchObject({
      status: "posted",
      source_entity_type: "payment_allocation",
      source_entity_id: "alloc-a",
      idempotency_key: "reversal:e1",
    });
    const lines = db.tables.journal_lines!.filter((l) => l.entry_id === reversal!.id);
    expect(lines.map((l) => [l.account_id, l.debit, l.credit])).toEqual([
      ["bank", 0, 600],
      ["receivables", 600, 0],
    ]);
  });

  it("leaves everything else alone: other allocations, other businesses, other entry types", async () => {
    settlement("e1", "alloc-a");
    settlement("keep-other-alloc", "alloc-z");
    settlement("keep-other-business", "alloc-a", OTHER);
    settlement("keep-invoice", "alloc-a", BUSINESS, { source_entity_type: "invoice" });

    await reverseVoidedPaymentSettlements(BUSINESS, ["alloc-a"]);

    expect(entry("e1").status).toBe("reversed");
    for (const id of ["keep-other-alloc", "keep-other-business", "keep-invoice"]) {
      expect(entry(id).status).toBe("posted");
      expect(reversalsOf(id)).toHaveLength(0);
    }
  });

  it("is safe to redeliver: a second run reverses nothing more", async () => {
    settlement("e1", "alloc-a");
    await reverseVoidedPaymentSettlements(BUSINESS, ["alloc-a"]);
    const again = await reverseVoidedPaymentSettlements(BUSINESS, ["alloc-a"]);

    expect(again.reversed).toHaveLength(0);
    expect(reversalsOf("e1")).toHaveLength(1);
  });

  it("finishes a half-done earlier attempt instead of reversing twice", async () => {
    settlement("e1", "alloc-a");
    // An earlier attempt wrote the reversal, then died before marking the original.
    db.tables.journal_entries!.push({ id: "r1", business_id: BUSINESS, status: "posted", reversal_of_entry_id: "e1", idempotency_key: "reversal:e1" });

    const result = await reverseVoidedPaymentSettlements(BUSINESS, ["alloc-a"]);

    expect(result.reversed).toEqual(["r1"]);
    expect(entry("e1").status).toBe("reversed");
    expect(reversalsOf("e1")).toHaveLength(1);
  });

  it("does nothing when the payment had settled nothing that was posted", async () => {
    expect(await reverseVoidedPaymentSettlements(BUSINESS, ["alloc-never-posted"])).toEqual({ reversed: [], refused: [] });
    expect(await reverseVoidedPaymentSettlements(BUSINESS, [])).toEqual({ reversed: [], refused: [] });
  });

  it("writes nothing while Finance is unlicensed or read-only", async () => {
    settlement("e1", "alloc-a");
    db.licensed = false;

    const result = await reverseVoidedPaymentSettlements(BUSINESS, ["alloc-a"]);

    expect(result).toMatchObject({ reversed: [], skipped: expect.stringContaining("isn't licensed") });
    expect(entry("e1").status).toBe("posted");
  });

  it("reports a locked period as a refusal, without writing anything", async () => {
    settlement("e1", "alloc-a");
    db.periodStatus = "locked";

    const result = await reverseVoidedPaymentSettlements(BUSINESS, ["alloc-a"]);

    expect(result.refused).toEqual([{ entryId: "e1", reason: expect.stringContaining("locked") }]);
    expect(entry("e1").status).toBe("posted");
    expect(reversalsOf("e1")).toHaveLength(0);
  });
});
