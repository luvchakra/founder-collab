import { cache } from "react";
import { createClient } from "../../db/server";
import type { NegativeSignal } from "./types";

export const listNegativeSignalsForProspect = cache(async (prospectId: string): Promise<NegativeSignal[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("negative_signals")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("detected_at", { ascending: false });
  if (error) throw error;
  return data;
});
