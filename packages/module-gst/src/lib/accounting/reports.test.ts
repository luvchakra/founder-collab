import { describe, expect, it } from "vitest";
import { balanceSheet, profitAndLoss, trialBalance, type AccountBalanceInput } from "./reports";
import type { AccountType } from "./types";

function acc(
  accountNumber: string,
  type: AccountType,
  debit: number,
  credit: number,
  openingBalance = 0,
): AccountBalanceInput {
  return { accountId: accountNumber, accountNumber, name: `Account ${accountNumber}`, type, debit, credit, openingBalance };
}

/**
 * One month of a small business, posted as the engine would post it:
 *   sale of 1,000 + 180 GST on credit, 600 of that collected,
 *   stock bought for 400 on credit, and 200 of rent paid.
 */
const month: AccountBalanceInput[] = [
  acc("1100", "asset", 600, 200),      // bank: 600 in, 200 rent out
  acc("1300", "asset", 1180, 600),     // receivable raised, part collected
  acc("1400", "asset", 400, 0),        // stock bought
  acc("2100", "liability", 0, 400),    // payable to supplier
  acc("2200", "liability", 0, 180),    // output GST
  acc("4200", "income", 0, 1000),      // revenue
  acc("6200", "expense", 200, 0),      // rent
];

describe("trial balance", () => {
  const tb = trialBalance(month);

  it("balances, which is the whole point of the report", () => {
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it("shows each account on one side only, at its net", () => {
    const bank = tb.rows.find((r) => r.accountNumber === "1100")!;
    expect(bank.debit).toBe(400);
    expect(bank.credit).toBe(0);
  });

  it("puts a credit-balance account in the credit column", () => {
    const payable = tb.rows.find((r) => r.accountNumber === "2100")!;
    expect(payable.credit).toBe(400);
    expect(payable.debit).toBe(0);
  });

  // An account that netted to nothing is noise on a trial balance.
  it("leaves out an account with no net movement", () => {
    const tbWithIdle = trialBalance([...month, acc("6900", "expense", 50, 50)]);
    expect(tbWithIdle.rows.some((r) => r.accountNumber === "6900")).toBe(false);
  });

  it("lists accounts in account-number order", () => {
    expect(tb.rows.map((r) => r.accountNumber)).toEqual([...tb.rows.map((r) => r.accountNumber)].sort());
  });

  // A trial balance that doesn't balance means the ledger is broken, and the report has
  // to say so rather than quietly hiding it.
  it("reports an unbalanced ledger as unbalanced", () => {
    expect(trialBalance([acc("1100", "asset", 100, 0)]).balanced).toBe(false);
  });
});

describe("profit and loss", () => {
  const pl = profitAndLoss([...month, acc("5100", "cogs", 300, 0)]);

  it("reports income credit-positive and costs debit-positive", () => {
    expect(pl.totalIncome).toBe(1000);
    expect(pl.totalCogs).toBe(300);
    expect(pl.totalExpenses).toBe(200);
  });

  it("gives gross profit as income less cost of sales", () => {
    expect(pl.grossProfit).toBe(700);
  });

  it("gives net profit as gross profit less expenses", () => {
    expect(pl.netProfit).toBe(500);
  });

  it("never brings the balance sheet's accounts into the trading result", () => {
    const named = [...pl.income, ...pl.cogs, ...pl.expenses].map((l) => l.accountNumber);
    expect(named).not.toContain("1100");
    expect(named).not.toContain("2100");
  });

  // An opening balance is where the business stood before; counting it here would
  // report last year's trading as this period's.
  it("ignores opening balances", () => {
    const withOpening = profitAndLoss([acc("4200", "income", 0, 1000, 99999)]);
    expect(withOpening.totalIncome).toBe(1000);
  });

  it("reports a loss as a negative net profit rather than hiding the sign", () => {
    expect(profitAndLoss([acc("4200", "income", 0, 100), acc("6200", "expense", 400, 0)]).netProfit).toBe(-300);
  });

  it("handles a business with no trading at all", () => {
    const empty = profitAndLoss([acc("1100", "asset", 500, 0)]);
    expect(empty.netProfit).toBe(0);
    expect(empty.income).toEqual([]);
  });
});

describe("balance sheet", () => {
  const bs = balanceSheet(month);

  // Until the year is closed nothing has moved trading results into retained earnings,
  // so leaving the period's profit out would put the sheet out by exactly the profit --
  // the classic "my balance sheet doesn't balance" that is a missing line, not a broken
  // ledger.
  it("balances once this period's profit is shown as its own equity line", () => {
    expect(bs.profitForPeriod).toBe(800);
    expect(bs.totalAssets).toBe(bs.totalEquityAndLiabilities);
    expect(bs.balanced).toBe(true);
  });

  it("reports assets at what they hold and liabilities at what is owed", () => {
    expect(bs.totalAssets).toBe(1380);
    expect(bs.totalLiabilities).toBe(580);
  });

  it("carries opening balances into the position", () => {
    const withOpening = balanceSheet([
      acc("1100", "asset", 0, 0, 5000),
      acc("3100", "equity", 0, 0, 5000),
    ]);
    expect(withOpening.totalAssets).toBe(5000);
    expect(withOpening.balanced).toBe(true);
  });

  it("stays balanced once capital is introduced and spent", () => {
    const funded = balanceSheet([
      acc("1100", "asset", 10000, 2000),
      acc("1500", "asset", 2000, 0),
      acc("3100", "equity", 0, 10000),
    ]);
    expect(funded.totalAssets).toBe(10000);
    expect(funded.balanced).toBe(true);
  });

  it("balances through a loss as well as a profit", () => {
    const loss = balanceSheet([
      acc("1100", "asset", 0, 300),
      acc("3100", "equity", 0, 0),
      acc("6200", "expense", 300, 0),
    ]);
    expect(loss.profitForPeriod).toBe(-300);
    expect(loss.balanced).toBe(true);
  });

  it("leaves out an account holding nothing", () => {
    expect(balanceSheet(month).assets.some((l) => l.amount === 0)).toBe(false);
  });
});

describe("the statements agree with each other", () => {
  const extended = [...month, acc("5100", "cogs", 300, 0), acc("1400", "asset", 0, 300)];

  it("shows the same profit on the P&L and in the balance sheet's equity", () => {
    expect(balanceSheet(extended).profitForPeriod).toBe(profitAndLoss(extended).netProfit);
  });

  // If the trial balance balances, the balance sheet must too: both are the same ledger
  // read two ways, and a disagreement would mean one of the two is wrong.
  it("balances on both reports or neither", () => {
    expect(balanceSheet(extended).balanced).toBe(trialBalance(extended).balanced);
  });

  it("does not lose a paisa to floating point across the statements", () => {
    const fiddly = [
      acc("1300", "asset", 0.1, 0),
      acc("1100", "asset", 0.2, 0),
      acc("4200", "income", 0, 0.3),
    ];
    expect(trialBalance(fiddly).balanced).toBe(true);
    expect(balanceSheet(fiddly).balanced).toBe(true);
    expect(profitAndLoss(fiddly).netProfit).toBe(0.3);
  });
});
