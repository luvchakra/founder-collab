"use server";

import { approveEstimateFromCenter, declineEstimateFromCenter } from "@cofounderai/module-fsm/lib/customer-center/mutations";

export async function approveEstimateCenterAction(rawToken: string, estimateId: string): Promise<{ jobId: string }> {
  return approveEstimateFromCenter(rawToken, estimateId);
}

export async function declineEstimateCenterAction(rawToken: string, estimateId: string): Promise<void> {
  return declineEstimateFromCenter(rawToken, estimateId);
}
