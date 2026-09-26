import { describe, expect, it } from "vitest";
import {
  balanceSheet,
  cashFlowActivity,
  cashFlowStatement,
  profitAndLoss,
  trialBalance,
  type AccountBalanceInput,
  type CashFlowInput,
} from "./reports";
import { cashPosition, type StatementTotals } from "./report-queries";
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

// FIN-5 — the cash flow statement.
describe("cashFlowActivity", () => {
  const a = (accountNumber: string, type: CashFlowInput["type"], subtype: string | null = null) => ({ accountNumber, type, subtype });

  it("puts trading and working capital under operating", () => {
    expect(cashFlowActivity(a("4100", "income"))).toBe("operating");
    expect(cashFlowActivity(a("6200", "expense"))).toBe("operating");
    expect(cashFlowActivity(a("1300", "asset"))).toBe("operating");
    expect(cashFlowActivity(a("2100", "liability"))).toBe("operating");
    expect(cashFlowActivity(a("2200", "liability"))).toBe("operating");
  });

  it("puts fixed assets under investing, by the default block or a sub-type", () => {
    expect(cashFlowActivity(a("1500", "asset"))).toBe("investing");
    expect(cashFlowActivity(a("1510", "asset"))).toBe("investing");
    expect(cashFlowActivity(a("1800", "asset", "fixed_asset"))).toBe("investing");
  });

  it("puts equity and borrowing under financing", () => {
    expect(cashFlowActivity(a("3100", "equity"))).toBe("financing");
    expect(cashFlowActivity(a("2400", "liability"))).toBe("financing");
    expect(cashFlowActivity(a("2900", "liability", "Long-term loan"))).toBe("financing");
  });
});

describe("cashFlowStatement", () => {
  const flow = (accountNumber: string, type: CashFlowInput["type"], amount: number): CashFlowInput => ({
    accountId: accountNumber,
    accountNumber,
    name: `Account ${accountNumber}`,
    type,
    subtype: null,
    amount,
  });
  const flows = [
    flow("1300", "asset", 50000), // customers paid
    flow("2100", "liability", -20000), // suppliers paid
    flow("6200", "expense", -5000), // rent paid on the spot
    flow("1500", "asset", -30000), // a laptop
    flow("3100", "equity", 100000), // capital in
    flow("2400", "liability", -10000), // loan repaid
  ];

  it("groups each flow into its activity and totals them", () => {
    const cf = cashFlowStatement(flows, 1000, 86000);
    expect(cf.netOperating).toBe(25000);
    expect(cf.netInvesting).toBe(-30000);
    expect(cf.netFinancing).toBe(90000);
    expect(cf.netChange).toBe(85000);
  });

  it("reconciles when opening plus the flows is the closing cash the ledger holds", () => {
    expect(cashFlowStatement(flows, 1000, 86000).reconciles).toBe(true);
  });

  it("says so when the cash accounts moved in a way the flows don't explain", () => {
    expect(cashFlowStatement(flows, 1000, 86000.5).reconciles).toBe(false);
  });

  it("drops a flow that nets to nothing", () => {
    const cf = cashFlowStatement([flow("1300", "asset", 0)], 0, 0);
    expect(cf.operating).toEqual([]);
    expect(cf.reconciles).toBe(true);
  });
});

describe("cashPosition", () => {
  const totals = (
    accountNumber: string,
    isCash: boolean,
    period: [number, number],
    toDate: [number, number],
    openingBalance = 0,
  ): StatementTotals => ({
    accountId: accountNumber,
    accountNumber,
    name: accountNumber,
    type: "asset",
    subtype: null,
    debit: period[0],
    credit: period[1],
    debitToDate: toDate[0],
    creditToDate: toDate[1],
    openingBalance,
    isCash,
  });

  it("reads opening cash as everything before the period and closing as everything to its end", () => {
    // Bank: opening balance 500, 2000 in before the period, then +700/-200 in it.
    const position = cashPosition([
      totals("1100", true, [700, 200], [2700, 200], 500),
      totals("1300", false, [9999, 0], [9999, 0]),
    ]);
    expect(position).toEqual({ opening: 2500, closing: 3000 });
  });
});

describe("the balance sheet is a position as at the period's end (FIN-5)", () => {
  it("counts every earlier month's movement, not just the period's", () => {
    // Bank received 1000 in April (before the period) and 200 in September (in it).
    const asAt = [acc("1100", "asset", 1200, 0), acc("3100", "equity", 0, 1000), acc("4100", "income", 0, 200)];
    const bs = balanceSheet(asAt);
    expect(bs.totalAssets).toBe(1200);
    expect(bs.profitForPeriod).toBe(200);
    expect(bs.balanced).toBe(true);
  });
});
