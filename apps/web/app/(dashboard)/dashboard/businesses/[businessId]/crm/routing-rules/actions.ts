"use server";

import { revalidatePath } from "next/cache";
import { createRoutingRule, setRoutingRuleActive } from "@cofounderai/module-crm/lib/routing-rules/mutations";

function detailPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/crm/routing-rules`;
}

export async function createRoutingRuleAction(
  businessId: string,
  name: string,
  channelId: string,
  employeeId: string,
  priority: number,
): Promise<void> {
  await createRoutingRule(businessId, { name, channelId: channelId || null, assignToEmployeeId: employeeId || null, priority });
  revalidatePath(detailPath(businessId));
}

export async function setRoutingRuleActiveAction(businessId: string, ruleId: string, isActive: boolean): Promise<void> {
  await setRoutingRuleActive(ruleId, isActive);
  revalidatePath(detailPath(businessId));
}
