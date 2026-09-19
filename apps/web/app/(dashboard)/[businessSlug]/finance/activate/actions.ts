"use server";

import { revalidatePath } from "next/cache";
import { businessPath } from "@/lib/business-path";
import { activateFinance, setAccountingMethod, setFiscalYearStartMonth } from "@cofounderai/module-gst/lib/activation/mutations";
import type { ActivateFinanceState } from "@cofounderai/module-gst/lib/activation/types";

async function revalidateActivatePage(businessId: string): Promise<void> {
  const base = await businessPath(businessId);
  revalidatePath(`${base}/finance/activate`);
  revalidatePath(`${base}/finance/dashboard`);
}

export async function setAccountingMethodAction(businessId: string, formData: FormData): Promise<void> {
  const method = String(formData.get("accountingMethod"));
  if (method !== "accrual" && method !== "cash") throw new Error("Invalid accounting method.");
  await setAccountingMethod(businessId, method);
  await revalidateActivatePage(businessId);
}

export async function setFiscalYearStartMonthAction(businessId: string, formData: FormData): Promise<void> {
  const month = Number(formData.get("fiscalYearStartMonth"));
  await setFiscalYearStartMonth(businessId, month);
  await revalidateActivatePage(businessId);
}

export async function activateFinanceAction(businessId: string): Promise<ActivateFinanceState> {
  try {
    const result = await activateFinance(businessId);
    await revalidateActivatePage(businessId);
    return { status: "done", ...result };
  } catch (cause) {
    return { status: "error", message: cause instanceof Error ? cause.message : "Activation could not run." };
  }
}
