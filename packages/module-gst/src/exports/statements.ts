// EXP-FIN-11 -- Financial Statements export (/finance/reports).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportSheet } from "@cofounderai/core/exports/types";
import { getFinancialStatements } from "../lib/accounting/report-queries";
import type { BalanceSheet, ProfitAndLoss, StatementLine, TrialBalance } from "../lib/accounting/reports";
import { ACCOUNT_TYPE_LABEL } from "../components/accounting/labels";
import { isReportKey, type ReportKey } from "../components/accounting/financial-statements";
import { resolveReportRange } from "./periods";
import { roundMoney } from "./queries";
import { FINANCE_FILE_MODULE, FINANCE_LICENCE, FINANCE_READ_PERMISSIONS, getLedgerCurrency, money } from "./shared";

type Filters = { report: ReportKey; from: string; to: string };

/** Sheet (and CSV) names per report, in the page's tab order. */
export const STATEMENT_SHEET: Record<ReportKey, string> = {
  "profit-and-loss": "Profit & Loss",
  "balance-sheet": "Balance Sheet",
  "trial-balance": "Trial Balance",
};

type StatementRow = {
  section: string;
  lineType: "Account" | "Total" | "Result";
  accountNumber: string | null;
  name: string;
  amount: number;
};

function section(heading: string, lines: StatementLine[], total: number, extra: StatementRow[] = []): StatementRow[] {
  return [
    ...lines.map((l) => ({ section: heading, lineType: "Account" as const, accountNumber: l.accountNumber, name: l.name, amount: l.amount })),
    ...extra,
    { section: heading, lineType: "Total", accountNumber: null, name: `Total ${heading.toLowerCase()}`, amount: total },
  ];
}

/** The profit and loss as the page lays it out: income, cost of sales, gross profit,
 * expenses, net profit -- every figure straight from `profitAndLoss()`. */
function profitAndLossRows(pl: ProfitAndLoss): StatementRow[] {
  return [
    ...section("Income", pl.income, pl.totalIncome),
    ...section("Cost of sales", pl.cogs, pl.totalCogs),
    { section: "Gross profit", lineType: "Result", accountNumber: null, name: "Gross profit", amount: pl.grossProfit },
    ...section("Expenses", pl.expenses, pl.totalExpenses),
    { section: "Net profit", lineType: "Result", accountNumber: null, name: "Net profit", amount: pl.netProfit },
  ];
}

/** The balance sheet as the page lays it out, including its "Profit for the period"
 * equity line (what makes an unclosed year balance). */
function balanceSheetRows(bs: BalanceSheet): StatementRow[] {
  const profitLine: StatementRow = {
    section: "Equity",
    lineType: "Account",
    accountNumber: null,
    name: "Profit for the period",
    amount: bs.profitForPeriod,
  };
  return [
    ...section("Assets", bs.assets, bs.totalAssets),
    ...section("Liabilities", bs.liabilities, bs.totalLiabilities),
    ...section("Equity", bs.equity, roundMoney(bs.totalEquity + bs.profitForPeriod), [profitLine]),
    {
      section: "Equity and liabilities",
      lineType: "Result",
      accountNumber: null,
      name: "Equity and liabilities",
      amount: bs.totalEquityAndLiabilities,
    },
  ];
}

function statementSheet(sheetName: string, rows: StatementRow[], currency: string): ExportSheet<StatementRow> {
  return {
    sheetName,
    rows,
    columns: [
      { key: "section", header: "Section", getValue: (r) => r.section },
      { key: "line_type", header: "Line type", getValue: (r) => r.lineType },
      { key: "code", header: "Account code", getValue: (r) => r.accountNumber },
      { key: "account", header: "Account", getValue: (r) => r.name },
      money("amount", "Amount", (r: StatementRow) => r.amount, currency),
    ],
  };
}

type TrialRow = { lineType: "Account" | "Total"; accountNumber: string | null; name: string; type: string | null; debit: number; credit: number };

