"use server";

import { revalidatePath } from "next/cache";
import { businessPath } from "@/lib/business-path";
import { saveBudget, type SaveBudgetResult } from "@cofounderai/module-gst/lib/accounting/budget-mutations";

/** FIN-BUDGET-ENTRY — saves the budget grid. Permission, licence and validation all live
 * in `saveBudget()`; a refusal comes back as a sentence, never a generic failure. */
export async function saveBudgetAction(businessId: string, input: unknown): Promise<SaveBudgetResult> {
  let result: SaveBudgetResult;
  try {
    result = await saveBudget(businessId, input);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The budget could not be saved." };
  }
  if (result.ok && result.changed > 0) {
    const base = `${await businessPath(businessId)}/finance/budget`;
    revalidatePath(base);
    revalidatePath(`${base}/edit`);
  }
  return result;
}
