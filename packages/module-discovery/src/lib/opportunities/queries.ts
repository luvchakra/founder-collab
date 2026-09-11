import { cache } from "react";
import { createClient } from "../../db/server";
import type { Opportunity } from "./types";

/** cache()-wrapped for the same request-deduplication reason every other list query in
 * this module is. Ordered by score first (nulls last) so the strongest opportunities
 * surface first once a real scoring pass (05.2) starts populating them. */
export const listOpportunities = cache(async (workspaceId: string): Promise<Opportunity[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
});

export const getOpportunity = cache(async (opportunityId: string): Promise<Opportunity | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("opportunities").select("*").eq("id", opportunityId).maybeSingle();
  if (error) throw error;
  return data;
});

export async function listOpportunitiesForProspect(prospectId: string): Promise<Opportunity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