function trialBalanceSheet(tb: TrialBalance, currency: string): ExportSheet<TrialRow> {
  const rows: TrialRow[] = [
    ...tb.rows.map((r) => ({
      lineType: "Account" as const,
      accountNumber: r.accountNumber,
      name: r.name,
      type: ACCOUNT_TYPE_LABEL[r.type] ?? r.type,
      debit: r.debit,
      credit: r.credit,
    })),
    { lineType: "Total", accountNumber: null, name: "Total", type: null, debit: tb.totalDebit, credit: tb.totalCredit },
  ];
  return {
    sheetName: STATEMENT_SHEET["trial-balance"],
    rows,
    columns: [
      { key: "line_type", header: "Line type", getValue: (r) => r.lineType },
      { key: "code", header: "Account code", getValue: (r) => r.accountNumber },
      { key: "account", header: "Account", getValue: (r) => r.name },
      { key: "type", header: "Type", getValue: (r) => r.type },
      money("debit", "Debit", (r: TrialRow) => r.debit, currency),
      money("credit", "Credit", (r: TrialRow) => r.credit, currency),
    ],
  };
}

/**
 * The page's own params: `report` (checked with the page's `isReportKey`, defaulting to
 * profit and loss) and `from`/`to` (plain ISO dates, defaulting to fiscal year to date,
 * via the page's own derivation in `resolveReportRange`). One `getFinancialStatements`
 * read gives all three statements for that period, exactly as the page renders them.
 *
 * CSV is the report currently selected; Excel is a workbook of all three for the same
 * period, the selected one first. The page reads with no permission check.
 */
export const financeStatementsExport: ExportAdapter<Filters> = {
  id: "finance.statements",
  module: FINANCE_LICENCE,
  permissions: FINANCE_READ_PERMISSIONS,
  parseFilters: (params) => {
    const report = params.get("report") ?? "";
    return {
      report: isReportKey(report) ? report : "profit-and-loss",
      from: params.get("from") ?? "",
      to: params.get("to") ?? "",
    };
  },
  describeFilters: (f) => ({ Report: STATEMENT_SHEET[f.report], From: f.from, To: f.to }),
  async load(context, filters) {
    const period = await resolveReportRange(context.businessId, filters.from, filters.to);
    const [statements, currency] = await Promise.all([
      getFinancialStatements(context.businessId, period),
      getLedgerCurrency(context.businessId),
    ]);

    const byReport: Record<ReportKey, ExportSheet<StatementRow> | ExportSheet<TrialRow>> = {
      "profit-and-loss": statementSheet(STATEMENT_SHEET["profit-and-loss"], profitAndLossRows(statements.profitAndLoss), currency),
      "balance-sheet": statementSheet(STATEMENT_SHEET["balance-sheet"], balanceSheetRows(statements.balanceSheet), currency),
      "trial-balance": trialBalanceSheet(statements.trialBalance, currency),
    };
    const order: ReportKey[] = ["profit-and-loss", "balance-sheet", "trial-balance"];
    const selectedFirst = [filters.report, ...order.filter((k) => k !== filters.report)];

    const notes: Record<string, string> = {};
    if (!statements.hasActivity) notes.Note = "Nothing has been posted in this period yet.";
    if (!statements.trialBalance.balanced) notes["Trial balance"] = "Out of balance -- check the ledger before relying on it.";
    if (!statements.balanceSheet.balanced) notes["Balance sheet"] = "Out of balance -- check the ledger before relying on it.";

    return {
      module: FINANCE_FILE_MODULE,
      resource: context.format === "csv" ? filters.report : "financial-statements",
      title: context.format === "csv" ? STATEMENT_SHEET[filters.report] : "Financial statements",
      csvSheet: STATEMENT_SHEET[filters.report],
      metadata: { Report: STATEMENT_SHEET[filters.report], From: period.from, To: period.to, Currency: currency, ...notes },
      sheets: selectedFirst.map((key) => byReport[key]),
    };
  },
};
