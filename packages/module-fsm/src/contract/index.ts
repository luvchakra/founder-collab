import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { hasModule } from "@cofounderai/core/licensing/queries";
import { getDocumentBalance } from "@cofounderai/core/payments/queries";
import { createClient } from "../db/server";
import type { ContractResult, ProspectHandoffStatus } from "./types";

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
