import { cache } from "react";
import { createClient } from "../../db/server";
import type { BuyerPersona } from "./types";

/** cache()-wrapped for the same reason as getIcpProfile: the offering's ICP page and any
 * later research/scoring consumer (Phase C) can both request the same workspace's
 * personas within one request without a duplicate round trip. Ordered by sort_order so a
 * future drag-to-reorder has somewhere to write to; ties broken by creation order. */
export const listBuyerPersonas = cache(async (workspaceId: string): Promise<BuyerPersona[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("buyer_personas")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
});
