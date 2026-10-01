import { createAdminClient } from "../db/admin";
import { createClient } from "../db/server";
import { activateLicense, deactivateLicense } from "../licensing/lifecycle";
import type { ModuleKey } from "../licensing/types";
import { platformRazorpay, platformStripe } from "./config";
import { cancelRazorpaySubscription, createRazorpaySubscription } from "./razorpay";
import { licenseEffect } from "./status";
import { cancelStripeSubscription, createStripeSubscriptionCheckout } from "./stripe";
import type { BillingPrice, NormalizedGatewayEvent, Subscription } from "./types";

/**
 * Platform billing: a business subscribing to a module license. The provider is the
 * source of truth for money; core.subscriptions mirrors it from signed webhooks, and the
 * mirror drives core.licenses through the C-4 lifecycle. Nothing here grants a license
 * directly from a browser request -- only a verified webhook does.
 *
 * Callers (server actions) must have authorized the business first (billing.manage);
 * these functions use the service role because subscriptions/licenses have no client
 * write policy.
 */
function coreAdmin() {
  return createAdminClient({ schema: "core" });
}

const MODULE_KEYS = new Set<ModuleKey>(["discovery", "inventory", "fsm", "crm", "gst"]);

/** RLS-scoped: the active price catalogue (any authenticated user can read it). */
export async function listActivePrices(): Promise<BillingPrice[]> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.from("billing_prices").select("*").eq("is_active", true);
  if (error) throw error;
  return data;
}

/** RLS-scoped: a business's subscriptions, newest first. */
export async function listSubscriptionsForBusiness(businessId: string): Promise<Subscription[]> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** True when a module is sold through billing (an active price exists), in which case
 * it must not be activated for free from the licenses page. */
