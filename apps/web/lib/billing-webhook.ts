import { after, NextResponse } from "next/server";
import { ingestWebhook, processBillingEvent } from "@cofounderai/core/billing/webhooks";
import type { BillingProviderKey } from "@cofounderai/core/billing/subscription-types";

/**
 * BILL-12 / BILL-13 -- the shared shape of both provider webhook routes (§22, §95):
 * read the raw body (signatures are over the exact bytes), verify and persist, answer,
 * then process after the response. A processing failure is recorded on the event and
 * retried by /api/cron/billing -- the provider already has its 200.
 */
export async function handleBillingWebhook(provider: BillingProviderKey, request: Request): Promise<Response> {
  const rawBody = await request.text();
  const result = await ingestWebhook(provider, rawBody, request.headers);
  if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status });
  if (result.eventId) {
    const eventId = result.eventId;
    after(() => processBillingEvent(eventId).then(() => undefined));
  }
  return NextResponse.json({ received: true, duplicate: result.duplicate });
}
