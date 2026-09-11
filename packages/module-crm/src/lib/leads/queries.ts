import { createClient } from "../../db/server";
import type { Lead, LeadStatus } from "./types";

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
