export type DocType =
  | "estimate"
  | "sales_order"
  | "invoice"
  | "credit_note"
  | "debit_note"
  | "proforma_invoice"
  | "purchase_order"
  | "sales_return";

export interface Document {
  id: string;
  business_id: string;
  doc_type: DocType;
  source_module: string;
  source_ref: Record<string, unknown>;
  party_id: string;
  number: string | null;
  status: string;
  payment_status: string | null;
  doc_date: string;
  due_date: string | null;
  expected_date: string | null;
  reason: string | null;
  notes: string | null;
  subtotal: number;
  discount_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  shipping_amount: number;
  total_amount: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentLine {
  id: string;
  document_id: string;
  business_id: string;
  item_id: string;
  description: string | null;
  quantity: number;
  received_quantity: number;
  unit_price: number;
  hsn_code: string | null;
  tax_rate: number;
  taxable: boolean;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  sort_order: number;
  created_at: string;
}
