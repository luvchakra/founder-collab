/** DISC-OFFER-P0-08.2: "Existing Relationship Detection" -- the doc's own exact six-way
 * classification, checked *before* a Discovery handoff creates a new CRM lead, so a
 * founder can see whether they're about to duplicate a relationship this business
 * already has rather than finding out afterward. */
export type RelationshipStatus =
  | "new_prospect"
  | "existing_lead"
  | "existing_customer"
  | "existing_opportunity"
  | "existing_contact"
  | "potential_duplicate";

export const RELATIONSHIP_STATUS_LABEL: Record<RelationshipStatus, string> = {
  new_prospect: "New Prospect",
  existing_lead: "Existing Lead",
  existing_customer: "Existing Customer",
  existing_opportunity: "Existing CRM Opportunity",
  existing_contact: "Existing Contact",
  potential_duplicate: "Potential Duplicate",
};

export type RelationshipMatch = {
  status: RelationshipStatus;
  matchedPartyId: string | null;
  matchedPartyName: string | null;
  /** Plain factual explanation of why this status was chosen -- "prevent duplicate
   * party/relationship creation" needs the founder to understand *what* would be
   * duplicated, not just a bare label. */
  detail: string | null;
};
