import { NextResponse } from "next/server";
import { expireCheckoutSessions } from "@cofounderai/core/billing/checkout";
import { retryBillingEvents } from "@cofounderai/core/billing/webhooks";

/**
 * BILL-14 -- the billing sweep (§52, §96): retries webhook events whose processing
 * failed or was cut off, and expires checkout sessions past their 30 minutes. Same
 * shared-secret auth as every other cron route.
 */
export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const events = await retryBillingEvents();
  const expiredSessions = await expireCheckoutSessions();
  return NextResponse.json({ ...events, expiredSessions });
}
