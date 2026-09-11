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
  /** INT-01.3's "Journey State History" -- already-available timestamp columns, added
   * so a cross-module history view can place these state changes on a real timeline
   * instead of always sorting to "now" (the pattern `timeline/queries.ts`'s own
   * fsm.quote entry used before this field existed). */
  fsmOpportunityCreatedAt: string;
  jobCreatedAt: string | null;
  jobCompletedAt: string | null;
};

/** INT-04.2's "Create FSM Assessment Request" -- everything CRM already has in hand:
 * which of its own opportunities this is for (`crmOpportunityId`, the idempotency key,
 * same role `CreateFsmQuoteInput.crmOpportunityId` plays), who/where it's for, and the
 * context to transfer once at creation time (never a live pointer back into CRM or
 * Discovery -- Rule 3, "a handoff transfers context, not ownership"). */
export type CreateFsmAssessmentInput = {
  crmOpportunityId: string;
  partyId: string;
  contactId?: string | null;
  serviceAddressId?: string | null;
  kind: "remote" | "on_site" | "technical";
  requestedScope?: string | null;
  customerNotes?: string | null;
  discoveryContext?: string | null;
  preferredTiming?: string | null;
};

/** INT-04.2's "CRM stores reference/status only" projection, read live off the FSM
 * assessment `createFsmAssessmentFromCrmOpportunity()` created -- same discipline as
 * `FsmQuoteStatus` above. `outcome`/`outcomeNotes` are null until INT-04.3's own
 * `recordAssessmentOutcome()` sets them. */
export type FsmAssessmentStatus = {
  assessmentId: string;
  status: string;
  kind: string;
  outcome: string | null;
  outcomeNotes: string | null;
  createdAt: string;
  scheduledAt: string | null;
  completedAt: string | null;
};

/** CRM-14.5's "CRM -> FSM Funnel": `opportunity -> quote -> accepted -> job ->
 * completed -> revenue`. Only the last four stages need FSM's own data (the first two,
 * `opportunity`/`quote`, are plain counts off `crm.opportunity` -- `fsm_opportunity_id`
 * is already a column there, CRM-11.1's own bridge, so no contract call is needed to
 * know whether a quote exists). Scoped to `fsm.opportunities` rows with `source='crm'`
 * (that same bridge marker) -- FSM's own organically-created opportunities aren't part
 * of this funnel. `accepted` and `job` are the same underlying count: CRM-11.3 reuses
 * `approveEstimateInternal()`, which fuses "mark the estimate approved" and "create the
 * job" into one atomic action, so nothing in this schema can be accepted without also
 * becoming a job. Reported as two fields anyway since the backlog names them as
 * separate funnel stages -- an accurate reflection of how this platform's quote
 * acceptance actually works, not a bug. */
export type FsmQuoteFunnelCounts = {
  accepted: number;
  job: number;
  completed: number;
  revenue: number;
};

/** CRM-12.7's "Reactivation Opportunities" -- one signal, "completed service + likely
 * recurring need," needs FSM's own job-completion dates; the other three signals are
 * entirely CRM's own data. One row per completed job (not deduplicated to one per
 * party) -- the caller keeps only the most recent per party. */
export type CompletedJobForReactivation = {
  partyId: string;
  jobId: string;
  completedAt: string;
};
