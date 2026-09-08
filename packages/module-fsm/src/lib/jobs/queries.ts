import { cache } from "react";
import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { AuditLogEntry, Job, JobListItem } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** Same "no PostgREST embed, join in JS" pattern as opportunities/queries.ts --
 * `fsm.jobs.party_id`/`service_type_id` have no embed target either. */
export const listJobs = cache(async (businessId: string): Promise<JobListItem[]> => {
  const supabase = await createClient();
  const { data: jobs, error } = await supabase.from("jobs").select("*").eq("business_id", businessId).order("created_at", { ascending: false });
  if (error) throw error;
  if (jobs.length === 0) return [];

  const core = await coreClient();
  const partyIds = [...new Set(jobs.map((j) => j.party_id))];
  const serviceTypeIds = [...new Set(jobs.map((j) => j.service_type_id).filter((id): id is string => Boolean(id)))];

  const [partiesRes, serviceTypesRes] = await Promise.all([
    core.from("parties").select("id, name").in("id", partyIds),
    serviceTypeIds.length ? supabase.from("service_types").select("id, name").in("id", serviceTypeIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (partiesRes.error) throw partiesRes.error;
  if (serviceTypesRes.error) throw serviceTypesRes.error;

  const partyById = new Map(partiesRes.data.map((p: { id: string; name: string }) => [p.id, p.name]));
  const serviceTypeById = new Map(serviceTypesRes.data.map((s: { id: string; name: string }) => [s.id, s.name]));

  return jobs.map((j) => ({
    ...j,
    party_name: partyById.get(j.party_id) ?? "Unknown customer",
    service_type_name: j.service_type_id ? (serviceTypeById.get(j.service_type_id) ?? null) : null,
  }));
});

/** `businessId` is a "which of my businesses" filter, not the authorization check (RLS
 * is) -- same reasoning as opportunities/queries.ts#getOpportunity. */
export const getJob = cache(async (businessId: string, id: string): Promise<Job | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("jobs").select("*").eq("business_id", businessId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
});

export const getJobContext = cache(async (job: Job): Promise<{ partyName: string; serviceTypeName: string | null }> => {
  const core = await coreClient();
  const { data: party, error: partyError } = await core.from("parties").select("name").eq("id", job.party_id).maybeSingle();
  if (partyError) throw partyError;

  let serviceTypeName: string | null = null;
  if (job.service_type_id) {
    const supabase = await createClient();
    const { data: serviceType, error: serviceTypeError } = await supabase
      .from("service_types")
      .select("name")
      .eq("id", job.service_type_id)
      .maybeSingle();
    if (serviceTypeError) throw serviceTypeError;
    serviceTypeName = serviceType?.name ?? null;
  }

  return { partyName: party?.name ?? "Unknown customer", serviceTypeName };
});

/** Whether this job already has an invoice -- gates "convert back to opportunity" (PRD
 * §4: "job -> opportunity ... only if no invoice exists"). Always false today since F-8
 * (Invoicing) hasn't landed yet; becomes a real check once `core.documents` rows with
 * `doc_type='invoice'` and `source_ref.job_id` start existing. */
export async function jobHasInvoice(businessId: string, jobId: string): Promise<boolean> {
  const core = await coreClient();
  const { data, error } = await core
    .from("documents")
    .select("id")
    .eq("business_id", businessId)
    .eq("doc_type", "invoice")
    .contains("source_ref", { job_id: jobId })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** Job detail's "History" tab (PRD §5) -- reads `core.audit_log`, written automatically
 * by `fsm.jobs`' own status-change trigger (this story's migration). */
export const listJobAuditLog = cache(async (businessId: string, jobId: string): Promise<AuditLogEntry[]> => {
  const core = await coreClient();
  const { data, error } = await core
    .from("audit_log")
    .select("id, action, before, after, created_at")
    .eq("business_id", businessId)
    .eq("entity_type", "job")
    .eq("entity_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
});
