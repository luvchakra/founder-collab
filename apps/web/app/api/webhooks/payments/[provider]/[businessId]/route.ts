import { handleGatewayWebhook } from "@cofounderai/core/billing/webhook-handler";

/**
 * Per-business collections webhook: a business's own Stripe (checkout.session.completed,
 * checkout.session.async_payment_succeeded) or Razorpay (payment_link.paid) account
 * points here, verified with the webhook secret that business saved under
 * Billing -> Collect payments.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string; businessId: string }> },
) {
  const { provider, businessId } = await params;
  if (provider !== "stripe" && provider !== "razorpay") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return handleGatewayWebhook(request, { provider, scope: "business", businessId });
}
