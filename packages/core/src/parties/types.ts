export type PartyKind = "person" | "company";
export type PartyRole = "prospect" | "customer" | "supplier" | "vendor" | "lead";

export interface Party {
  id: string;
  business_id: string;
  kind: PartyKind;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartyContact {
  id: string;
  business_id: string;
  party_id: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  is_primary: boolean;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface PartySupplierAttrs {
  party_id: string;
  business_id: string;
  code: string | null;
  payment_terms: string | null;
  lead_time_days: number;
  rating: number;
  created_at: string;
  updated_at: string;
}
