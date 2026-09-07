/**
 * Mirrors `inventory.sales_invoices`/`inventory.sales_invoice_items`/
 * `inventory.credit_notes` -- compat views (SP-4) over `core.documents`/
 * `core.document_lines`, `org_id`-keyed like `products`/`customers`.
 */
export type PaymentStatus = "unpaid" | "partial" | "paid";

export type SalesInvoice = {
  id: string;
  org_id: string;
  sales_order_id: string;
  customer_id: string;
  invoice_number: string;
  invoice_date: string;
  customer_gstin: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  subtotal: number;
  discount_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  shipping_amount: number;
  total_amount: number;
  payment_status: PaymentStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  customer_name: string;
  so_number: string;
};

export type SalesInvoiceItem = {
  id: string;
  org_id: string;
  invoice_id: string;
  product_id: string;
  hsn_code: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  created_at: string;
  item_name: string;
  item_sku: string | null;
};

export type CreditNote = {
  id: string;
  org_id: string;
  sales_invoice_id: string;
  credit_note_number: string;
  credit_note_date: string;
  reason: string | null;
  is_full: boolean;
  subtotal: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  created_by: string;
  created_at: string;
  sales_return_id: string | null;
};

export type EligibleSalesOrder = { id: string; so_number: string; status: string; customer_name: string };

// A sales order is invoiceable once demand is confirmed and stock has started moving
// against it -- matches generate_sales_invoice()'s own check.
export const INVOICEABLE_SO_STATUSES = new Set(["confirmed", "processing", "packed", "shipped", "delivered"]);

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partial: "Partially paid",
  paid: "Paid",
};
