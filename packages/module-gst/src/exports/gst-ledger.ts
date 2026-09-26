// EXP-FIN-07 -- GST Ledger export (/finance/gst-ledger).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportSheet } from "@cofounderai/core/exports/types";
import { GST_COMPONENTS, type GstComponent } from "../lib/accounting/gst-ledger";
import type { ItcAssessment } from "../lib/accounting/itc";
import {
  loadGstPeriodPosition,
  purchaseRegisterSheet,
  reconciliationSheet,
  salesB2bSheet,
  salesB2cSheet,
  salesCreditNotesSheet,
} from "./gst-registers";
import { resolveFiscalMonth } from "./periods";
import { FINANCE_FILE_MODULE, FINANCE_LICENCE, FINANCE_READ_PERMISSIONS, getLedgerCurrency, money } from "./shared";

type Filters = { period: string };

const ITC_RISK_LABEL: Record<ItcAssessment["risk"], string> = {
  clear: "Clear",
  leaving_credit: "Credit left unclaimed",
  over_claimed: "Over-claimed",
  unknown: "Unknown (no GSTR-2B imported)",
};

type SummaryRow = { line: string; output: number | null; input: number | null; net: number | null };
type ItcRow = { measure: string; amount: number | null; value: string | null };

/**
 * The page's `?period=YYYY-MM` picks a month of the current fiscal year (anything else
 * means this month) -- `resolveFiscalMonth` repeats that choice, and
 * `loadGstPeriodPosition` the page's own reads, so the file is the period on screen. The
 * CSV is the GST summary; Excel adds both registers, ITC and the books-vs-return
 * reconciliation. The page reads with no permission check.
 */
export const financeGstLedgerExport: ExportAdapter<Filters> = {
  id: "finance.gst-ledger",
  module: FINANCE_LICENCE,
  permissions: FINANCE_READ_PERMISSIONS,
  // Only a `YYYY-MM` can match a fiscal month; anything else means "this month" either way.
  parseFilters: (params) => ({ period: /^\d{4}-\d{2}$/.test(params.get("period") ?? "") ? params.get("period")! : "" }),
  describeFilters: (f) => ({ Period: f.period }),
  async load(context, filters) {
    const selected = await resolveFiscalMonth(context.businessId, filters.period);
    const [{ ledger, sales, purchases, twoB, reconciliation, itc }, currency] = await Promise.all([
      loadGstPeriodPosition(context.businessId, selected),
      getLedgerCurrency(context.businessId),
    ]);

    // The page's "By component" table: components with any activity, then the total.
    const summary: SummaryRow[] = [
      ...GST_COMPONENTS.filter((c: GstComponent) => ledger.output[c] !== 0 || ledger.input[c] !== 0).map((c) => ({
        line: c,
        output: ledger.output[c],
        input: ledger.input[c],
        net: Math.round((ledger.output[c] - ledger.input[c]) * 100) / 100,
      })),
      { line: "Total", output: ledger.output.total, input: ledger.input.total, net: ledger.netPayable },
    ];

    const itcRows: ItcRow[] = [
      { measure: "Claimable", amount: itc.claimable, value: null },
      { measure: "At risk", amount: itc.atRisk, value: null },
      { measure: "Not taken up", amount: itc.unclaimed, value: null },
      { measure: "Outside 2B (no supplier GSTIN)", amount: itc.excludedNoGstin, value: null },
      { measure: "Risk", amount: null, value: ITC_RISK_LABEL[itc.risk] ?? itc.risk },
      { measure: "Books agree with register", amount: null, value: itc.booksAgree ? "Yes" : "No" },
      { measure: "GSTR-2B imported", amount: null, value: twoB ? "Yes" : "No" },
      { measure: "Assessment", amount: null, value: itc.headline },
    ];

    const summarySheet: ExportSheet<SummaryRow> = {
      sheetName: "GST Summary",
      rows: ledger.hasAccounts ? summary : [],
      columns: [
        { key: "component", header: "Component", getValue: (r) => r.line },
        money("output", "Output tax (on sales)", (r: SummaryRow) => r.output, currency),
        money("input", "Input tax credit (on purchases)", (r: SummaryRow) => r.input, currency),
        money("net", "Net payable", (r: SummaryRow) => r.net, currency),
      ],
    };
    const itcSheet: ExportSheet<ItcRow> = {
      sheetName: "ITC",
      rows: ledger.hasAccounts ? itcRows : [],
      columns: [
        { key: "measure", header: "Measure", getValue: (r) => r.measure },
        money("amount", "Amount", (r: ItcRow) => r.amount, currency),
        { key: "value", header: "Value", getValue: (r) => r.value },
      ],
    };

    return {
      module: FINANCE_FILE_MODULE,
      resource: "gst-ledger",
      title: `GST ledger ${selected.gstPeriod}`,
      metadata: {
        Period: selected.gstPeriod,
        From: selected.startDate,
        To: selected.endDate,
        Currency: currency,
        ...(ledger.hasAccounts ? {} : { Note: "No GST accounts are mapped in the chart of accounts yet." }),
      },
      sheets: [
        summarySheet,
        salesB2bSheet(sales, currency),
        salesB2cSheet(sales, currency),
        salesCreditNotesSheet(sales, currency),
        purchaseRegisterSheet(purchases, currency),
        itcSheet,
        reconciliationSheet(reconciliation.rows, currency),
      ],
    };
  },
};
