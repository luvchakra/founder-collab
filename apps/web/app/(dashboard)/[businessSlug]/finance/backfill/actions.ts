"use server";

import { revalidatePath } from "next/cache";
import { businessPath } from "@/lib/business-path";
import { runFinanceBackfill } from "@cofounderai/module-gst/lib/backfill/mutations";
import type { BackfillRunState } from "@cofounderai/module-gst/lib/backfill/types";

/** No `requirePermission` call here beyond `runFinanceBackfill`'s own -- same precedent
 * every other Finance action in this codebase documents. */
export async function runFinanceBackfillAction(businessId: string): Promise<BackfillRunState> {
  try {
    const result = await runFinanceBackfill(businessId);
    revalidatePath(`${await businessPath(businessId)}/finance/backfill`);
    revalidatePath(`${await businessPath(businessId)}/finance/exceptions`);
    revalidatePath(`${await businessPath(businessId)}/finance/dashboard`);
    return { status: "done", result };
  } catch (cause) {
    return { status: "error", message: cause instanceof Error ? cause.message : "The backfill could not run." };
  }
}
