import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import { getCurrentEmployee } from "../employees/queries";
import type { CreateExpenseInput } from "./types";

/** `employee_id` is best-effort (the column is nullable, F-1) -- an owner/admin who
 * isn't a technician can still log an expense on a job (e.g. reconciling a receipt
 * after the fact), it just won't attribute to anyone's own field record. */
export async function addExpense(businessId: string, jobId: string, input: CreateExpenseInput): Promise<string> {
  await requireModule(businessId, "fsm");
  const description = input.description.trim();
  if (!description) throw new Error("A description is required.");
  if (!(input.amount >= 0)) throw new Error("Amount must be zero or more.");

  const employee = await getCurrentEmployee(businessId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      business_id: businessId,
      job_id: jobId,
      description,
      amount: input.amount,
      incurred_on: input.incurredOn || new Date().toISOString().slice(0, 10),
      employee_id: employee?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteExpense(id: string, businessId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
}
