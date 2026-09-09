import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { resolveCustomerPartyId } from "../opportunities/mutations";
import { getOrCreateInvoiceForJob } from "../invoices/mutations";
import { consumeJobParts, releaseJobParts, reserveJobParts } from "../inventory-integration/mutations";
import type { CreateJobInput, Job, UpdateJobInput } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** Jobs can be created directly (PRD §1.3), not only via an approved estimate (F-4's own
 * `createJobFromApprovedEstimate`) -- mints a real sequential number through the same
 * `core.next_number(business_id, 'job', 'JOB')` counter F-4 already uses, so numbers
 * never collide regardless of which path created the job. */
export async function createJob(businessId: string, input: CreateJobInput): Promise<string> {
  await requireModule(businessId, "fsm");
  const partyId = await resolveCustomerPartyId(businessId, input);

  const core = await coreClient();
  const { data: number, error: numberError } = await core.rpc("next_number", {
    p_business_id: businessId,
    p_scope: "job",
    p_prefix: "JOB",
  });
  if (numberError) throw numberError;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      business_id: businessId,
      number,
      party_id: partyId,
      service_type_id: input.serviceTypeId || null,
      description: input.description?.trim() || null,
      scope_of_work: input.scopeOfWork?.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateJob(id: string, businessId: string, patch: UpdateJobInput): Promise<void> {
  await requireModule(businessId, "fsm");
  const supabase = await createClient();
  const update: Record<string, unknown> = {};
  if ("serviceTypeId" in patch) update.service_type_id = patch.serviceTypeId;
  if ("description" in patch) update.description = patch.description;
  if ("scopeOfWork" in patch) update.scopeOfWork = patch.scopeOfWork;

  const { error } = await supabase.from("jobs").update(update).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
}

async function transition(id: string, businessId: string, fromStatuses: string[], patch: Record<string, unknown>): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("jobs").update(patch).eq("id", id).eq("business_id", businessId).in("status", fromStatuses).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("This job is no longer in a state that allows that action -- reload and try again.");
  }
}

/** `unscheduled -> scheduled` is documented by the PRD (§4) as happening automatically
 * on the job's first work event -- which doesn't exist until F-6 (Scheduling) creates
 * `fsm.events` rows. Exposed here anyway as a manual staff action so a job isn't
 * permanently stuck on the board's first column until F-6 lands (same pragmatic-corollary
 * reasoning F-2 already used for `reopenLostOpportunity`); F-6 will additionally drive
 * this transition for real once an event is actually created. */
export async function markJobScheduled(id: string, businessId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  await transition(id, businessId, ["unscheduled"], { status: "scheduled" });
  await reserveJobParts(businessId, id).catch(() => {});
}

/** `scheduled -> in_progress` (PRD §4: "start or first clock-in" -- clock-in is F-7's
 * own field-execution feature; this is the "start" half). */
export async function startJob(id: string, businessId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  await transition(id, businessId, ["scheduled"], { status: "in_progress", started_at: new Date().toISOString() });
}

export async function holdJob(id: string, businessId: string, reason: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A reason is required to put a job on hold.");
  await transition(id, businessId, ["in_progress"], { status: "on_hold", on_hold_reason: trimmed });
}

export async function resumeJob(id: string, businessId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  await transition(id, businessId, ["on_hold"], { status: "in_progress", on_hold_reason: null });
}

/** `in_progress|on_hold -> completed`. When `fsm.settings.auto_invoice_on_complete` is
 * on (PRD §4), this also generates the job's invoice (still a draft -- "generation" per
 * the settings flag, not sending) via the same idempotent `getOrCreateInvoiceForJob`
 * the invoice screen itself uses; best-effort, since a completed job shouldn't be
 * blocked by an invoice-generation failure the user can always retry from the invoice
 * screen. */
export async function completeJob(id: string, businessId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  await transition(id, businessId, ["in_progress", "on_hold"], { status: "completed", completed_at: new Date().toISOString() });
  await consumeJobParts(businessId, id).catch(() => {});

  const fsm = await createClient();
  const { data: settings } = await fsm.from("settings").select("auto_invoice_on_complete").eq("business_id", businessId).maybeSingle();
  if (settings?.auto_invoice_on_complete) {
    await getOrCreateInvoiceForJob(businessId, id).catch(() => {});
  }
}

export async function cancelJob(id: string, businessId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  await transition(id, businessId, ["unscheduled", "scheduled", "in_progress", "on_hold"], { status: "cancelled" });
  await releaseJobParts(businessId, id).catch(() => {});
}

/** `completed -> in_progress`, admin-only per the PRD (§4) -- enforced by the
 * `jobs.reopen` permission at the server-action layer, granted to owner/admin only,
 * distinct from the ordinary `jobs.edit` every other transition here uses. */
export async function reopenJob(id: string, businessId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  await transition(id, businessId, ["completed"], { status: "in_progress", completed_at: null });
}

/** "Duplicate" (PRD §1.3 "More options") -- a fresh unscheduled job copying the same
 * customer/service type/description/scope, not linked to the original via
 * `opportunity_id` (it's a new, independent job, not a continuation of the same one). */
export async function duplicateJob(id: string, businessId: string): Promise<string> {
  await requireModule(businessId, "fsm");
  const supabase = await createClient();
  const { data: job, error: fetchError } = await supabase.from("jobs").select("*").eq("id", id).eq("business_id", businessId).single();
  if (fetchError) throw fetchError;

  const core = await coreClient();
  const { data: number, error: numberError } = await core.rpc("next_number", {
    p_business_id: businessId,
    p_scope: "job",
    p_prefix: "JOB",
  });
  if (numberError) throw numberError;

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      business_id: businessId,
      number,
      party_id: job.party_id,
      service_type_id: job.service_type_id,
      description: job.description,
      scope_of_work: job.scope_of_work,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** "Convert back to an opportunity" (PRD §1.3, §4: "only if no invoice exists" --
 * checked by the caller via `jobHasInvoice()` before this runs). Jobs and opportunities
 * are separate tables here (unlike Kickserv's single-entity-different-view model), so
 * "convert" means: reactivate the job's own originating opportunity if it has one
 * (clearing `converted_job_id`), or create a fresh one from the job's own fields if it
 * doesn't, then delete the job -- the record genuinely moves back to being an
 * opportunity, it doesn't exist as both at once. */
export async function convertJobToOpportunity(job: Job, businessId: string): Promise<string> {
  await requireModule(businessId, "fsm");
  const supabase = await createClient();
  let opportunityId = job.opportunity_id;

  if (opportunityId) {
    const { error } = await supabase
      .from("opportunities")
      .update({ status: "new", converted_job_id: null })
      .eq("id", opportunityId)
      .eq("business_id", businessId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("opportunities")
      .insert({
        business_id: businessId,
        party_id: job.party_id,
        primary_contact_id: job.primary_contact_id,
        service_address_id: job.service_address_id,
        service_type_id: job.service_type_id,
        description: job.description,
        scope_of_work: job.scope_of_work,
        source: "manual",
      })
      .select("id")
      .single();
    if (error) throw error;
    opportunityId = data.id;
  }

  const { error: deleteError } = await supabase.from("jobs").delete().eq("id", job.id).eq("business_id", businessId);
  if (deleteError) throw deleteError;

  if (!opportunityId) throw new Error("Could not resolve an opportunity for this job.");
  return opportunityId;
}
