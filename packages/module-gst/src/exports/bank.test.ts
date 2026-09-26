import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-FIN-08 -- Bank / Reconciliation export.

const q = vi.hoisted(() => ({ listBankAccounts: vi.fn(), listBankTransactionsForExport: vi.fn(), getLedgerCurrency: vi.fn() }));
vi.mock("../lib/accounting/banking-queries", () => ({ listBankAccounts: q.listBankAccounts }));
vi.mock("./queries", () => ({ listBankTransactionsForExport: q.listBankTransactionsForExport }));
vi.mock("./shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./shared")>()),
  getLedgerCurrency: q.getLedgerCurrency,
}));

import { ExportDeniedError } from "@cofounderai/core/exports/server";
import { financeBankAccountsExport, financeBankTransactionsExport } from "./bank";
import { TENANT, csvLines, everyValue, headers, rowValues, runAdapter } from "./test-support";

const ACCOUNT = {
  id: "bank-1",
  name: "HDFC Current",
  bank_name: "HDFC Bank",
  account_number_last4: "4321",
  account_type: "current",
  ledger_account_id: "acc-bank",
  opening_balance: 10000,
  is_active: true,
  statementBalance: 12500,
  unmatchedCount: 1,
  transactionCount: 2,
};

beforeEach(() => {
  q.listBankAccounts.mockReset().mockResolvedValue([ACCOUNT]);
  q.listBankTransactionsForExport.mockReset().mockResolvedValue([
    { id: "t-1", bank_account_id: "bank-1", txn_date: "2026-09-02", description: "NEFT Mehta & Co", reference: "UTR123", amount: 3000, balance_after: 13000, status: "matched", matched_entry_id: "e-7", matchedEntryNumber: "JE-0007" },
    { id: "t-2", bank_account_id: "bank-1", txn_date: "2026-09-03", description: "=HYPERLINK(\"x\")", reference: null, amount: -500, balance_after: null, status: "unmatched", matched_entry_id: null, matchedEntryNumber: null },
  ]);
  q.getLedgerCurrency.mockReset().mockResolvedValue("INR");
});

describe("EXP-FIN-08 finance.bank-accounts", () => {
  it("is Finance-licensed, reads the context tenant, and carries only the last four digits", async () => {
    expect(financeBankAccountsExport.module).toBe("gst");
    expect(financeBankAccountsExport.permissions).toEqual([]);
    const { workbook } = await runAdapter(financeBankAccountsExport);
    expect(q.listBankAccounts).toHaveBeenCalledWith(TENANT);
    expect(rowValues(workbook, "Bank accounts")).toMatchObject({
      "Bank account": "HDFC Current",
      "Account number (last 4)": "4321",
      "Account type": "Current",
      "Linked to ledger": true,
      "Balance per statement": 12500,
      "Lines to match": 1,
    });
    expect(everyValue(workbook)).not.toContain("acc-bank");
  });
});

describe("EXP-FIN-08 finance.bank-transactions", () => {
  it("only exports an account that belongs to the context's business", async () => {
    await expect(runAdapter(financeBankTransactionsExport, { bankAccountId: "bank-of-another-business" })).rejects.toBeInstanceOf(
      ExportDeniedError,
    );
    expect(q.listBankAccounts).toHaveBeenCalledWith(TENANT);
    expect(q.listBankTransactionsForExport).not.toHaveBeenCalled();
  });

  it("reads every line of the selected account for the context's business", async () => {
    const { filters } = await runAdapter(financeBankTransactionsExport, { bankAccountId: "bank-1", status: "unmatched" });
    expect(filters).toEqual({ bankAccountId: "bank-1" });
    expect(q.listBankTransactionsForExport).toHaveBeenCalledWith(TENANT, "bank-1");
  });

  it("writes debit/credit as numbers, blank balance stays blank, labels not codes, and neutralises formulas", async () => {
    const { workbook } = await runAdapter(financeBankTransactionsExport, { bankAccountId: "bank-1" });
    expect(headers(workbook, "Statement lines")).toEqual([
      "Bank account", "Transaction date", "Description", "Reference", "Debit (money out)", "Credit (money in)",
      "Balance", "Reconciliation state", "Matched journal entry",
    ]);
    expect(rowValues(workbook, "Statement lines", 0)).toMatchObject({
      "Debit (money out)": null,
      "Credit (money in)": 3000,
      "Reconciliation state": "Matched",
      "Matched journal entry": "JE-0007",
    });
    expect(rowValues(workbook, "Statement lines", 1)).toMatchObject({ "Debit (money out)": 500, Balance: null, "Reconciliation state": "To match" });
    const lines = await csvLines(workbook);
    expect(lines[1]).toBe("HDFC Current,2026-09-02,NEFT Mehta & Co,UTR123,,3000,13000,Matched,JE-0007");
    expect(lines[2]).toBe(`HDFC Current,2026-09-03,"'=HYPERLINK(""x"")",,500,,,To match,`);
  });
});
