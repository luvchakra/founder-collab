import { describe, expect, it } from "vitest";
import { buildAccountLedger, type RawLedgerLine } from "./account-ledger";
import type { AccountType } from "./types";

// FIN-7 — report drill-down.

function line(postingDate: string, entryNumber: string, debit: number, credit: number): RawLedgerLine {
  return {
    entryId: entryNumber,
    entryNumber,
    postingDate,
    entryMemo: null,
    status: "posted",
    sourceModule: null,
    sourceEntityType: null,
    sourceDocumentId: null,
    lineMemo: null,
    debit,
    credit,
  };
}

const account = (type: AccountType) => ({ id: "a", accountNumber: "1100", name: "Bank", type });

describe("buildAccountLedger", () => {
  it("brings a balance-sheet account forward and ends on its position at the period's end", () => {
    const ledger = buildAccountLedger({
      account: account("asset"),
      openingBalance: 1000,
      priorDebit: 500,
      priorCredit: 200,
      periodDebit: 300,
      periodCredit: 50,
      lines: [line("2026-09-10", "JE-2", 0, 50), line("2026-09-02", "JE-1", 300, 0)],
      truncated: false,
    });
    expect(ledger.broughtForward).toBe(1300);
    // Sorted by date, running balance in the account's normal direction.
    expect(ledger.lines.map((l) => [l.entryNumber, l.runningBalance])).toEqual([
      ["JE-1", 1600],
      ["JE-2", 1550],
    ]);
    expect(ledger.movement).toBe(250);
    expect(ledger.statementAmount).toBe(1550);
  });

  it("reads a credit-normal account positive", () => {
    const ledger = buildAccountLedger({
      account: account("liability"),
      openingBalance: 0,
      priorDebit: 0,
      priorCredit: 100,
      periodDebit: 40,
      periodCredit: 0,
      lines: [line("2026-09-05", "JE-1", 40, 0)],
      truncated: false,
    });
    expect(ledger.broughtForward).toBe(100);
    expect(ledger.lines[0]!.runningBalance).toBe(60);
    expect(ledger.statementAmount).toBe(60);
  });

  it("brings nothing forward for a profit and loss account: the statement shows the period's activity", () => {
    const ledger = buildAccountLedger({
      account: account("income"),
      openingBalance: 0,
      priorDebit: 0,
      priorCredit: 9999,
      periodDebit: 0,
      periodCredit: 700,
      lines: [line("2026-09-05", "JE-1", 0, 700)],
      truncated: false,
    });
    expect(ledger.broughtForward).toBe(0);
    expect(ledger.statementAmount).toBe(700);
  });

  it("takes the totals from the ledger aggregate, not from the (capped) list", () => {
    const ledger = buildAccountLedger({
      account: account("expense"),
      openingBalance: 0,
      priorDebit: 0,
      priorCredit: 0,
      periodDebit: 10000,
      periodCredit: 0,
      lines: [line("2026-09-01", "JE-1", 10, 0)],
      truncated: true,
    });
    expect(ledger.truncated).toBe(true);
    expect(ledger.statementAmount).toBe(10000);
  });
});
