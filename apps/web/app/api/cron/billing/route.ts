import { NextResponse } from "next/server";
import { expireCheckoutSessions } from "@cofounderai/core/billing/checkout";
import { enforcePaymentGrace } from "@cofounderai/core/billing/provisioning";
import { retryBillingEvents } from "@cofounderai/core/billing/webhooks";
import { bearerTokenMatches } from "@cofounderai/core/lib/timing-safe";

/**
 * BILL-14 -- the billing sweep (§52, §96): retries webhook events whose processing
 * failed or was cut off, expires checkout sessions past their 30 minutes, and
 * (PLATFORM-P1-04.3) moves past-due subscriptions whose payment grace has run out into
 * read-only grace. Same shared-secret auth as every other cron route.
 */
export async function GET(request: Request) {
  if (!bearerTokenMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const events = await retryBillingEvents();
  const expiredSessions = await expireCheckoutSessions();
  const paymentGrace = await enforcePaymentGrace();
  return NextResponse.json({ ...events, expiredSessions, paymentGrace });
}
