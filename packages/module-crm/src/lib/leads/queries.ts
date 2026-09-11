import { createClient } from "../../db/server";
import type { Lead, LeadStatus, SourceChannel } from "./types";

/** CRM-01.3's `listLeads()` contract operation. Filtering beyond status/owner (search,
 * source, pagination) is CRM-04.x's own lead-lifecycle/pipeline UI story. */
export async function listLeads(
  businessId: string,
  filter?: { status?: LeadStatus; ownerId?: string },
): Promise<Lead[]> {
  const supabase = await createClient();
  let query = supabase.from("lead").select("*").eq("business_id", businessId).order("created_at", { ascending: false });
  if (filter?.status) query = query.eq("status", filter.status);
  if (filter?.ownerId) query = query.eq("owner_id", filter.ownerId);
  const { data, error } = await query;
  if (error) throw error;
  return data as Lead[];
}

/** CRM-02.4: "Analytics can aggregate by source." A count-by-source breakdown is the
 * minimal proof that `crm.lead.source` (set at creation, CRM-01.2) supports aggregation
 * today -- the actual reporting UI is CRM-14.x's own story ("Discovery -> CRM Funnel",
 * "Channel Performance"), not pre-built here. Counted client-side rather than a SQL
 * `group by` since the crm-schema Supabase client has no RPC for it yet and this list is
 * small (bounded by the fixed SourceChannel enum), not a performance concern. */
export async function countLeadsBySource(businessId: string): Promise<Record<SourceChannel, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("lead").select("source").eq("business_id", businessId);
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data) counts[row.source] = (counts[row.source] ?? 0) + 1;
  return counts as Record<SourceChannel, number>;
}
