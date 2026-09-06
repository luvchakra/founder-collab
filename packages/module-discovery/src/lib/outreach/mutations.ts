import { createClient } from "../../db/server";
import type { OutreachStrategy } from "./types";

export async function approveOutreachStrategy(strategyId: string): Promise<OutreachStrategy> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("outreach_strategies")
    .update({ status: "approved" })
    .eq("id", strategyId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
