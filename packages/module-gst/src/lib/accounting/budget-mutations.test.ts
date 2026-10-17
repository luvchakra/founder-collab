import { beforeEach, describe, expect, it, vi } from "vitest";
import { diffBudget, parseAmountCell, parseBudgetEntry } from "./budget-entry";

/**
 * FIN-BUDGET-ENTRY — saving the budget grid: permission and licence first, then
 * validation, then only the changed cells upserted (or removed), audited once.
 */

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  accounts: [] as Row[],
  budget_lines: [] as Row[],
  upserts: [] as { rows: Row[]; onConflict?: string }[],
  deletes: [] as Row[],
}));

const requireModule = vi.hoisted(() => vi.fn(async () => {}));
const requirePermission = vi.hoisted(() => vi.fn(async () => {}));
const writeAuditLog = vi.hoisted(() => vi.fn(async () => "audit-1"));

function makeClient() {
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let mode: "select" | "delete" = "select";
      const api = {
        select: () => api,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), api),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), api),
        gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), api),
        lte: (c: string, v: string) => (filters.push((r) => String(r[c]) <= v), api),
        upsert: async (rows: Row[], opts?: { onConflict?: string }) => {
          db.upserts.push({ rows, onConflict: opts?.onConflict });
          return { error: null };
        },
        delete: () => ((mode = "delete"), api),
        then: (resolve: (v: { data: Row[] | null; error: null }) => unknown) => {
          const rows = ((db as unknown as Record<string, Row[]>)[table] ?? []).filter((r) => filters.every((f) => f(r)));
          if (mode === "delete") {
            db.deletes.push(...rows);
            return resolve({ data: null, error: null });
          }
          return resolve({ data: rows, error: null });
        },
      };
      return api;
    },
  };
}

vi.mock("../../db/server", () => ({ createClient: async () => makeClient() }));
vi.mock("@cofounderai/core/db/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) } }),
}));
vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission }));
vi.mock("@cofounderai/core/audit/mutations", () => ({ writeAuditLog }));
vi.mock("../activation/queries", () => ({ getActivationSettings: async () => ({ accountingMethod: "accrual", fiscalYearStartMonth: 4 }) }));

const { saveBudget, BUDGET_PERMISSION } = await import("./budget-mutations");

const BIZ = "b0000000-0000-4000-8000-000000000001";
const RENT = "a0000000-0000-4000-8000-000000000001";
const SALES = "a0000000-0000-4000-8000-000000000002";
const BANK = "a0000000-0000-4000-8000-000000000003";
const OTHER_BIZ_ACCOUNT = "a0000000-0000-4000-8000-000000000009";

beforeEach(() => {
  vi.clearAllMocks();
  db.accounts = [
    { id: RENT, business_id: BIZ, type: "expense" },
    { id: SALES, business_id: BIZ, type: "income" },
    { id: BANK, business_id: BIZ, type: "asset" },
    { id: OTHER_BIZ_ACCOUNT, business_id: "someone-else", type: "expense" },
  ];
  db.budget_lines = [];
  db.upserts = [];
  db.deletes = [];
});

