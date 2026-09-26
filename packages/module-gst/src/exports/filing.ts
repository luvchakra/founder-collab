// EXP-FIN-12 -- Filing export (/finance/filing).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportSheet } from "@cofounderai/core/exports/types";
import { getBusinessGstFilingProfile, getPurchaseRegister, getSalesRegister } from "../lib/filing/queries";
import {
  hsnSheet,
  purchaseBySupplierSheet,
  purchaseRegisterSheet,
  salesB2bSheet,
  salesB2cSheet,
  salesCreditNotesSheet,
} from "./gst-registers";
import { humanizeCode } from "./labels";
import { calendarPeriodBounds, calendarPeriodParam } from "./periods";
import { FINANCE_FILE_MODULE, FINANCE_LICENCE, FINANCE_READ_PERMISSIONS, getLedgerCurrency, money } from "./shared";

type Filters = { period: string };

type SummaryRow = {
  section: string;
  documents: number | null;
  taxable: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  tax: number | null;
};

/**
 * The page's `?period=YYYY-MM` (this month when absent), bounded by the page's own
 * `periodBounds()` rule, then the page's three reads: the business's filing profile and
 * the purchase and sales registers. CSV is the filing summary (one row per section with
 * its tax components); Excel adds every register the page shows and its own CSV
 * downloads carry -- B2B, B2C, HSN, credit notes, purchases, supplier risk.
 *
 * Additive to the page's existing per-register CSV buttons, which stay as they are. Only
 * the business's GSTIN and registration type are read from the profile; no provider
 * credential is ever reached (those tables are not readable by this client at all). The
 * page reads with no permission check.
 */
export const financeFilingExport: ExportAdapter<Filters> = {
  id: "finance.filing",
  module: FINANCE_LICENCE,
  permissions: FINANCE_READ_PERMISSIONS,
  parseFilters: (params) => ({ period: calendarPeriodParam(params.get("period")) }),
  describeFilters: (f) => ({ Period: f.period }),
  async load(context, filters) {
    const { start, end } = calendarPeriodBounds(filters.period);
    const [profile, purchases, sales, currency] = await Promise.all([
      getBusinessGstFilingProfile(context.businessId),
      getPurchaseRegister(context.businessId, start, end),
      getSalesRegister(context.businessId, start, end),
      getLedgerCurrency(context.businessId),
    ]);

    const summary: SummaryRow[] = [
      {
        section: "Outward supplies (sales)",
        documents: sales.invoiceCount,
        taxable: sales.taxableValue,
        cgst: sales.cgst,
        sgst: sales.sgst,
        igst: sales.igst,
        tax: sales.totalTax,
      },
      {
        section: "Credit notes issued",
        documents: sales.creditNotes.length,
        taxable: sales.creditTaxableValue,
        cgst: null,
        sgst: null,
        igst: null,
        tax: sales.creditTax,
      },
      {
        section: "Net outward supplies",
        documents: null,
        taxable: sales.netTaxableValue,
        cgst: null,
        sgst: null,
        igst: null,
        tax: sales.netTax,
      },
      {
        section: "Inward supplies (purchases, ITC)",
        documents: purchases.poCount,
        taxable: purchases.taxableValue,
        cgst: purchases.cgst,
        sgst: purchases.sgst,
        igst: purchases.igst,
        tax: purchases.totalTax,
      },
    ];

    const registration = humanizeCode(profile.gst_registration_type);
    const summarySheet: ExportSheet<SummaryRow> = {
      sheetName: "Filing summary",
      rows: summary,
      columns: [
        { key: "period", header: "Period", getValue: () => filters.period },
        { key: "gstin", header: "GSTIN", getValue: () => profile.gstin },
        { key: "registration", header: "Registration type", getValue: () => registration },
        { key: "section", header: "Section", getValue: (r) => r.section },
        { key: "documents", header: "Documents", type: "integer", getValue: (r) => r.documents },
        money("taxable", "Taxable value", (r: SummaryRow) => r.taxable, currency),
        money("cgst", "CGST", (r: SummaryRow) => r.cgst, currency),
        money("sgst", "SGST", (r: SummaryRow) => r.sgst, currency),
        money("igst", "IGST", (r: SummaryRow) => r.igst, currency),
        money("tax", "Total tax", (r: SummaryRow) => r.tax, currency),
      ],
    };

    return {
      module: FINANCE_FILE_MODULE,
      resource: "gst-filing",
      title: `GST filing ${filters.period}`,
      metadata: {
        Period: filters.period,
        From: start,
        To: end,
        GSTIN: profile.gstin ?? "Not on file",
        "Registration type": registration,
        Currency: currency,
      },
      sheets: [
        summarySheet,
        salesB2bSheet(sales, currency, "Sales B2B invoices"),
        salesB2cSheet(sales, currency),
        hsnSheet("Sales by HSN", sales.byHsn, currency),
        salesCreditNotesSheet(sales, currency),
        purchaseRegisterSheet(purchases, currency),
        purchaseBySupplierSheet(purchases, currency),
        hsnSheet("Purchases by HSN", purchases.byHsn, currency),
      ],
    };
  },
};
