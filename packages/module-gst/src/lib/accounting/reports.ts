import { normalBalance } from "./balance";
import type { AccountType } from "./types";

/**
 * The three statements, derived from the ledger and nothing else.
 *
 * All pure: given each account's debit and credit totals for a period, these produce the
 * trial balance, the profit and loss account and the balance sheet. Nothing here queries
 * anything, which is what lets the accounting be tested directly — and the accounting is
 * the part that has to be right.
 */

export interface AccountBalanceInput {
  accountId: string;
  accountNumber: string;
  name: string;
  type: AccountType;
  /** Totals for the period being reported, from posted (and reversed) journal lines. */
  debit: number;
  credit: number;
  /** Carried into the balance sheet but never into the profit and loss account: an
   * opening balance is where the account stood before the ledger started, which is a
   * position, not activity in this period. */
  openingBalance?: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Trial balance
// ---------------------------------------------------------------------------

export interface TrialBalanceRow {
  accountId: string;
  accountNumber: string;
  name: string;
  type: AccountType;
  /** An account shows in one column or the other, on whichever side its net lands —
   * showing both would report gross activity, which is not what a trial balance is. */
  debit: number;
  credit: number;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  /** The whole point of the report. Anything but true means the ledger itself is
   * broken, not that the report is wrong. */
  balanced: boolean;
}

export function trialBalance(accounts: AccountBalanceInput[]): TrialBalance {
  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const account of accounts) {
    const net = round2(account.debit - account.credit);
    if (net === 0) continue; // An account with no activity is noise on a trial balance.
    const row: TrialBalanceRow = {
      accountId: account.accountId,
      accountNumber: account.accountNumber,
      name: account.name,
      type: account.type,
      debit: net > 0 ? net : 0,
      credit: net < 0 ? -net : 0,
    };
    rows.push(row);
    totalDebit = round2(totalDebit + row.debit);
    totalCredit = round2(totalCredit + row.credit);
  }

  rows.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

// ---------------------------------------------------------------------------
// Profit and loss
// ---------------------------------------------------------------------------

export interface StatementLine {
  accountId: string;
  accountNumber: string;
  name: string;
  /** Positive in the direction that reads naturally on the statement: revenue earned,
   * cost incurred — not the raw debit/credit sign. */
  amount: number;
}

export interface ProfitAndLoss {
  income: StatementLine[];
  cogs: StatementLine[];
  expenses: StatementLine[];
  totalIncome: number;
  totalCogs: number;
  /** Income less cost of sales — the number a founder actually reads. */
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
}

/** Amount in the direction the statement reads: credit-positive for income,
 * debit-positive for costs. */
function statementAmount(account: AccountBalanceInput): number {
  return normalBalance(account.type) === "credit"
    ? round2(account.credit - account.debit)
    : round2(account.debit - account.credit);
}

function lines(accounts: AccountBalanceInput[], type: AccountType): StatementLine[] {
  return accounts
    .filter((a) => a.type === type)
    .map((a) => ({
      accountId: a.accountId,
      accountNumber: a.accountNumber,
      name: a.name,
      amount: statementAmount(a),
    }))
    .filter((line) => line.amount !== 0)
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
}

const sum = (ls: StatementLine[]) => round2(ls.reduce((total, line) => total + line.amount, 0));

/**
 * The profit and loss account for a period.
 *
 * Opening balances are deliberately ignored: they are where the business stood before,
 * and including them would report last year's trading as this period's.
 */
export function profitAndLoss(accounts: AccountBalanceInput[]): ProfitAndLoss {
  const income = lines(accounts, "income");
  const cogs = lines(accounts, "cogs");
  const expenses = lines(accounts, "expense");

  const totalIncome = sum(income);
  const totalCogs = sum(cogs);
  const totalExpenses = sum(expenses);
  const grossProfit = round2(totalIncome - totalCogs);

  return {
    income,
    cogs,
    expenses,
    totalIncome,
    totalCogs,
    grossProfit,
    totalExpenses,
    netProfit: round2(grossProfit - totalExpenses),
  };
}

// ---------------------------------------------------------------------------
// Balance sheet
// ---------------------------------------------------------------------------

export interface BalanceSheet {
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  totalAssets: number;
  totalLiabilities: number;
  /** Equity as posted, before this period's result. */
  totalEquity: number;
  /** This period's profit, shown as its own equity line. Until the year is closed,
   * nothing has moved trading results into retained earnings, so a balance sheet that
   * left it out would be out by exactly the profit — the classic "my balance sheet
   * doesn't balance" that is really a missing line, not a broken ledger. */
  profitForPeriod: number;
  totalEquityAndLiabilities: number;
  balanced: boolean;
}

/** Position, not activity: what the account holds, opening balance included. */
function positionAmount(account: AccountBalanceInput): number {
  return round2(statementAmount(account) + (account.openingBalance ?? 0));
}

function positionLines(accounts: AccountBalanceInput[], type: AccountType): StatementLine[] {
  return accounts
    .filter((a) => a.type === type)
    .map((a) => ({
      accountId: a.accountId,
      accountNumber: a.accountNumber,
      name: a.name,
      amount: positionAmount(a),
    }))
    .filter((line) => line.amount !== 0)
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
}

export function balanceSheet(accounts: AccountBalanceInput[]): BalanceSheet {
  const assets = positionLines(accounts, "asset");
  const liabilities = positionLines(accounts, "liability");
  const equity = positionLines(accounts, "equity");

  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = sum(equity);
  const profitForPeriod = profitAndLoss(accounts).netProfit;
  const totalEquityAndLiabilities = round2(totalLiabilities + totalEquity + profitForPeriod);

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    profitForPeriod,
    totalEquityAndLiabilities,
    balanced: totalAssets === totalEquityAndLiabilities,
  };
}
