import { cache } from "react";
import { createClient } from "../../db/server";
import type { Supplier } from "./types";

/** Ported from stockpilot-ai-ops's routes/_authenticated/suppliers.tsx `suppliers`
 * useQuery. */
export const listSuppliers = cache(async (businessId: string): Promise<Supplier[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("org_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
});