export async function isModulePaid(moduleKey: string): Promise<boolean> {
  const { count, error } = await coreAdmin()
    .from("billing_prices")
    .select("id", { count: "exact", head: true })
    .eq("module_key", moduleKey)
    .eq("is_active", true);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Starts a subscription and returns the provider-hosted page to send the user to. */
export async function startModuleSubscription(input: {
  businessId: string;
  priceId: string;
  userId: string;
  userEmail: string | null;
  returnUrl: string;
}): Promise<string> {
  const supabase = coreAdmin();
  const { data: price, error: priceError } = await supabase
    .from("billing_prices")
    .select("*")
    .eq("id", input.priceId)
    .eq("is_active", true)
    .maybeSingle();
  if (priceError) throw priceError;
  if (!price) throw new Error("That plan is no longer available.");
  const typedPrice = price as BillingPrice;

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("account_id")
    .eq("id", input.businessId)
    .single();
  if (businessError) throw businessError;

  const { data: live, error: liveError } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("business_id", input.businessId)
    .eq("module_key", typedPrice.module_key)
    .in("status", ["incomplete", "active", "past_due"]);
  if (liveError) throw liveError;
  const liveSubs = (live ?? []) as Subscription[];
  if (liveSubs.some((s) => s.status === "active" || s.status === "past_due")) {
    throw new Error("This business already has an active subscription for that module.");
  }

  if (typedPrice.provider === "stripe") {
    const stripe = platformStripe();
    if (!stripe) throw new Error("Stripe billing isn't configured.");
    // Same business+price within a 10-minute window reuses one Checkout Session
    // (Stripe idempotency), so a double-click can't open two subscriptions.
    const window = Math.floor(Date.now() / (10 * 60 * 1000));
    const session = await createStripeSubscriptionCheckout({
      secretKey: stripe.secretKey,
      priceId: typedPrice.provider_price_id,
      businessId: input.businessId,
      moduleKey: typedPrice.module_key,
      customerEmail: input.userEmail,
      successUrl: `${input.returnUrl}?checkout=success`,
      cancelUrl: `${input.returnUrl}?checkout=cancelled`,
      idempotencyKey: `sub:${input.businessId}:${typedPrice.id}:${window}`,
    });
    return session.url;
  }

  const razorpay = platformRazorpay();
  if (!razorpay) throw new Error("Razorpay billing isn't configured.");
  // Razorpay creates the subscription up front; reuse an unfinished one rather than
  // stacking a new mandate request on every click.
  const pending = liveSubs.find((s) => s.provider === "razorpay" && s.status === "incomplete" && s.checkout_url);
  if (pending?.checkout_url) return pending.checkout_url;

  const sub = await createRazorpaySubscription({
    keyId: razorpay.keyId,
    keySecret: razorpay.keySecret,
    planId: typedPrice.provider_price_id,
    billingInterval: typedPrice.billing_interval,
    businessId: input.businessId,
    moduleKey: typedPrice.module_key,
  });
  const { error: insertError } = await supabase.from("subscriptions").insert({
    account_id: business.account_id,
    business_id: input.businessId,
    module_key: typedPrice.module_key,
    provider: "razorpay",
    provider_subscription_id: sub.id,
    price_id: typedPrice.id,
    status: "incomplete",
    checkout_url: sub.shortUrl,
    created_by: input.userId,
  });
  if (insertError) throw insertError;
  return sub.shortUrl;
}

/** Cancels at period end at the provider; the webhooks that follow move the license
 * into grace once the paid period actually ends. */
export async function cancelModuleSubscription(businessId: string, moduleKey: string): Promise<number> {
  const supabase = coreAdmin();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("business_id", businessId)
    .eq("module_key", moduleKey)
    .in("status", ["incomplete", "active", "past_due"]);
  if (error) throw error;

  for (const sub of (data ?? []) as Subscription[]) {
    if (sub.provider === "stripe") {
      const stripe = platformStripe();
      if (!stripe) throw new Error("Stripe billing isn't configured.");
      await cancelStripeSubscription(stripe.secretKey, sub.provider_subscription_id);
    } else {
      const razorpay = platformRazorpay();
      if (!razorpay) throw new Error("Razorpay billing isn't configured.");
      await cancelRazorpaySubscription(razorpay.keyId, razorpay.keySecret, sub.provider_subscription_id);
    }
    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({ cancel_at_period_end: true })
      .eq("id", sub.id);
    if (updateError) throw updateError;
  }
  return data?.length ?? 0;
}

/**
 * Applies a verified subscription webhook. Returns "ignored" for events that can't be
 * tied to a platform business/module (e.g. a subscription created directly in the
 * provider dashboard without our metadata).
 */
export async function applySubscriptionEvent(
  event: Extract<NormalizedGatewayEvent, { kind: "subscription" }>,
): Promise<"processed" | "ignored"> {
  const supabase = coreAdmin();
  const { data: existingRow, error: existingError } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("provider", event.provider)
    .eq("provider_subscription_id", event.subscriptionId)
    .maybeSingle();
  if (existingError) throw existingError;
  const existing = existingRow as Subscription | null;

  const businessId = event.metadata.business_id ?? existing?.business_id;
  const moduleKey = (event.metadata.module_key ?? existing?.module_key) as ModuleKey | undefined;
  if (!businessId || !moduleKey || !MODULE_KEYS.has(moduleKey)) return "ignored";

  // Providers don't guarantee ordering: never let an older event roll state back.
  if (existing?.provider_updated_at && event.occurredAt < new Date(existing.provider_updated_at)) {
    return "processed";
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("account_id")
    .eq("id", businessId)
    .maybeSingle();
  if (businessError) throw businessError;
  if (!business) return "ignored";

  const row = {
    account_id: business.account_id,
    business_id: businessId,
    module_key: moduleKey,
    provider: event.provider,
    provider_subscription_id: event.subscriptionId,
    provider_customer_id: event.customerId ?? existing?.provider_customer_id ?? null,
    status: event.status,
    current_period_end: event.currentPeriodEnd?.toISOString() ?? existing?.current_period_end ?? null,
    cancel_at_period_end: event.cancelAtPeriodEnd,
    provider_updated_at: event.occurredAt.toISOString(),
    // The hosted checkout link is only useful until the mandate is set up.
    checkout_url: event.status === "incomplete" ? (existing?.checkout_url ?? null) : null,
  };
  const { error: upsertError } = await supabase
    .from("subscriptions")
    .upsert(row, { onConflict: "provider,provider_subscription_id" });
  if (upsertError) throw upsertError;

  const effect = licenseEffect(event.status);
  if (effect === "activate") {
    await activateLicense(businessId, moduleKey);
  } else if (effect === "deactivate") {
    const { count, error: countError } = await supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("module_key", moduleKey)
      .in("status", ["active", "past_due"])
      .neq("provider_subscription_id", event.subscriptionId);
    if (countError) throw countError;
    if ((count ?? 0) === 0) await deactivateLicense(businessId, moduleKey);
  }
  return "processed";
}
