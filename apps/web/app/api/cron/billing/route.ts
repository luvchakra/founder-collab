import { NextResponse } from "next/server";
import { enforcePaymentGrace, expireCheckoutSessions, expireEndedTrials } from "@cofounderai/core/billing/checkout";
import { retryBillingEvents } from "@cofounderai/core/billing/webhooks";

/**
 * BILL-14 -- the billing sweep (§52, §96): retries webhook events whose processing
 * failed or was cut off, and expires checkout sessions past their 30 minutes. Same
 * shared-secret auth as every other cron route. Also ends free trials whose time is up
 * (PLATFORM-P1-04.2) and moves past_due subscriptions past their payment grace into the
 * read-only licence grace (PLATFORM-P1-04.3) -- never deleting anything (04.4).
 */
export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const events = await retryBillingEvents();
  const expiredSessions = await expireCheckoutSessions();
  const endedTrials = await expireEndedTrials();
  const paymentGraceEnded = await enforcePaymentGrace();
  return NextResponse.json({ ...events, expiredSessions, endedTrials, paymentGraceEnded });
}
