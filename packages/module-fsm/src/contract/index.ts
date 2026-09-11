import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { hasModule } from "@cofounderai/core/licensing/queries";
import { getDocumentBalance } from "@cofounderai/core/payments/queries";
import { inr, num } from "@cofounderai/core/lib/format";
import { createClient } from "../db/server";
import { getDispatcherDashboard } from "../lib/dashboard/queries";
import { addChargeLine, approveEstimateInternal, getOrCreateEstimate } from "../lib/estimates/mutations";
import type { ContractJobSummary, ContractResult, CreateFsmQuoteInput, CreateOpportunityFromProspectInput, FsmQuoteFunnelCounts, FsmQuoteStatus, ProspectHandoffStatus } from "./types";
import type { Opportunity } from "../lib/opportunities/types";
import type { ShellAlert } from "@cofounderai/core/shell/types";

/**
 * module-fsm's public API surface (00-MASTER-PLAN.md §6 mechanism 2) -- the ONLY thing
 * another module may import from this package (CLAUDE.md's architecture rule #3,
 * CI-enforced by lint:boundaries). Every function here runs as the calling user through
 * the normal RLS-scoped client, same as module-inventory's own contract -- there's no
 * privileged path for a cross-module call.
 */

async function coreClient() {
  return createCoreClient({ schema: "core" });
}

async function requireLicensed(businessId: string): Promise<"MODULE_NOT_LICENSED" | null> {
  const licensed = await hasModule(businessId, "fsm");
  return licensed ? null : "MODULE_NOT_LICENSED";
}

/** The discovery→FSM handoff's own backlink (F-13, PRD §6 point 5) -- `module-discovery`'s
 * prospect detail page calls this to show "opportunity #123 / job #456 / invoice status"
 * once a won prospect has produced an opportunity. Returns `NOT_FOUND` (a normal result,
 * not an error) for a prospect that hasn't won yet, or whose `prospect.won` event is
 * still parked awaiting an `fsm` license. */
export async function getHandoffStatusForProspect(businessId: string, prospectId: string): Promise<ContractResult<ProspectHandoffStatus>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const fsm = await createClient();
  const { data: opportunity, error: oppError } = await fsm
    .from("opportunities")
    .select("id, status, converted_job_id")
    .eq("business_id", businessId)
    .eq("source", "discovery")
    .eq("source_prospect_id", prospectId)
    .maybeSingle();
  if (oppError) return { ok: false, error: oppError.message };
  if (!opportunity) return { ok: false, error: "NOT_FOUND" };

  let jobStatus: string | null = null;
  let invoiceNumber: string | null = null;
  let invoiceStatus: string | null = null;
  let invoiceBalanceAmount: number | null = null;

  if (opportunity.converted_job_id) {
    const { data: job, error: jobError } = await fsm.from("jobs").select("status").eq("id", opportunity.converted_job_id).maybeSingle();
    if (jobError) return { ok: false, error: jobError.message };
    jobStatus = job?.status ?? null;

    const core = await coreClient();
    const { data: invoice, error: invoiceError } = await core
      .from("documents")
      .select("id, number, status")
      .eq("business_id", businessId)
      .eq("doc_type", "invoice")
      .eq("source_module", "fsm")
      .contains("source_ref", { job_id: opportunity.converted_job_id })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (invoiceError) return { ok: false, error: invoiceError.message };
    if (invoice) {
      invoiceNumber = invoice.number;
      invoiceStatus = invoice.status;
      const balance = await getDocumentBalance(invoice.id);
      invoiceBalanceAmount = balance?.balance_amount ?? null;
    }
  }

  return {
    ok: true,
    data: {
      opportunityId: opportunity.id,
      opportunityStatus: opportunity.status,
      jobId: opportunity.converted_job_id ?? null,
      jobStatus,
      invoiceNumber,
      invoiceStatus,
      invoiceBalanceAmount,
    },
  };
}

/**
 * The manual half of the discovery->FSM handoff -- `module-fsm/src/events/handlers.ts`'s
 * own `prospect.won` consumer already creates this same row automatically (async, on the
 * next drain, and only once `fsm` is licensed), but the Conversions page wants an
 * explicit "Create opportunity" action too, for a founder who doesn't want to wait for
 * the next drain or wants the row to exist right now to click into. Runs through the
 * normal RLS-scoped client (a real signed-in staff member, unlike the event consumer's
 * admin client with no session) -- `created_by` is left off the insert entirely so
 * `fsm.opportunities`'s own `default auth.uid()` fills it in, same as the plain manual
 * `createOpportunity()` in lib/opportunities/mutations.ts does.
 *
 * Idempotent by the same `(source='discovery', source_prospect_id)` dedup key the event
 * consumer uses, so this is always safe to call even if the automatic handoff already
 * ran (or races with it) -- both return the same opportunity id rather than creating a
 * second one.
 */
