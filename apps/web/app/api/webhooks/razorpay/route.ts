import { handleGatewayWebhook } from "@cofounderai/core/billing/webhook-handler";

/**
 * Platform billing webhook (module subscriptions). In the Razorpay dashboard, point a
 * webhook here with the subscription.* events enabled and set RAZORPAY_WEBHOOK_SECRET to
 * the secret entered there.
 */
export async function POST(request: Request) {
  return handleGatewayWebhook(request, { provider: "razorpay", scope: "platform" });
}
