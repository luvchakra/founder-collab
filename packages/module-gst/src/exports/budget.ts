// EXP-FIN-10 -- Budget vs Actual export (/finance/budget).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportSheet } from "@cofounderai/core/exports/types";
import { getBudgetVsActual } from "../lib/accounting/budget-queries";
import type { VarianceDirection, VarianceRow } from "../lib/accounting/budgets";
import { ACCOUNT_TYPE_LABEL } from "../components/accounting/labels";
import { getFiscalContext } from "./periods";
import { FINANCE_FILE_MODULE, FINANCE_LICENCE, FINANCE_READ_PERMISSIONS, getLedgerCurrency, money } from "./shared";

const DIRECTION_LABEL: Record<VarianceDirection, string> = {
  favourable: "Favourable",
  adverse: "Adverse",
  on_budget: "On budget",
};

type SummaryRow = { measure: string; amount: number; direction: string | null };

/**
 * The page has no period selector: it is always the current fiscal year to date (first
 * month of the fiscal year through the end of this month), from `getBudgetVsActual`. The
 * export uses exactly that range -- resolved by `getFiscalContext`, the page's own
 * derivation -- and the loader's own variance rows and totals. Percentages are written as
 * fractions (0.125 = 12.5%). The page reads with no permission check.
 */
export const financeBudgetExport: ExportAdapter<Record<string, never>> = {
  id: "finance.budget",
  module: FINANCE_LICENCE,
  permissions: FINANCE_READ_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const fiscal = await getFiscalContext(context.businessId);
    const from = fiscal.year[0]!.startDate;
    const to = fiscal.thisMonth.endDate;
    const [summary, currency] = await Promise.all([
      getBudgetVsActual(context.businessId, from, to),
      getLedgerCurrency(context.businessId),
    ]);

    const account = [
      { key: "code", header: "Account code", getValue: (r: VarianceRow) => r.accountNumber },
      { key: "account", header: "Account", getValue: (r: VarianceRow) => r.name },
      { key: "type", header: "Type", getValue: (r: VarianceRow) => ACCOUNT_TYPE_LABEL[r.type] ?? r.type },
    ];

    const summaryRows: SummaryRow[] = [
      { measure: "Total budgeted", amount: summary.totalBudgeted, direction: null },
      { measure: "Total actual", amount: summary.totalActual, direction: null },
      { measure: "Budgeted profit", amount: summary.budgetedProfit, direction: null },
      { measure: "Actual profit", amount: summary.actualProfit, direction: null },
      { measure: "Profit variance", amount: summary.profitVariance, direction: DIRECTION_LABEL[summary.profitDirection] },
    ];
    const summarySheet: ExportSheet<SummaryRow> = {
      sheetName: "Summary",
      rows: summaryRows,
      columns: [
        { key: "measure", header: "Measure", getValue: (r) => r.measure },
        money("amount", "Amount", (r: SummaryRow) => r.amount, currency),
        { key: "direction", header: "Direction", getValue: (r) => r.direction },
      ],
    };

    return {
      module: FINANCE_FILE_MODULE,
      resource: "budget-vs-actual",
      title: `Budget vs actual, ${fiscal.label} to date`,
      csvSheet: "Variance",
      metadata: {
        "Fiscal year": fiscal.label,
        From: from,
        To: to,
        Currency: currency,
        ...(summary.hasBudget ? {} : { Note: "No budget has been entered for this fiscal year." }),
      },
      sheets: [
        summarySheet,
        {
          sheetName: "Budget",
          rows: summary.rows,
          columns: [...account, money("budgeted", "Budgeted", (r: VarianceRow) => r.budgeted, currency)],
        },
        {
          sheetName: "Actual",
          rows: summary.rows,
          columns: [...account, money("actual", "Actual", (r: VarianceRow) => r.actual, currency)],
        },
        {
          sheetName: "Variance",
          rows: summary.rows,
          columns: [
            ...account,
            money("budgeted", "Budgeted", (r: VarianceRow) => r.budgeted, currency),
            money("actual", "Actual", (r: VarianceRow) => r.actual, currency),
            money("variance", "Variance", (r: VarianceRow) => r.variance, currency),
            {
              key: "percent",
              header: "Variance % of budget",
              type: "percent",
              getValue: (r: VarianceRow) => (r.percentOfBudget == null ? null : r.percentOfBudget / 100),
            },
            { key: "direction", header: "Direction", getValue: (r: VarianceRow) => DIRECTION_LABEL[r.direction] ?? r.direction },
          ],
        },
      ],
    };
  },
};
