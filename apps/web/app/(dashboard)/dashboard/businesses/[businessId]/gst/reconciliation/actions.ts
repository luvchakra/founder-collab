"use server";

import { revalidatePath } from "next/cache";
import { syncReconciliationExceptions, resolveException, dismissException } from "@cofounderai/module-gst/lib/exceptions/mutations";

/** COMPLY-P0-08.6/COMPLY-P0-11 (Reconciliation Exceptions UI). No `requirePermission`
 * call here beyond the mutation layer's own -- matches `gst/registrations/actions.ts`'s
 * own documented precedent: every function in `lib/exceptions/mutations.ts` already
 * calls `requireModule`/`requirePermission('gst.manage_reconciliation')` itself. */
export async function syncReconciliationExceptionsAction(businessId: string, returnPeriod: string): Promise<void> {
  await syncReconciliationExceptions(businessId, returnPeriod);
  revalidatePath(`/dashboard/businesses/${businessId}/gst/reconciliation`);
}

export async function resolveExceptionAction(businessId: string, exceptionId: string): Promise<void> {
  await resolveException(businessId, exceptionId);
  revalidatePath(`/dashboard/businesses/${businessId}/gst/reconciliation`);
}

export async function dismissExceptionAction(businessId: string, exceptionId: string): Promise<void> {
  await dismissException(businessId, exceptionId);
  revalidatePath(`/dashboard/businesses/${businessId}/gst/reconciliation`);
}
