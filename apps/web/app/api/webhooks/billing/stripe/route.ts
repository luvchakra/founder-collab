import { handleBillingWebhook } from "@/lib/billing-webhook";

/** BILL-13 -- Stripe webhooks (§24). Register this URL as a Stripe webhook endpoint and
 * enter its signing secret under Platform Admin > Billing > Providers. */
export async function POST(request: Request) {
  return handleBillingWebhook("stripe", request);
}
