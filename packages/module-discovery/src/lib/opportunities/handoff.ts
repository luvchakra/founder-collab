import type { OpportunityStatus } from "./types";

/** DISC-OFFER-P0-08.3: "Handoff Status" -- the doc's own exact four states, distinct
 * from `OpportunityStatus`'s own `sent_to_crm` value: this is specifically about the
 * *handoff mechanics themselves* (has it been sent, did the attempt fail, does the
 * account already have a CRM footprint from elsewhere), not the opportunity's broader
 * lifecycle. */
export type HandoffStatus = "not_sent" | "sent_to_crm" | "already_in_crm" | "handoff_failed";

export const HANDOFF_STATUS_LABEL: Record<HandoffStatus, string> = {
  not_sent: "Not Sent",
  sent_to_crm: "Sent to CRM",
  already_in_crm: "Already in CRM",
  handoff_failed: "Handoff Failed",
};

export type HandoffStatusInput = {
  opportunityStatus: OpportunityStatus;
  /** Set by `recordOpportunityHandoffFailure` when a prior send attempt threw --
   * cleared by `setOpportunityStatus` on any subsequent status change. */
  handoffFailedAt: string | null;
  /** Whether this exact prospect already has a `crm.lead` on file (08.3's own
   * `getDiscoveryHandoffLead` contract call) -- true independent of whether *this*
   * opportunity is the one that sent it (a sibling opportunity for the same prospect
   * may have already done so, 05.1's "several opportunities per prospect"). */
  hasExistingCrmLead: boolean;
};

/**
 * DISC-OFFER-P0-08.3: deterministic, no AI call (CLAUDE.md dev principle #4/#5).
 * Priority order: this opportunity's own `sent_to_crm` status is the most authoritative
 * signal (it *is* the one that was sent); a recorded failure outranks a same-account
 * CRM footprint found elsewhere, since "retry" is only ever offered for a failure this
 * platform's own last attempt produced, not inferred from someone else's success;
 * otherwise an existing lead found under this same prospect reference means the account
 * is already in CRM even though *this* opportunity's own status hasn't caught up yet.
 */
export function computeHandoffStatus(input: HandoffStatusInput): HandoffStatus {
  if (input.opportunityStatus === "sent_to_crm") return "sent_to_crm";
  if (input.handoffFailedAt) return "handoff_failed";
  if (input.hasExistingCrmLead) return "already_in_crm";
  return "not_sent";
}
