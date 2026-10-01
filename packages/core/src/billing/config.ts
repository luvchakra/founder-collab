import type { GatewayProvider } from "./types";

/**
 * The platform's OWN gateway credentials -- used only for platform billing (businesses
 * paying for module licenses). A business's credentials for collecting from its own
 * customers live encrypted in core.payment_gateway_accounts instead (collections.ts).
 * A provider counts as configured only when its full key set is present.
 */
export function platformStripe(): { secretKey: string; webhookSecret: string } | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  return secretKey && webhookSecret ? { secretKey, webhookSecret } : null;
}

export function platformRazorpay(): { keyId: string; keySecret: string; webhookSecret: string } | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  return keyId && keySecret && webhookSecret ? { keyId, keySecret, webhookSecret } : null;
}

export function configuredPlatformProviders(): GatewayProvider[] {
  return [
    ...(platformStripe() ? (["stripe"] as const) : []),
    ...(platformRazorpay() ? (["razorpay"] as const) : []),
  ];
}
