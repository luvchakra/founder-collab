import { cache } from "react";
import { createClient } from "../../db/server";
import type { Warehouse } from "./types";

/** Ported from stockpilot-ai-ops's routes/_authenticated/warehouses.tsx (its `warehouses`
 * useQuery) -- RLS (`tenant AND licensed`, SP-3a) is what actually enforces that this
 * only ever returns the caller's own business's rows; `business_id` here is a filter for
 * "which of my businesses", not an authorization check. */
export const listWarehouses = cache(async (businessId: string): Promise<Warehouse[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
});
