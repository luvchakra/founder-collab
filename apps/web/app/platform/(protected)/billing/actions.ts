"use server";

import { revalidatePath } from "next/cache";
import {
  setBillingProviderSecrets,
  updateBillingProvider,
  updateBillingSettings,
  type SetBillingProviderSecretsInput,
  type UpdateBillingProviderInput,
  type UpdateBillingSettingsInput,
} from "@cofounderai/core/admin/platform-billing";
import {
  adminCancelSubscription,
  applySubscriptionSync,
  previewSubscriptionSync,
  reconcilePlatformSubscriptionLicenses,
  refundPlatformPayment,
  retryPlatformBillingEvent,
  type SyncDifference,
} from "@cofounderai/core/admin/platform-billing-ops";
import {
  updateSubscriptionBillingConfig,
  updateSubscriptionLifecycle,
  type UpdateBillingConfigInput,
  type UpdateLifecycleInput,
} from "@cofounderai/core/admin/platform-billing-lifecycle";

/**
 * BILL-26..32 -- thin wrappers over the audited core functions (each of which re-checks
 * requireSuperadmin() and validates its own input). Nothing here reads or returns a
 * secret: provider secrets are write-only, passed straight through to be encrypted.
 */

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

function revalidateBilling() {
  revalidatePath("/platform/billing", "layout");
}

export async function previewSubscriptionSyncAction(
  id: string,
): Promise<{ ok: true; differences: SyncDifference[] } | { ok: false; error: string }> {
  return previewSubscriptionSync(id);
}

export async function applySubscriptionSyncAction(id: string, reason: string): Promise<Result> {
  const result = await applySubscriptionSync(id, { reason });
  if (result.ok) revalidateBilling();
  return result;
}

export async function reconcileSubscriptionLicensesAction(id: string): Promise<Result> {
  const result = await reconcilePlatformSubscriptionLicenses(id);
  if (result.ok) revalidateBilling();
  return result;
}

export async function cancelSubscriptionAction(id: string, input: { immediate: boolean; reason: string }): Promise<Result> {
  const result = await adminCancelSubscription(id, input);
  if (result.ok) revalidateBilling();
  return result;
}

export async function refundPaymentAction(input: { paymentId: string; amount: string; reason: string }): Promise<Result> {
  const amount = input.amount.trim();
  const result = await refundPlatformPayment({
    paymentId: input.paymentId,
    amount: amount === "" ? "" : Number(amount),
    reason: input.reason,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidateBilling();
  return { ok: true };
}

export async function retryBillingEventAction(id: string): Promise<Result & { outcome?: string }> {
  const result = await retryPlatformBillingEvent(id);
  revalidateBilling();
  return result;
}

export async function updateBillingProviderAction(input: UpdateBillingProviderInput): Promise<Result> {
  const result = await updateBillingProvider(input);
  if (result.ok) revalidateBilling();
  return result;
}

export async function setBillingProviderSecretsAction(input: SetBillingProviderSecretsInput): Promise<Result> {
  const result = await setBillingProviderSecrets(input);
  if (result.ok) revalidateBilling();
  return result;
}

export async function updateBillingSettingsAction(input: UpdateBillingSettingsInput): Promise<Result> {
  const result = await updateBillingSettings(input);
  if (result.ok) revalidateBilling();
  return result;
}

// PLATFORM-P1-04.2/04.3/04.4 + 05.1/05.3 -- subscription lifecycle, currency and tax.
export async function updateSubscriptionLifecycleAction(input: UpdateLifecycleInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await updateSubscriptionLifecycle(input);
  if (result.ok) revalidatePath("/platform/billing/lifecycle");
  return result;
}

export async function updateSubscriptionBillingConfigAction(input: UpdateBillingConfigInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await updateSubscriptionBillingConfig(input);
  if (result.ok) revalidatePath("/platform/billing/lifecycle");
  return result;
}
