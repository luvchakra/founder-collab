"use server";

import { revalidatePath } from "next/cache";
import { businessPath } from "@/lib/business-path";
import {
  openFiscalYear,
  setAccountingPeriodStatus,
} from "@cofounderai/module-gst/lib/accounting/mutations";
import type { PeriodStatus } from "@cofounderai/module-gst/lib/accounting/periods";

async function revalidatePeriods(businessId: string): Promise<void> {
  revalidatePath(`${await businessPath(businessId)}/finance/periods`);
}

export async function openFiscalYearAction(businessId: string, fiscalYear: number): Promise<void> {
  await openFiscalYear(businessId, fiscalYear);
  await revalidatePeriods(businessId);
}

export async function setAccountingPeriodStatusAction(
  businessId: string,
  periodId: string,
  status: PeriodStatus,
): Promise<void> {
  await setAccountingPeriodStatus(businessId, periodId, status);
  await revalidatePeriods(businessId);
}
