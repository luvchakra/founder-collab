import { createClient } from "../../db/server";
import type { Opportunity, OpportunityStage } from "./types";

/** CRM-04.2: stage configuration, stored at business level. */
export async function listStages(businessId: string): Promise<OpportunityStage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("opportunity_stage").select("*").eq("business_id", businessId).order("sort_order", { ascending: true });
  if (error) throw error;
  return data as OpportunityStage[];
}

export async function listOpportunities(businessId: string): Promise<Opportunity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("opportunity").select("*").eq("business_id", businessId).order("created_at", { ascending: false });
  if (error) throw error;
  return data as Opportunity[];
}
