/** Purchase register (inward supplies, for GSTR-2B reconciliation / GSTR-3B) and sales
 * register (outward supplies, for GSTR-1) for a given period -- ported from
 * stockpilot-ai-ops's gst-filing.tsx, computed here from `core.documents`/
 * `core.document_lines` directly (mechanism 1 of the platform's three legal
 * cross-module data paths: "read shared data from core directly" -- GST Filing needs
 * inventory-sourced purchase orders/sales invoices/credit notes, but core.documents is
 * core-owned shared data, not module-inventory's own package, so reading it here is not
 * a cross-module import). */

export type GstinRisk = "none" | "missing" | "invalid";

export type SupplierRegisterRow = {
  name: string;
  gstin: string | null;
  taxableValue: number;
  tax: number;
  risk: GstinRisk;
};

export type HsnRegisterRow = { hsn: string; taxableValue: number; tax: number };

export type PurchaseRegister = {
  poCount: number;
  /** COMPLY-P0-07.4 (Return Drill-Down): every purchase-order document id behind
   * `taxableValue`/`cgst`/`sgst`/`igst` above -- added so GSTR-3B/GSTR-9's own ITC section
   * (`lib/returns/gstr3b`, `lib/returns/gstr9`) can trace its own provisional, own-books
   * ITC total back to real source transactions, per that story's own requirement. Additive
   * only -- every existing consumer of `PurchaseRegister` (`gst-filing-view.tsx`,
   * `lib/dashboard/queries.ts`) is unaffected. */
  poIds: string[];
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  bySupplier: SupplierRegisterRow[];
  byHsn: HsnRegisterRow[];
  csvRows: {
    po_number: string;
    order_date: string;
    supplier_name: string;
    supplier_gstin: string | null;
    subtotal: number;
    cgst: number;
    sgst: number;
    igst: number;
    gstinStatus: string;
  }[];
};

export type B2BInvoiceRow = {
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  gstin: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
};

export type B2CRegisterRow = { state: string; taxableValue: number; tax: number };

export type SalesCreditNoteRow = {
  id: string;
  credit_note_number: string;
  credit_note_date: string;
  against_invoice_number: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
};

export type SalesRegister = {
  invoiceCount: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  missingGstinCount: number;
  invalidGstinCount: number;
  b2b: B2BInvoiceRow[];
  b2c: B2CRegisterRow[];
  byHsn: HsnRegisterRow[];
  creditNotes: SalesCreditNoteRow[];
  creditTaxableValue: number;
  creditTax: number;
  netTaxableValue: number;
  netTax: number;
};

export type BusinessGstFilingProfile = {
  gstin: string | null;
  gst_registration_type: string;
};
