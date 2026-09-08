import { cache } from "react";
import { createClient } from "../../db/server";
import type { Channel } from "./types";

export const listChannels = cache(async (businessId: string): Promise<Channel[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at");
  if (error) throw error;
  return data;
});