export async function createOpportunityFromWonProspect(
  businessId: string,
  input: CreateOpportunityFromProspectInput,
): Promise<ContractResult<{ opportunityId: string }>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const fsm = await createClient();
  const { data: existing, error: existingError } = await fsm
    .from("opportunities")
    .select("id")
    .eq("business_id", businessId)
    .eq("source", "discovery")
    .eq("source_prospect_id", input.prospectId)
    .maybeSingle();
  if (existingError) return { ok: false, error: existingError.message };
  if (existing) return { ok: true, data: { opportunityId: existing.id } };

  const { data, error } = await fsm
    .from("opportunities")
    .insert({
      business_id: businessId,
      party_id: input.partyId,
      description: input.description || `From discovery: ${input.companyName}`,
      scope_of_work: input.description || null,
      source: "discovery",
      source_prospect_id: input.prospectId,
      source_workspace_id: input.workspaceId ?? null,
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };

  // Item #3 of a cross-module UX pass: pre-seed the new estimate with one charge line
  // for the product this prospect was actually won for, when discovery resolved one
  // (lib/tenancy/mutations.ts#createProduct's own core.items mirror) -- so clicking
  // through from Discovery's Conversions page lands on a usable draft, not an empty
  // "No charges added yet" estimate the founder has to build from scratch. Best-effort:
  // a permission gap on `estimates.edit` (this contract otherwise only required
  // `fsm`'s license, not that specific permission) must not fail the opportunity
  // creation that already succeeded above.
  if (input.itemId) {
    try {
      const estimateId = await getOrCreateEstimate(businessId, data as Opportunity);
      await addChargeLine(businessId, estimateId, { itemId: input.itemId, quantity: 1, taxable: true });
    } catch (err) {
      console.error("[fsm/contract] pre-seeding estimate charge line failed:", err);
    }
  }

  return { ok: true, data: { opportunityId: data.id } };
}

/**
 * Recent jobs for one party (docs/design/crm-module-design.md Part B, B1's Customer
 * 360 panel) -- "upcoming/recent jobs, technician assigned, invoice status." Assigned
 * technician and invoice status aren't summarized here (they'd need the job's own
 * assignment/invoice lookups this contract doesn't otherwise expose yet); scheduledAt
 * is the job's most recent fsm.events row, a reasonable single "when" for a summary
 * panel even though a job can have more than one calendar event over its life.
 */
export async function listRecentJobsForParty(
  businessId: string,
  partyId: string,
  limit = 10,
): Promise<ContractResult<ContractJobSummary[]>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const fsm = await createClient();
  const { data: jobs, error: jobsError } = await fsm
    .from("jobs")
    .select("id, number, status, description, created_at")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (jobsError) return { ok: false, error: jobsError.message };
  if (jobs.length === 0) return { ok: true, data: [] };

  const jobIds = jobs.map((j) => j.id);
  const { data: events, error: eventsError } = await fsm
    .from("events")
    .select("job_id, starts_at")
    .in("job_id", jobIds)
    .order("starts_at", { ascending: false });
  if (eventsError) return { ok: false, error: eventsError.message };

  const latestStartsAtByJob = new Map<string, string>();
  for (const event of events) {
    if (event.job_id && !latestStartsAtByJob.has(event.job_id)) {
      latestStartsAtByJob.set(event.job_id, event.starts_at);
    }
  }

  return {
    ok: true,
    data: jobs.map((j) => ({
      id: j.id,
      number: j.number,
      status: j.status,
      description: j.description,
      scheduledAt: latestStartsAtByJob.get(j.id) ?? null,
      createdAt: j.created_at,
    })),
  };
}

/**
 * A short plain-language snapshot of this business's field-service queue -- what the
 * AI assistant grounds itself in when the founder is looking at Service, or has opted
 * into "consult all modules." Reuses getDispatcherDashboard() (the /fsm dashboard's own
 * read model) rather than a second aggregation.
 */
export async function getChatContextSummary(businessId: string): Promise<ContractResult<string>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const dashboard = await getDispatcherDashboard(businessId, "today");
  const openJobs = dashboard.unassignedJobs.length + dashboard.jobsInProgress.length;
  const lines = [
    `Service: ${num.format(dashboard.todaysEvents.length)} event(s) scheduled today, ${num.format(dashboard.unassignedJobs.length)} unassigned job(s), ${num.format(dashboard.jobsInProgress.length)} job(s) in progress.`,
    dashboard.overdueInvoices.length > 0
      ? `${num.format(dashboard.overdueInvoices.length)} overdue invoice(s), totaling ${inr.format(dashboard.overdueInvoices.reduce((s, i) => s + i.balance_amount, 0))}.`
      : "No overdue invoices.",
    dashboard.estimatesAwaitingResponse.length > 0
      ? `${num.format(dashboard.estimatesAwaitingResponse.length)} estimate(s) awaiting a customer response.`
      : "No estimates waiting on a customer.",
  ];
  if (openJobs === 0) lines.push("No open jobs right now.");
  return { ok: true, data: lines.join(" ") };
}

