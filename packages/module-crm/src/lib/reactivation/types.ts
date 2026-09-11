/** CRM-12.7's "Reactivation Opportunities" -- one row per detected signal (a single
 * party can appear more than once, once per signal that matched). `suggestedAction` is
 * text for a human to read and decide on -- "create a suggested action rather than an
 * automatic campaign" (the backlog's own wording): nothing here sends anything by
 * itself. */
export type ReactivationOpportunity = {
  partyId: string;
  partyName: string;
  reason: "inactive" | "renewed_lead" | "restocked_interest" | "recurring_service";
  detail: string;
  suggestedAction: string;
};

export const REACTIVATION_REASON_LABEL: Record<ReactivationOpportunity["reason"], string> = {
  inactive: "Previously active, now inactive",
  renewed_lead: "Old lead, renewed signal",
  restocked_interest: "Interested item back in stock",
  recurring_service: "Recurring service likely due",
};
