import type { EstimateLine } from "../estimates/types";

export type { EstimateLine as InvoiceLine, AddChargeLineInput, UpdateChargeLineInput, ChargeableItemOption } from "../estimates/types";

export type InvoiceStatus = "draft" | "issued" | "sent" | "viewed" | "partially_paid" | "paid" | "voided";

export interface Invoice {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  doc_date: string;
  due_date: string | null;
  job_id: string;
  party_id: string;
  subtotal: number;
  discount_amount: number;
  shipping_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  created_at: string;
  updated_at: string;
}

export interface InvoiceListItem extends Invoice {
  party_name: string;
  job_number: string | null;
  balance_amount: number;
}

/** Everything the public, unauthenticated `/p/i/[token]` page needs -- resolved
 * entirely through the token, same pattern as `PublicEstimateView` (F-4). No "pay
 * online" action here: an online payment link is explicitly a SHOULD/LATER item (PRD
 * §2 Invoicing row) -- this is a read-only preview, matching PRD §1.4's own "Preview
 * shows the exact customer-facing web page." */
export interface PublicInvoiceView {
  businessName: string;
  businessWebsite: string | null;
  partyName: string;
  invoice: Invoice;
  lines: EstimateLine[];
  balanceAmount: number;
}
