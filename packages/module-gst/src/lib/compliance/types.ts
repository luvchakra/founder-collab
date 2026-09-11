/** `gst.compliance_profiles` row shape -- see that migration's own docstring for why
 * this table exists and what it deliberately does not yet do (registration_id has no FK
 * target until COMPLY-P0-02.1/04.1 create `gst.tax_registrations`). */
export type ComplianceProfile = {
  business_id: string;
  country: string;
  regime: string;
  registration_id: string | null;
  created_at: string;
  updated_at: string;
};
