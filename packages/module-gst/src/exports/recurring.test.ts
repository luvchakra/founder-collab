import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-FIN-09 -- Recurring Entries export.

const q = vi.hoisted(() => ({ listRecurringEntries: vi.fn(), listAccounts: vi.fn(), getLedgerCurrency: vi.fn() }));
vi.mock("../lib/accounting/recurring-queries", () => ({ listRecurringEntries: q.listRecurringEntries }));
vi.mock("../lib/accounting/queries", () => ({ listAccounts: q.listAccounts }));
vi.mock("./shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./shared")>()),
  getLedgerCurrency: q.getLedgerCurrency,
}));

import { financeRecurringExport } from "./recurring";
import { TENANT, csvLines, headers, rowValues, runAdapter } from "./test-support";

beforeEach(() => {
  q.listRecurringEntries.mockReset().mockResolvedValue([
    {
      id: "r-1",
      name: "Office rent",
      memo: null,
      frequency: "monthly",
      anchor_date: "2026-04-01",
      end_on: null,
      last_run_on: "2026-09-01",
      is_active: true,
      template_lines: [
        { accountId: "acc-rent", debit: 25000, credit: 0 },
        { accountId: "acc-bank", debit: 0, credit: 25000, memo: "Transfer" },
      ],
      nextRunOn: "2026-10-01",
      amount: 25000,
    },
  ]);
  q.listAccounts.mockReset().mockResolvedValue([
    { id: "acc-rent", account_number: "6100", name: "Rent" },
    { id: "acc-bank", account_number: "1010", name: "Bank" },
  ]);
  q.getLedgerCurrency.mockReset().mockResolvedValue("INR");
});

describe("EXP-FIN-09 finance.recurring", () => {
  it("is Finance-licensed with the page's (empty) read permission and reads only the context tenant", async () => {
    expect(financeRecurringExport.id).toBe("finance.recurring");
    expect(financeRecurringExport.module).toBe("gst");
    expect(financeRecurringExport.permissions).toEqual([]);
    await runAdapter(financeRecurringExport);
    expect(q.listRecurringEntries).toHaveBeenCalledWith(TENANT);
    expect(q.listAccounts).toHaveBeenCalledWith(TENANT);
  });

  it("writes entry, frequency label, next and last run, accounts, amount, active", async () => {
    const { workbook } = await runAdapter(financeRecurringExport);
    expect(headers(workbook, "Recurring entries")).toEqual([
      "Recurring entry", "Memo", "Frequency", "Starts", "Next run", "Last run", "Ends", "Accounts", "Amount", "Active",
    ]);
    expect(rowValues(workbook, "Recurring entries")).toMatchObject({ Frequency: "Every month", Ends: null, Amount: 25000, Active: true });
    expect((await csvLines(workbook))[1]).toBe(
      "Office rent,,Every month,2026-04-01,2026-10-01,2026-09-01,,6100 Rent; 1010 Bank,25000,Yes",
    );
    expect(rowValues(workbook, "Template lines", 1)).toEqual({
      "Recurring entry": "Office rent",
      Line: 2,
      "Account code": "1010",
      Account: "Bank",
      Debit: 0,
      Credit: 25000,
      "Line memo": "Transfer",
    });
  });
});
