import type { ExportSheet } from "@cofounderai/core/exports/types";
import type { PeriodSeed } from "../lib/accounting/periods";
import { getGstLedgerSummary } from "../lib/accounting/gst-ledger-queries";
import { reconcileGst, type GstReconciliationRow } from "../lib/accounting/gst-ledger";
import { assessItc } from "../lib/accounting/itc";
import { getPurchaseRegister, getSalesRegister } from "../lib/filing/queries";
import type {
  B2BInvoiceRow,
  B2CRegisterRow,
  GstinRisk,
  HsnRegisterRow,
  PurchaseRegister,
  SalesCreditNoteRow,
  SalesRegister,
  SupplierRegisterRow,
} from "../lib/filing/types";
import { getPurchaseReconciliation } from "../lib/reconciliation/queries";
import { roundMoney } from "./queries";
import { money } from "./shared";

/**
 * EXP-FIN-07 / EXP-FIN-12 / EXP-FIN-13 -- the GST registers and period position, shared by
 * the GST ledger, Filing and Filing readiness exports.
 *
 * Every figure comes from the same loaders and pure functions those pages call
 * (`getSalesRegister`, `getPurchaseRegister`, `getGstLedgerSummary`,
 * `getPurchaseReconciliation`, `reconcileGst`, `assessItc`); the sheets only lay the
 * registers out as tables. Row totals ("Total tax") add a row's own stored CGST/SGST/IGST,
 * exactly as the Filing page's existing CSV download does.
 */

/** The GST ledger and filing-readiness pages' shared read for one month, line for line. */
export async function loadGstPeriodPosition(businessId: string, selected: PeriodSeed) {
  const [ledger, sales, purchases, twoB] = await Promise.all([
    getGstLedgerSummary(businessId, selected.startDate, selected.endDate),
    getSalesRegister(businessId, selected.startDate, selected.endDate),
    getPurchaseRegister(businessId, selected.startDate, selected.endDate),
    getPurchaseReconciliation(businessId, selected.gstPeriod),
  ]);
  const reconciliation = reconcileGst(
    { output: ledger.output, input: ledger.input },
    { outputTax: sales.totalTax, inputTax: purchases.totalTax },
  );
  const itc = assessItc({
    ledger: ledger.input.total,
    register: purchases.totalTax,
    twoB: twoB ? twoB.rows.reduce((sum, row) => sum + (row.gstr2bTax ?? 0), 0) : 0,
    excludedNoGstin: twoB?.excludedNoGstinTaxableValue ?? 0,
    twoBAvailable: twoB !== null,
  });
  return { ledger, sales, purchases, twoB, reconciliation, itc };
}

/** The Filing page's supplier-risk badge wording. */
export const GSTIN_RISK_LABEL: Record<GstinRisk, string> = {
  none: "OK",
  missing: "No GSTIN — reverse charge?",
  invalid: "Invalid GSTIN",
};

type PurchaseLine = PurchaseRegister["csvRows"][number];

export function purchaseRegisterSheet(purchases: PurchaseRegister, currency: string): ExportSheet<PurchaseLine> {
  return {
    sheetName: "Purchase Register",
    rows: purchases.csvRows,
    columns: [
      { key: "po", header: "PO number", getValue: (r) => r.po_number },
      { key: "date", header: "Order date", type: "date", getValue: (r) => r.order_date },
      { key: "supplier", header: "Supplier", getValue: (r) => r.supplier_name },
      { key: "gstin", header: "Supplier GSTIN", getValue: (r) => r.supplier_gstin },
      money("taxable", "Taxable value", (r: PurchaseLine) => r.subtotal, currency),
      money("cgst", "CGST", (r: PurchaseLine) => r.cgst, currency),
      money("sgst", "SGST", (r: PurchaseLine) => r.sgst, currency),
      money("igst", "IGST", (r: PurchaseLine) => r.igst, currency),
      money("tax", "Total tax", (r: PurchaseLine) => roundMoney(r.cgst + r.sgst + r.igst), currency),
      { key: "gstin_status", header: "GSTIN status", getValue: (r) => r.gstinStatus },
    ],
  };
}

