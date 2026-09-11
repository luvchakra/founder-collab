/** crm.lead row shape (CRM-01.2). Full lifecycle management (status transitions beyond
 * creation/conversion, owner reassignment, nurture states) is CRM-04.1's own story --
 * this type only carries what CRM-01.3's contract functions need today. */
export type LeadStatus =
  | "new"
  | "contacted"
  | "engaged"
  | "qualified"
  | "opportunity"
  | "won"
  | "lost"
  | "nurture"
  | "unresponsive"
  | "disqualified";

export type SourceChannel =
  | "discovery"
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "google"
  | "website"
  | "referral"
  | "manual"
  | "fsm"
  | "existing_customer"
  | "other";

export type Lead = {
  id: string;
  business_id: string;
  party_id: string;
  status: LeadStatus;
  source: SourceChannel;
  source_module: string | null;
  source_reference: string | null;
  owner_id: string | null;
  /** CRM-05.2. The one activity currently designated this lead's next action --
   * owner/due date are read from that crm.activity row, not duplicated here. */
  next_action_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateLeadInput = {
  partyId: string;
  source?: SourceChannel;
  sourceModule?: string | null;
  sourceReference?: string | null;
  ownerId?: string | null;
};
