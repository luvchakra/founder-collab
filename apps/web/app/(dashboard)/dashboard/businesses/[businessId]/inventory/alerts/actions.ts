"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { updateAlertStatus } from "@cofounderai/module-inventory/lib/alerts/mutations";
import type { AlertStatus } from "@cofounderai/module-inventory/lib/alerts/types";

export async function updateAlertStatusAction(
  businessId: string,
  alertId: string,
  status: AlertStatus,
): Promise<void> {
  await requirePermission(businessId, "alerts.manage");
  await updateAlertStatus(alertId, status);
  revalidatePath(`/dashboard/businesses/${businessId}/inventory/alerts`);
}
