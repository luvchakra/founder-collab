/** `gst.tax_registrations` row shape -- see that migration's own docstring for why this
 * table exists (multi-registration, versioned nowhere near as heavily as tax rules --
 * a registration is a fact about the business, not a government rule) and what it
 * deliberately doesn't do yet (no jurisdiction validation -- COMPLY-P0-02.2). */
export type TaxRegistrationStatus = "active" | "cancelled" | "suspended";

export type TaxRegistration = {
  id: string;
  business_id: string;
  country: string;
  jurisdiction: string | null;
  regime: string;
  registration_number: string;
  registration_status: TaxRegistrationStatus;
  registered_from: string | null;
  registered_until: string | null;
  is_primary: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TaxRegistrationInput = {
  country: string;
  jurisdiction: string | null;
  regime: string;
  registrationNumber: string;
  isPrimary: boolean;
  metadata?: Record<string, unknown>;
};
