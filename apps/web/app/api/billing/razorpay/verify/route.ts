import { NextResponse } from "next/server";
import { getCurrentAccount } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { verifyRazorpayPaymentSignature } from "@cofounderai/core/billing/razorpay";
import { markCreditPurchasePaid } from "@cofounderai/core/billing/mutations";

/**
 * Client-reported payment success (Checkout.js's own `handler` callback, right after the
 * founder completes payment) -- verifies the signature Razorpay hands back to the client
 * and, if it checks out, credits the purchase immediately so the Billing page can update
 * without waiting on the webhook (apps/web/app/api/webhooks/razorpay/route.ts), which is
 * the actual source of truth and will also credit it independently if this call never
 * happens (closed tab, network drop) -- markCreditPurchasePaid is idempotent either way.
 */
export async function POST(request: Request) {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    purchaseId?: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
  } | null;

  if (!body?.purchaseId || !body.razorpayOrderId || !body.razorpayPaymentId || !body.razorpaySignature) {
    return NextResponse.json({ error: "Missing payment details" }, { status: 400 });
  }

  const valid = verifyRazorpayPaymentSignature(body.razorpayOrderId, body.razorpayPaymentId, body.razorpaySignature);
  if (!valid) return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });

  await markCreditPurchasePaid(body.purchaseId, body.razorpayPaymentId, body.razorpaySignature);
  return NextResponse.json({ ok: true });
}
