export type ItemKind = "good" | "service" | "labour" | "part" | "expense";

export interface ItemCategory {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: string;
  business_id: string;
  kind: ItemKind;
  sku: string | null;
  name: string;
  description: string | null;
  category_id: string | null;
  supplier_party_id: string | null;
  unit: string;
  hsn_code: string | null;
  tax_rate: number;
  cost_price: number;
  selling_price: number;
  image_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ItemInventoryAttrs {
  item_id: string;
  business_id: string;
  reorder_point: number;
  reorder_quantity: number;
  barcode: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaxRate {
  id: string;
  rate: number;
  label: string;
  created_at: string;
}
