import { cache } from "react";
import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { getAvailability } from "@cofounderai/module-inventory/contract/index";
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

export type RecommendedPartWithAvailability = {
  itemId: string;
  itemName: string;
  quantity: number;
  availableQuantity: number;
};

/** INT-06.3's "Inventory product reference -> availability" -- resolves `job.
 * recommended_parts`' bare `{itemId, quantity}` lines against `core.items` (name) and
 * Inventory's own contract (`getAvailability()`, summed across every warehouse, same
 * formula `module-crm`'s own availability check already uses) at read time, never
 * stored ("no duplicate product records"). */
export async function listRecommendedPartsWithAvailability(businessId: string, job: Job): Promise<RecommendedPartWithAvailability[]> {
  const lines = job.recommended_parts ?? [];
  if (lines.length === 0) return [];

  const core = await coreClient();
  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const { data: items, error } = await core.from("items").select("id, name").in("id", itemIds);
  if (error) throw error;
  const itemById = new Map(items.map((i) => [i.id, i.name]));

  return Promise.all(
    lines.map(async (line) => {
      const result = await getAvailability(businessId, line.itemId);
      const availableQuantity = result.ok ? result.data.reduce((sum, level) => sum + Math.max(level.available, 0), 0) : 0;
      return { itemId: line.itemId, itemName: itemById.get(line.itemId) ?? "Unknown item", quantity: line.quantity, availableQuantity };
    }),
  );
}

export type RevisitJobLink = { id: string; number: string | null };

/** INT-06.4: the two directions of a warranty-revisit link, resolved for the job
 * detail page -- `revisitOfJob` (this job is itself a revisit of an earlier one) reads
 * `job.revisit_of_job_id` directly; `createdRevisitJob` (an earlier completion of this
 * job already spawned a revisit) is the reverse lookup, since the pointer only lives on
 * the child row -- `.limit(1)` rather than `.maybeSingle()` there, since a job that's
 * been reopened and recompleted with the same outcome more than once could have more
 * than one child; most recent wins. Both plain `businessId`-scoped reads, same "no
 * PostgREST embed, join in JS" convention as this file's other queries. */
export async function getRevisitJobLinks(
  businessId: string,
  job: Job,
): Promise<{ revisitOfJob: RevisitJobLink | null; createdRevisitJob: RevisitJobLink | null }> {
  const supabase = await createClient();

  const [revisitOfResult, createdRevisitResult] = await Promise.all([
    job.revisit_of_job_id
      ? supabase.from("jobs").select("id, number").eq("business_id", businessId).eq("id", job.revisit_of_job_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("jobs").select("id, number").eq("business_id", businessId).eq("revisit_of_job_id", job.id).order("created_at", { ascending: false }).limit(1),
  ]);
  if (revisitOfResult.error) throw revisitOfResult.error;
  if (createdRevisitResult.error) throw createdRevisitResult.error;

  return { revisitOfJob: revisitOfResult.data, createdRevisitJob: createdRevisitResult.data?.[0] ?? null };
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
