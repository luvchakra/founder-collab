import { handleGatewayWebhook } from "@cofounderai/core/billing/webhook-handler";

/**
 * Platform billing webhook (module subscriptions). In the Stripe dashboard, point a
 * webhook endpoint here for customer.subscription.created/updated/deleted and set
 * STRIPE_WEBHOOK_SECRET to its signing secret.
 */
export async function POST(request: Request) {
  return handleGatewayWebhook(request, { provider: "stripe", scope: "platform" });
}