export function purchaseBySupplierSheet(purchases: PurchaseRegister, currency: string): ExportSheet<SupplierRegisterRow> {
  return {
    sheetName: "Purchases by supplier",
    rows: purchases.bySupplier,
    columns: [
      { key: "supplier", header: "Supplier", getValue: (r) => r.name },
      { key: "gstin", header: "GSTIN", getValue: (r) => r.gstin },
      money("taxable", "Taxable value", (r: SupplierRegisterRow) => r.taxableValue, currency),
      money("tax", "Tax", (r: SupplierRegisterRow) => r.tax, currency),
      { key: "risk", header: "GSTIN status", getValue: (r) => GSTIN_RISK_LABEL[r.risk] ?? r.risk },
    ],
  };
}

export function hsnSheet(sheetName: string, rows: HsnRegisterRow[], currency: string): ExportSheet<HsnRegisterRow> {
  return {
    sheetName,
    rows,
    columns: [
      { key: "hsn", header: "HSN code", getValue: (r) => r.hsn },
      money("taxable", "Taxable value", (r: HsnRegisterRow) => r.taxableValue, currency),
      money("tax", "Tax", (r: HsnRegisterRow) => r.tax, currency),
    ],
  };
}

export function salesB2bSheet(sales: SalesRegister, currency: string, sheetName = "Sales Register"): ExportSheet<B2BInvoiceRow> {
  return {
    sheetName,
    rows: sales.b2b,
    columns: [
      { key: "invoice", header: "Invoice number", getValue: (r) => r.invoiceNumber },
      { key: "date", header: "Invoice date", type: "date", getValue: (r) => r.invoiceDate },
      { key: "customer", header: "Customer", getValue: (r) => r.customerName },
      { key: "gstin", header: "Customer GSTIN", getValue: (r) => r.gstin },
      money("taxable", "Taxable value", (r: B2BInvoiceRow) => r.taxableValue, currency),
      money("cgst", "CGST", (r: B2BInvoiceRow) => r.cgst, currency),
      money("sgst", "SGST", (r: B2BInvoiceRow) => r.sgst, currency),
      money("igst", "IGST", (r: B2BInvoiceRow) => r.igst, currency),
      money("tax", "Total tax", (r: B2BInvoiceRow) => roundMoney(r.cgst + r.sgst + r.igst), currency),
    ],
  };
}

export function salesB2cSheet(sales: SalesRegister, currency: string): ExportSheet<B2CRegisterRow> {
  return {
    sheetName: "Sales B2C by state",
    rows: sales.b2c,
    columns: [
      { key: "state", header: "Place of supply", getValue: (r) => r.state },
      money("taxable", "Taxable value", (r: B2CRegisterRow) => r.taxableValue, currency),
      money("tax", "Tax", (r: B2CRegisterRow) => r.tax, currency),
    ],
  };
}

export function salesCreditNotesSheet(sales: SalesRegister, currency: string): ExportSheet<SalesCreditNoteRow> {
  return {
    sheetName: "Sales credit notes",
    rows: sales.creditNotes,
    columns: [
      { key: "number", header: "Credit note number", getValue: (r) => r.credit_note_number },
      { key: "date", header: "Date", type: "date", getValue: (r) => r.credit_note_date },
      { key: "against", header: "Against invoice", getValue: (r) => r.against_invoice_number },
      money("taxable", "Taxable value", (r: SalesCreditNoteRow) => r.subtotal, currency),
      money("cgst", "CGST", (r: SalesCreditNoteRow) => r.cgst, currency),
      money("sgst", "SGST", (r: SalesCreditNoteRow) => r.sgst, currency),
      money("igst", "IGST", (r: SalesCreditNoteRow) => r.igst, currency),
      money("total", "Total", (r: SalesCreditNoteRow) => roundMoney(r.subtotal + r.cgst + r.sgst + r.igst), currency),
    ],
  };
}

export function reconciliationSheet(rows: GstReconciliationRow[], currency: string): ExportSheet<GstReconciliationRow> {
  return {
    sheetName: "Reconciliation",
    rows,
    columns: [
      { key: "line", header: "Line", getValue: (r) => r.label },
      money("books", "Per books (ledger)", (r: GstReconciliationRow) => r.perBooks, currency),
      money("return", "Per return (registers)", (r: GstReconciliationRow) => r.perReturn, currency),
      money("difference", "Difference", (r: GstReconciliationRow) => r.difference, currency),
      { key: "agrees", header: "Agrees", type: "boolean", getValue: (r) => r.agrees },
    ],
  };
}