/** Topbar alert-bell entries for this business's field-service queue -- see
 * module-inventory/contract/index.ts#getAlerts's own doc comment for why `ShellAlert`
 * is core-owned rather than discovery-owned. Reuses the same getDispatcherDashboard()
 * read model getChatContextSummary() above already does. */
export async function getAlerts(businessId: string): Promise<ContractResult<ShellAlert[]>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const dashboard = await getDispatcherDashboard(businessId, "today");
  const basePath = `/dashboard/businesses/${businessId}/fsm`;
  const alerts: Omit<ShellAlert, "businessId">[] = [];

  if (dashboard.overdueInvoices.length > 0) {
    alerts.push({
      id: `fsm-overdue-invoices-${businessId}`,
      severity: "warning",
      message: `${num.format(dashboard.overdueInvoices.length)} overdue invoice(s), totaling ${inr.format(dashboard.overdueInvoices.reduce((s, i) => s + i.balance_amount, 0))}.`,
      href: `${basePath}/invoices`,
    });
  }

  if (dashboard.unassignedJobs.length > 0) {
    alerts.push({
      id: `fsm-unassigned-jobs-${businessId}`,
      severity: "info",
      message: `${num.format(dashboard.unassignedJobs.length)} unassigned job(s).`,
      href: `${basePath}/jobs`,
    });
  }

  if (dashboard.estimatesAwaitingResponse.length > 0) {
    alerts.push({
      id: `fsm-estimates-awaiting-${businessId}`,
      severity: "info",
      message: `${num.format(dashboard.estimatesAwaitingResponse.length)} estimate(s) awaiting a customer response.`,
      href: `${basePath}/opportunities`,
    });
  }

  return { ok: true, data: alerts.map((a) => ({ ...a, businessId })) };
}

/**
 * CRM-11.1's "Create FSM Quote from Opportunity" -- the CRM-shaped sibling of
 * `createOpportunityFromWonProspect()` above, same idempotent-by-source shape (`source:
 * 'crm'`/`source_reference` instead of `'discovery'`/`source_prospect_id`) but a real
 * line-item list instead of that function's single best-effort pre-seeded charge.
 * "Customer/product context is passed through FSM public contract" -- `partyId` and
 * every line item cross this one call, nothing is looked up FSM-side from a CRM id it
 * has no access to. "No duplicated quote master in CRM" -- returns the estimate id so
 * CRM can store *that* pointer (via `fsm_opportunity_id`, the estimate itself is always
 * re-resolved through `getFsmQuoteStatus()` below), never a copy of the estimate's own
 * line items or totals.
 */
