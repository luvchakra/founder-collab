import { cache } from "react";
import { createClient } from "../../db/server";
import type { Expense } from "./types";

export const listExpensesForJob = cache(async (businessId: string, jobId: string): Promise<Expense[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("business_id", businessId)
    .eq("job_id", jobId)
    .order("incurred_on", { ascending: false });
  if (error) throw error;
  return data;
});
