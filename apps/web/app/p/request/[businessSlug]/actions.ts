"use server";

import { submitWorkRequest } from "@cofounderai/module-fsm/lib/work-requests/mutations";
import type { WorkRequestInput } from "@cofounderai/module-fsm/lib/work-requests/types";

export async function submitWorkRequestAction(businessId: string, input: WorkRequestInput): Promise<void> {
  await submitWorkRequest(businessId, input);
}
