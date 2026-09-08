export type EstimateStatus = "draft" | "sent" | "viewed" | "approved" | "declined";

export interface Estimate {
  id: string;
  number: string | null;
  status: string;
  doc_date: string;
  opportunity_id: string;
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

export interface EstimateLine {
  id: string;
  item_id: string;
  item_name: string;
  item_sku: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  taxable: boolean;
  hsn_code: string | null;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  job_charge_type_id: string | null;
  job_charge_type_name: string | null;
  sort_order: number;
}

export interface ChargeableItemOption {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  tax_rate: number;
  selling_price: number;
}

export interface AddChargeLineInput {
  /** Either an existing catalog item, or `adHoc` to create one inline (PRD §2: "charge
   * lines from core.items, ad-hoc lines"). */
  itemId?: string;
  adHoc?: { name: string; unitPrice: number; taxRate: number };
  quantity: number;
  taxable: boolean;
  jobChargeTypeId?: string | null;
}

export interface UpdateChargeLineInput {
  quantity?: number;
  unitPrice?: number;
  taxable?: boolean;
  jobChargeTypeId?: string | null;
}