describe("saveBudget", () => {
  it("checks the Finance licence and gst.accounts.write before anything else", async () => {
    requirePermission.mockRejectedValueOnce(new Error("You don't have permission to do this (gst.accounts.write)."));
    await expect(saveBudget(BIZ, { fiscalYear: 2026, lines: [] })).rejects.toThrow(/permission/);
    expect(requireModule).toHaveBeenCalledWith(BIZ, "gst");
    expect(requirePermission).toHaveBeenCalledWith(BIZ, "gst.accounts.write");
    expect(BUDGET_PERMISSION).toBe("gst.accounts.write");
    expect(db.upserts).toHaveLength(0);
  });

  it("refuses when the module is not licensed for writing", async () => {
    requireModule.mockRejectedValueOnce(new Error("Finance isn't licensed"));
    await expect(saveBudget(BIZ, { fiscalYear: 2026, lines: [] })).rejects.toThrow(/licensed/);
    expect(requirePermission).not.toHaveBeenCalled();
  });

  it("refuses malformed input without writing", async () => {
    const bad = await saveBudget(BIZ, { fiscalYear: 2026, lines: [{ accountId: "not-a-uuid", periodStart: "2026-04-01", amount: 1 }] });
    expect(bad.ok).toBe(false);
    const nan = await saveBudget(BIZ, { fiscalYear: 2026, lines: [{ accountId: RENT, periodStart: "2026-04-01", amount: Number.NaN }] });
    expect(nan.ok).toBe(false);
    const outside = await saveBudget(BIZ, { fiscalYear: 2026, lines: [{ accountId: RENT, periodStart: "2027-04-01", amount: 1 }] });
    expect(outside).toEqual({ ok: false, error: "A figure falls outside the fiscal year being saved." });
    expect(db.upserts).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("refuses another business's account and a balance-sheet account", async () => {
    const foreign = await saveBudget(BIZ, { fiscalYear: 2026, lines: [{ accountId: OTHER_BIZ_ACCOUNT, periodStart: "2026-04-01", amount: 5 }] });
    expect(foreign).toEqual({ ok: false, error: "One of the accounts isn't in this business's chart of accounts." });
    const bank = await saveBudget(BIZ, { fiscalYear: 2026, lines: [{ accountId: BANK, periodStart: "2026-04-01", amount: 5 }] });
    expect(bank.ok).toBe(false);
    expect(db.upserts).toHaveLength(0);
  });

  it("upserts new and changed figures on the table's own key, removes cleared ones, and audits once", async () => {
    db.budget_lines = [
      { business_id: BIZ, account_id: RENT, period_start: "2026-04-01", amount: "1000.00" },
      { business_id: BIZ, account_id: RENT, period_start: "2026-05-01", amount: "1000.00" },
      { business_id: BIZ, account_id: SALES, period_start: "2026-04-01", amount: "5000.00" },
    ];
    const result = await saveBudget(BIZ, {
      fiscalYear: 2026,
      lines: [
        { accountId: RENT, periodStart: "2026-04-01", amount: 1000 }, // unchanged
        { accountId: RENT, periodStart: "2026-05-01", amount: 1200.456 }, // changed (rounded)
        { accountId: RENT, periodStart: "2026-06-01", amount: 900 }, // new
        { accountId: SALES, periodStart: "2026-04-01", amount: null }, // cleared
        { accountId: SALES, periodStart: "2026-05-01", amount: null }, // blank, nothing stored
      ],
    });

    expect(result).toEqual({ ok: true, changed: 3 });
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]!.onConflict).toBe("business_id,account_id,period_start");
    expect(db.upserts[0]!.rows).toEqual([
      { business_id: BIZ, account_id: RENT, period_start: "2026-05-01", amount: 1200.46 },
      { business_id: BIZ, account_id: RENT, period_start: "2026-06-01", amount: 900 },
    ]);
    expect(db.deletes).toEqual([{ business_id: BIZ, account_id: SALES, period_start: "2026-04-01", amount: "5000.00" }]);
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: BIZ,
        actorId: "user-1",
        action: "gst_budget.saved",
        after: { fiscalYear: 2026, figuresSet: 2, figuresCleared: 1 },
      }),
    );
  });

  it("writes and audits nothing when nothing changed", async () => {
    db.budget_lines = [{ business_id: BIZ, account_id: RENT, period_start: "2026-04-01", amount: 1000 }];
    const result = await saveBudget(BIZ, { fiscalYear: 2026, lines: [{ accountId: RENT, periodStart: "2026-04-01", amount: 1000 }] });
    expect(result).toEqual({ ok: true, changed: 0 });
    expect(db.upserts).toHaveLength(0);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("budget entry helpers", () => {
  it("reads typed cells: blank is no budget, commas are separators, junk is invalid", () => {
    expect(parseAmountCell("")).toBeNull();
    expect(parseAmountCell("  ")).toBeNull();
    expect(parseAmountCell("1,20,000")).toBe(120000);
    expect(parseAmountCell("-250.5")).toBe(-250.5);
    expect(parseAmountCell("12abc")).toBe("invalid");
  });

  it("refuses the same cell twice and months outside a January-start year", () => {
    expect(
      parseBudgetEntry(
        {
          fiscalYear: 2026,
          lines: [
            { accountId: RENT, periodStart: "2026-04-01", amount: 1 },
            { accountId: RENT, periodStart: "2026-04-01", amount: 2 },
          ],
        },
        4,
      ),
    ).toEqual({ ok: false, error: "The same month was entered twice for one account." });
    expect(parseBudgetEntry({ fiscalYear: 2026, lines: [{ accountId: RENT, periodStart: "2027-01-01", amount: 1 }] }, 1).ok).toBe(false);
    expect(parseBudgetEntry({ fiscalYear: 2026, lines: [{ accountId: RENT, periodStart: "2026-12-01", amount: 1 }] }, 1).ok).toBe(true);
  });

  it("diffs only real changes", () => {
    expect(diffBudget([{ accountId: RENT, periodStart: "2026-04-01", amount: 10 }], [{ accountId: RENT, periodStart: "2026-04-01", amount: 10.001 }])).toEqual({
      upserts: [],
      deletes: [],
    });
  });
});
