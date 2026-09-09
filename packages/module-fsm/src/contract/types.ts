/**
 * Same result shape as every other module's `contract/index.ts` (ADR-10) -- a caller
 * not licensed for `fsm` gets `{ ok: false, error: "MODULE_NOT_LICENSED" }` back as a
 * normal value to branch on, not an exception.
 */
export type ContractResult<T> = { ok: true; data: T } | { ok: false; error: "MODULE_NOT_LICENSED" | "NOT_FOUND" | string };

/** The discovery→FSM handoff's own backlink (F-13, PRD §6 point 5): "the prospect page
 * shows opportunity #123 / job #456 / invoice status when FSM is licensed." */
export type ProspectHandoffStatus = {
  opportunityId: string;
  opportunityStatus: string;
  jobId: string | null;
  jobStatus: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  invoiceBalanceAmount: number | null;
};

/** Input for `createOpportunityFromWonProspect()` -- everything about the won prospect
 * the Conversions page's own list row already has in hand, no extra lookup needed. */
export type CreateOpportunityFromProspectInput = {
  prospectId: string;
  partyId: string;
  companyName: string;
  description?: string | null;
  workspaceId?: string | null;
};
