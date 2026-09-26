import { handleBillingWebhook } from "@/lib/billing-webhook";

/** BILL-12 -- Razorpay subscription webhooks (§23). Point the Razorpay dashboard's
 * webhook at this URL with the secret entered under Platform Admin > Billing > Providers. */
export async function POST(request: Request) {
  return handleBillingWebhook("razorpay", request);
}
