export type AddressKind = "billing" | "shipping" | "service";
export type GstRegistrationType = "regular" | "composition" | "unregistered";

export interface Address {
  id: string;
  business_id: string;
  party_id: string;
  kind: AddressKind;
  is_primary: boolean;
  formatted: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface TaxIdentity {
  party_id: string;
  business_id: string;
  gstin: string | null;
  state: string | null;
  gst_registration_type: GstRegistrationType;
  created_at: string;
  updated_at: string;
}