export async function createFsmQuoteFromCrmOpportunity(businessId: string, input: CreateFsmQuoteInput): Promise<ContractResult<{ fsmOpportunityId: string; estimateId: string }>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const fsm = await createClient();
  const { data: existing, error: existingError } = await fsm
    .from("opportunities")
    .select("id")
    .eq("business_id", businessId)
    .eq("source", "crm")
    .eq("source_reference", input.crmOpportunityId)
    .maybeSingle();
  if (existingError) return { ok: false, error: existingError.message };

  let fsmOpportunityId: string;
  if (existing) {
    fsmOpportunityId = existing.id;
  } else {
    const { data, error } = await fsm
      .from("opportunities")
      .insert({
        business_id: businessId,
        party_id: input.partyId,
        description: input.description || null,
        source: "crm",
        source_reference: input.crmOpportunityId,
      })
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message };
    fsmOpportunityId = data.id;
  }

  try {
    const { data: opportunity, error: oppError } = await fsm.from("opportunities").select("*").eq("id", fsmOpportunityId).single();
    if (oppError) throw oppError;

    const estimateId = await getOrCreateEstimate(businessId, opportunity as Opportunity);
    for (const line of input.lineItems) {
      await addChargeLine(businessId, estimateId, { itemId: line.itemId, quantity: line.quantity, taxable: line.taxable });
    }
    return { ok: true, data: { fsmOpportunityId, estimateId } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * CRM-11.2's "Quote Status Projection" and CRM-11.4's job status, both read live off
 * the one FSM opportunity `createFsmQuoteFromCrmOpportunity()` created -- CRM stores
 * only `fsm_opportunity_id`, everything else here is fetched fresh on every call, same
 * "no stock ledger copied into CRM" discipline CRM-10.2's `getTotalAvailability()`
 * already established for a different module.
 */
export async function getFsmQuoteStatus(businessId: string, fsmOpportunityId: string): Promise<ContractResult<FsmQuoteStatus>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const fsm = await createClient();
  const { data: opportunity, error: oppError } = await fsm
    .from("opportunities")
    .select("id, status, converted_job_id")
    .eq("business_id", businessId)
    .eq("id", fsmOpportunityId)
    .maybeSingle();
  if (oppError) return { ok: false, error: oppError.message };
  if (!opportunity) return { ok: false, error: "NOT_FOUND" };

  const core = await coreClient();
  const { data: estimate, error: estimateError } = await core
    .from("documents")
    .select("id, status")
    .eq("business_id", businessId)
    .eq("doc_type", "estimate")
    .eq("source_module", "fsm")
    .contains("source_ref", { opportunity_id: fsmOpportunityId })
    .maybeSingle();
  if (estimateError) return { ok: false, error: estimateError.message };

  let jobStatus: string | null = null;
  if (opportunity.converted_job_id) {
    const { data: job, error: jobError } = await fsm.from("jobs").select("status").eq("id", opportunity.converted_job_id).maybeSingle();
    if (jobError) return { ok: false, error: jobError.message };
    jobStatus = job?.status ?? null;
  }

  return {
    ok: true,
    data: {
      fsmOpportunityId: opportunity.id,
      opportunityStatus: opportunity.status,
      estimateId: estimate?.id ?? null,
      estimateStatus: estimate?.status ?? null,
      jobId: opportunity.converted_job_id ?? null,
      jobStatus,
    },
  };
}

/**
 * CRM-11.3's "Accepted Quote -> Job": "User action: Create Job in FSM. No automatic job
 * creation... unless an explicit future business rule enables it." Wraps
 * `approveEstimateInternal()` -- FSM's own model already fuses "mark this estimate
 * accepted" and "create the job it becomes" into one staff action (its own doc comment:
 * "same effect as a customer approving on the public page... triggered from the
 * opportunity detail page by someone who took a verbal/phone approval"), which is
 * exactly this button's real-world case: a customer told the founder "yes" over
 * WhatsApp, and this is how that gets formalized into FSM without the founder switching
 * modules. Idempotent (that function's own behavior): clicking it again on an
 * already-approved quote returns the same job rather than minting a second one.
 */
export async function acceptFsmQuoteAndCreateJob(businessId: string, fsmOpportunityId: string, estimateId: string): Promise<ContractResult<{ jobId: string }>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  try {
    const result = await approveEstimateInternal(businessId, fsmOpportunityId, estimateId);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * CRM-14.5's "CRM -> FSM Funnel" -- the four stages that need FSM's own data
 * (`opportunity`/`quote` are plain `crm.opportunity` counts, computed CRM-side with no
 * contract call needed). `accepted`/`job` share one query (`converted_job_id is not
 * null` -- see this file's own `FsmQuoteFunnelCounts` doc comment for why they're the
 * same underlying set). `revenue` sums the `total_amount` of each completed job's own
 * invoice, same `core.documents`/`source_ref.job_id` shape `getInvoiceForJob()` already
 * reads -- "revenue where available" (the backlog's own wording) is exactly this: a job
 * with no invoice yet contributes 0, not an error.
 */
export async function getCrmQuoteFunnelCounts(businessId: string): Promise<ContractResult<FsmQuoteFunnelCounts>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const fsm = await createClient();
  const { data: opportunities, error: oppError } = await fsm
    .from("opportunities")
    .select("converted_job_id")
    .eq("business_id", businessId)
    .eq("source", "crm");
  if (oppError) return { ok: false, error: oppError.message };

  const jobIds = [...new Set(opportunities.map((o) => o.converted_job_id).filter((id): id is string => Boolean(id)))];
  const accepted = jobIds.length;
  const job = jobIds.length;

  let completed = 0;
  let revenue = 0;
  if (jobIds.length > 0) {
    const { data: jobs, error: jobsError } = await fsm.from("jobs").select("id, status").in("id", jobIds);
    if (jobsError) return { ok: false, error: jobsError.message };
    const completedJobIds = new Set(jobs.filter((j) => j.status === "completed").map((j) => j.id));
    completed = completedJobIds.size;

    if (completedJobIds.size > 0) {
      const core = await coreClient();
      const { data: invoices, error: invoicesError } = await core
        .from("documents")
        .select("total_amount, source_ref")
        .eq("business_id", businessId)
        .eq("doc_type", "invoice")
        .eq("source_module", "fsm");
      if (invoicesError) return { ok: false, error: invoicesError.message };
      revenue = invoices
        .filter((inv) => completedJobIds.has((inv.source_ref as { job_id?: string })?.job_id ?? ""))
        .reduce((sum, inv) => sum + Number(inv.total_amount), 0);
    }
  }

  return { ok: true, data: { accepted, job, completed, revenue } };
}
