/** INT-04.2's "Create FSM Assessment Request" -- a pre-quote site-visit/diagnostic,
 * distinct from `fsm.opportunities` (which represents the commercial quote pipeline
 * itself). FSM owns this entity's full lifecycle; CRM stores only the one pointer
 * (`crm.opportunity.assessment_request_id`) and always reads live through the contract
 * (`getAssessmentStatus()`), never a copy. */
export type AssessmentKind = "remote" | "on_site" | "technical";

export type AssessmentStatus = "requested" | "scheduled" | "completed" | "not_feasible" | "cancelled";

/** INT-04.3's own structured outcome vocabulary -- set once, by an explicit human
 * action (`recordAssessmentOutcome()`), never inferred. */
export type AssessmentOutcome = "scope_confirmed" | "scope_changed" | "additional_work_identified" | "not_feasible" | "customer_unavailable" | "follow_up_required";

export type Assessment = {
  id: string;
  business_id: string;
  party_id: string;
  primary_contact_id: string | null;
  service_address_id: string | null;
  source: string;
  source_reference: string | null;
  kind: AssessmentKind;
  requested_scope: string | null;
  customer_notes: string | null;
  discovery_context: string | null;
  preferred_timing: string | null;
  status: AssessmentStatus;
  outcome: AssessmentOutcome | null;
  outcome_notes: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type CreateAssessmentInput = {
  partyId: string;
  contactId?: string | null;
  serviceAddressId?: string | null;
  kind: AssessmentKind;
  requestedScope?: string | null;
  customerNotes?: string | null;
  discoveryContext?: string | null;
  preferredTiming?: string | null;
  /** The CRM opportunity that asked for this, for the dedup index only -- FSM never
   * reads this back to look anything up in CRM. */
  crmOpportunityId?: string | null;
};
