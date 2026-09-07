import { cache } from "react";
import { createClient } from "../../db/server";
import type { Customer } from "./types";

/** Ported from stockpilot-ai-ops's routes/_authenticated/customers.tsx `customers`
 * useQuery. */
export const listCustomers = cache(async (businessId: string): Promise<Customer[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("org_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
});
