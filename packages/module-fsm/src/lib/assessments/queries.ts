import { cache } from "react";
import { createClient } from "../../db/server";
import type { Assessment } from "./types";

export const getAssessment = cache(async (businessId: string, assessmentId: string): Promise<Assessment | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("assessments").select("*").eq("business_id", businessId).eq("id", assessmentId).maybeSingle();
  if (error) throw error;
  return data as Assessment | null;
});

export async function listAssessmentsForParty(businessId: string, partyId: string): Promise<Assessment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessments")
    .select("*")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Assessment[];
}
