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
  /** The `core.items` row discovery's own product mirror resolved for this prospect's
   * product (item #3 of a cross-module UX pass), if one exists -- when given, the new
   * opportunity's estimate is pre-seeded with one charge line for it instead of starting
   * empty. */
  itemId?: string | null;
};

/** One row of a party's recent job history -- what the Customer 360 panel
 * (docs/design/crm-module-design.md Part B, B1) shows for "upcoming/recent jobs,
 * technician assigned, invoice status" without CRM needing to know fsm's own schema. */
export type ContractJobSummary = {
  id: string;
  number: string | null;
  status: string;
  description: string | null;
  scheduledAt: string | null;
  createdAt: string;
};

/** CRM-11.1's "Create FSM Quote from Opportunity" -- everything the CRM opportunity
 * detail page already has in hand: which of its own rows this quote is for
 * (`crmOpportunityId`, the idempotency key), who it's for, and the line items to seed
 * the estimate with (CRM-10.1's own `crm.product_interest` rows, resolved to real
 * `core.items`). */
export type CreateFsmQuoteInput = {
  crmOpportunityId: string;
  partyId: string;
  description?: string | null;
  lineItems: { itemId: string; quantity: number; taxable: boolean }[];
};

/** CRM-11.2's "Quote Status Projection" + CRM-11.4's job status, read live off the FSM
 * opportunity CRM-11.1 created -- never stored in CRM, so this is always current.
 * `estimateStatus` is FSM's own real values (`draft`/`sent`/`viewed`/`approved`/
 * `declined`) -- FSM has no `expired` state, matching CRM-11.2's own "where available"
 * wording rather than inventing one FSM doesn't have. */
export type FsmQuoteStatus = {
  fsmOpportunityId: string;
  opportunityStatus: string;
  estimateId: string | null;
  estimateStatus: string | null;
  jobId: string | null;
  jobStatus: string | null;
};
