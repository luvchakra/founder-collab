import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-FIN-02 -- Chart of Accounts export.

const q = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  listAccountRoles: vi.fn(),
  getLedgerCurrency: vi.fn(),
}));
vi.mock("../lib/accounting/queries", () => ({ listAccounts: q.listAccounts, listAccountRoles: q.listAccountRoles }));
vi.mock("./shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./shared")>()),
  getLedgerCurrency: q.getLedgerCurrency,
}));

import { financeAccountsExport } from "./accounts";
import { TENANT, everyValue, headers, renderText, rowValues, runAdapter } from "./test-support";

const ACCOUNTS = [
  {
    id: "a-assets", account_number: "1000", name: "Assets", type: "asset", subtype: null, parent_account_id: null,
    is_active: true, is_system: false, opening_balance: 0, balance: 0, depth: 0,
  },
  {
    id: "a-ar", account_number: "1100", name: "Customer dues", type: "asset", subtype: "current_asset", parent_account_id: "a-assets",
    is_active: true, is_system: true, opening_balance: 1500.5, balance: -250.25, depth: 1,
  },
];

beforeEach(() => {
  q.listAccounts.mockReset().mockResolvedValue(ACCOUNTS);
  q.listAccountRoles.mockReset().mockResolvedValue(new Map([["a-ar", ["accounts_receivable"]]]));
  q.getLedgerCurrency.mockReset().mockResolvedValue("INR");
});

describe("EXP-FIN-02 finance.accounts", () => {
  it("is the Finance licence's chart-of-accounts export, with the page's (empty) read permission", () => {
    expect(financeAccountsExport.id).toBe("finance.accounts");
    expect(financeAccountsExport.module).toBe("gst");
    expect(financeAccountsExport.permissions).toEqual([]);
  });

  it("reads the business from the context, never from request params", async () => {
    const { filters } = await runAdapter(financeAccountsExport, { status: "x" });
    expect(filters).toEqual({});
    expect(q.listAccounts).toHaveBeenCalledWith(TENANT);
    expect(q.listAccountRoles).toHaveBeenCalledWith(TENANT);
    expect(q.getLedgerCurrency).toHaveBeenCalledWith(TENANT);
  });

  it("writes code, name, type label, role, parent, active and balances as numbers", async () => {
    const { workbook } = await runAdapter(financeAccountsExport);
    expect(workbook.module).toBe("finance");
    expect(workbook.resource).toBe("chart-of-accounts");
    expect(headers(workbook, "Chart of accounts")).toEqual([
      "Account code", "Account name", "Type", "Subtype", "Used for", "Parent code", "Parent account",
      "Level", "Active", "System account", "Opening balance", "Balance",
    ]);
    expect(rowValues(workbook, "Chart of accounts", 1)).toMatchObject({
      "Account code": "1100",
      Type: "Asset",
      Subtype: "Current asset",
      "Used for": ["Money owed to you"],
      "Parent code": "1000",
      "Parent account": "Assets",
      Active: true,
      "Opening balance": 1500.5,
      Balance: -250.25,
    });
    // A top-level account has no parent: blank, not zero or "undefined".
    expect(rowValues(workbook, "Chart of accounts", 0)["Parent code"]).toBeNull();

    const csv = await renderText(workbook);
    expect(csv).toContain("1100,Customer dues,Asset,Current asset,Money owed to you,1000,Assets,1,Yes,Yes,1500.5,-250.25");
    expect(csv).not.toContain("₹");
    expect(everyValue(workbook)).not.toContain("a-ar");
  });

  it("an empty chart still gives a valid file with headers", async () => {
    q.listAccounts.mockResolvedValue([]);
    const { workbook } = await runAdapter(financeAccountsExport);
    const csv = await renderText(workbook);
    expect(csv.trim().split("\n")).toHaveLength(1);
  });
});
