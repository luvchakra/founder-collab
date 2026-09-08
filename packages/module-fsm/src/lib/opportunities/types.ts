export type OpportunityStatus = "new" | "estimate_scheduled" | "estimate_sent" | "won" | "lost";
export type OpportunitySource = "manual" | "contact_form" | "discovery" | "import" | "api";

export interface Opportunity {
  id: string;
  business_id: string;
  number: string | null;
  party_id: string;
  primary_contact_id: string | null;
  service_address_id: string | null;
  service_type_id: string | null;
  description: string | null;
  scope_of_work: string | null;
  source: OpportunitySource;
  source_prospect_id: string | null;
  status: OpportunityStatus;
  lost_reason: string | null;
  marketing_source_id: string | null;
  converted_job_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface OpportunityListItem extends Opportunity {
  party_name: string;
  service_type_name: string | null;
}

export interface CustomerOption {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface CreateOpportunityInput {
  /** Either an existing party, or `newCustomer` to create one inline -- exactly one of
   * these two is set. */
  partyId?: string;
  newCustomer?: { name: string; email?: string; phone?: string };
  serviceTypeId?: string | null;
  description?: string;
  scopeOfWork?: string;
}

export interface UpdateOpportunityInput {
  serviceTypeId?: string | null;
  description?: string | null;
  scopeOfWork?: string | null;
}
