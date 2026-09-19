"use server";

import { businessPath } from "@/lib/business-path";
import { revalidatePath } from "next/cache";
import { createClient } from "@cofounderai/core/db/server";
import {
  assignFinanceException,
  ignoreFinanceException,
  reopenFinanceException,
  resolveFinanceException,
  startReviewingFinanceException,
  syncFinanceExceptions,
} from "@cofounderai/module-gst/lib/exceptions-queue/mutations";

/** FIN-1 (Finance exceptions queue UI). No `requirePermission` call here beyond the
 * mutation layer's own -- same precedent `finance/reconciliation/actions.ts` documents:
 * every function in `lib/exceptions-queue/mutations.ts` already calls
 * `requireModule`/`requirePermission('gst.exceptions.manage')` itself. */

async function revalidateExceptionsPage(businessId: string): Promise<void> {
  revalidatePath(`${await businessPath(businessId)}/finance/exceptions`);
}

export async function syncFinanceExceptionsAction(businessId: string): Promise<void> {
  await syncFinanceExceptions(businessId);
  await revalidateExceptionsPage(businessId);
}

export async function startReviewFinanceExceptionAction(businessId: string, exceptionId: string): Promise<void> {
  await startReviewingFinanceException(businessId, exceptionId);
  await revalidateExceptionsPage(businessId);
}

export async function reopenFinanceExceptionAction(businessId: string, exceptionId: string): Promise<void> {
  await reopenFinanceException(businessId, exceptionId);
  await revalidateExceptionsPage(businessId);
}

export async function resolveFinanceExceptionAction(businessId: string, exceptionId: string): Promise<void> {
  await resolveFinanceException(businessId, exceptionId);
  await revalidateExceptionsPage(businessId);
}

export async function ignoreFinanceExceptionAction(businessId: string, exceptionId: string): Promise<void> {
  await ignoreFinanceException(businessId, exceptionId);
  await revalidateExceptionsPage(businessId);
}

export async function claimFinanceExceptionAction(businessId: string, exceptionId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to claim an exception.");
  await assignFinanceException(businessId, exceptionId, user.id);
  await revalidateExceptionsPage(businessId);
}

export async function unclaimFinanceExceptionAction(businessId: string, exceptionId: string): Promise<void> {
  await assignFinanceException(businessId, exceptionId, null);
  await revalidateExceptionsPage(businessId);
}
