"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@cofounderai/core/db/server";
import { hasPermission } from "@cofounderai/core/finance/controls";
import { SITE_URL } from "@cofounderai/core/site";
import { cancelModuleSubscription, startModuleSubscription } from "@cofounderai/core/billing/subscriptions";
import { removeGatewayAccount, saveGatewayAccount } from "@cofounderai/core/billing/collections";
import type { GatewayProvider } from "@cofounderai/core/billing/types";

const BILLING_PATH = "/dashboard/settings/billing";
// Only ever redirect the browser to a provider's own hosted page.
const CHECKOUT_HOSTS = /^https:\/\/(checkout\.stripe\.com|rzp\.io|[a-z0-9-]+\.razorpay\.com)\//;

export type GatewayFormState = { error: string } | { success: true } | null;

/** businessId arrives from the client: authorize it server-side (CLAUDE.md principle 8)
 * before any service-role billing code runs. has_permission() resolves membership +
 * role, so a business the caller doesn't belong to fails the same way. */
async function requireBillingManager(businessId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await hasPermission(businessId, "billing.manage"))) {
    throw new Error("You don't have permission to manage billing for this business.");
  }
  return user;
}

async function returnUrl(): Promise<string> {
  const origin = (await headers()).get("origin") ?? SITE_URL;
  return `${origin}${BILLING_PATH}`;
}

export async function subscribeAction(businessId: string, priceId: string) {
  const user = await requireBillingManager(businessId);
  const url = await startModuleSubscription({
    businessId,
    priceId,
    userId: user.id,
    userEmail: user.email ?? null,
    returnUrl: await returnUrl(),
  });
  if (!CHECKOUT_HOSTS.test(url)) throw new Error("Unexpected checkout URL from the payment provider.");
  redirect(url);
}

export async function cancelSubscriptionAction(businessId: string, moduleKey: string) {
  await requireBillingManager(businessId);
  await cancelModuleSubscription(businessId, moduleKey);
  revalidatePath(BILLING_PATH);
}

const SECRET_FORMATS: Record<GatewayProvider, { secret: RegExp; webhook: RegExp; keyId?: RegExp }> = {
  stripe: { secret: /^(sk|rk)_(test|live)_[A-Za-z0-9]+$/, webhook: /^whsec_[A-Za-z0-9+/=]+$/ },
  razorpay: { secret: /^[A-Za-z0-9]{16,64}$/, webhook: /^\S{8,128}$/, keyId: /^rzp_(test|live)_[A-Za-z0-9]+$/ },
};

export async function saveGatewayAccountAction(
  businessId: string,
  provider: GatewayProvider,
  _prev: GatewayFormState,
  formData: FormData,
): Promise<GatewayFormState> {
  const user = await requireBillingManager(businessId);
  const keyId = String(formData.get("keyId") ?? "").trim();
  const secret = String(formData.get("secret") ?? "").trim();
  const webhookSecret = String(formData.get("webhookSecret") ?? "").trim();
  const format = SECRET_FORMATS[provider];
  if (format.keyId && !format.keyId.test(keyId)) return { error: "That doesn't look like a Razorpay key id (rzp_live_… / rzp_test_…)." };
  if (!format.secret.test(secret)) return { error: "That doesn't look like a valid secret key." };
  if (!format.webhook.test(webhookSecret)) return { error: "That doesn't look like a valid webhook secret." };

  try {
    await saveGatewayAccount({ businessId, provider, keyId: keyId || null, secret, webhookSecret, userId: user.id });
  } catch (error) {
    console.error("[billing] saving gateway account failed:", error instanceof Error ? error.message : error);
    return { error: "Couldn't save the account -- please try again." };
  }
  revalidatePath(BILLING_PATH);
  return { success: true };
}

export async function removeGatewayAccountAction(businessId: string, provider: GatewayProvider) {
  await requireBillingManager(businessId);
  await removeGatewayAccount(businessId, provider);
  revalidatePath(BILLING_PATH);
}
