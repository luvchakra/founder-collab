/** `/gst` (Compliance module)'s own dashboard read -- a compact "this month" snapshot,
 * one KPI/chart layer above the four setup/working pages (Profile, e-Way Bill,
 * e-Invoicing, Filing) each of which already has its own fuller view. */
export type ComplianceDashboard = {
  gstin: string | null;
  period: string;
  payableThisMonth: number;
  collectedThisMonth: number;
  cgstCollected: number;
  sgstCollected: number;
  igstCollected: number;
  einvoicesThisMonth: number;
  /** Suppliers (purchases) + customers (sales) this month with a missing/invalid
   * GSTIN -- an input-tax-credit / filing-accuracy risk either way. */
  riskCount: number;
  ewayBillConfigured: boolean;
  einvoiceConfigured: boolean;
};
