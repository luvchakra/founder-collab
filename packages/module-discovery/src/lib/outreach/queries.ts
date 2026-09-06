import { createClient } from "../../db/server";
import type { OutreachStrategy } from "./types";

export async function getLatestOutreachStrategy(
  prospectId: string,
): Promise<OutreachStrategy | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("outreach_strategies")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getOutreachStrategy(strategyId: string): Promise<OutreachStrategy | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("outreach_strategies")
    .select("*")
    .eq("id", strategyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
