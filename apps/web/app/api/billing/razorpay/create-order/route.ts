import { NextResponse } from "next/server";
import { createClient } from "@cofounderai/core/db/server";
import { getCurrentAccount } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { createPendingCreditPurchase } from "@cofounderai/core/billing/mutations";
import { getCreditPlan } from "@cofounderai/core/billing/plans";
import { RazorpayNotConfiguredError } from "@cofounderai/core/billing/razorpay";

/**
 * Starts a "buy AI credits" purchase (Billing page's plan cards): resolves the caller's
 * own account server-side (never trusts a client-supplied account id), creates the
 * Razorpay order, and records it as a pending purchase. Returns just enough for the
 * client to open Razorpay's Checkout.js widget against that order -- the actual crediting
 * happens later, from the webhook (or the client-reported payment signature), never here.
 */
export async function POST(request: Request) {
  // E2E-DEF-003: authenticate before touching `core` -- the anonymous role has no usage
  // on that schema, so an unauthenticated call used to crash with a 500 (42501) here
  // instead of being refused with a 401.
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { planKey?: string } | null;
  const planKey = body?.planKey;
  if (!planKey || !getCreditPlan(planKey)) {
    return NextResponse.json({ error: "Unknown credit plan" }, { status: 400 });
  }

  try {
    const pending = await createPendingCreditPurchase(account.id, planKey);
    return NextResponse.json(pending);
  } catch (error) {
    if (error instanceof RazorpayNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("create-order: failed to create credit purchase", error);
    return NextResponse.json({ error: "Could not start checkout. Try again." }, { status: 500 });
  }
}
