import { completeGatewayEvent, receiveGatewayEvent } from "./inbox";
import { platformRazorpay, platformStripe } from "./config";
import { applyCollectionEvent, getGatewayWebhookSecret } from "./collections";
import { parseRazorpayEvent, verifyRazorpaySignature } from "./razorpay";
import { parseStripeEvent, verifyStripeSignature } from "./stripe";
import { applySubscriptionEvent } from "./subscriptions";
import type { GatewayProvider, NormalizedGatewayEvent } from "./types";

const MAX_BODY_BYTES = 512 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Target = { provider: GatewayProvider; scope: "platform" } | { provider: GatewayProvider; scope: "business"; businessId: string };

/**
 * One handler for every payment webhook route: platform billing
 * (/api/webhooks/stripe, /api/webhooks/razorpay) and per-business collections
 * (/api/webhooks/payments/[provider]/[businessId]).
 *
 * Order matters: the signature is verified over the exact raw bytes before anything is
 * parsed or stored; the event is recorded in the inbox before it's applied; a failure
 * while applying returns 500 so the provider retries (the inbox makes the retry safe).
 * Responses never echo provider payloads or internal error detail.
 */
export async function handleGatewayWebhook(request: Request, target: Target): Promise<Response> {
  if (target.scope === "business" && !UUID_RE.test(target.businessId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  const secret =
    target.scope === "platform"
      ? target.provider === "stripe"
        ? platformStripe()?.webhookSecret
        : platformRazorpay()?.webhookSecret
      : await getGatewayWebhookSecret(target.businessId, target.provider);
  if (!secret) {
    return Response.json({ error: "Webhook not configured" }, { status: 401 });
  }

  const verified =
    target.provider === "stripe"
      ? verifyStripeSignature(rawBody, request.headers.get("stripe-signature"), secret)
      : verifyRazorpaySignature(rawBody, request.headers.get("x-razorpay-signature"), secret);
  if (!verified) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  let event: NormalizedGatewayEvent;
  try {
    payload = JSON.parse(rawBody);
    if (target.provider === "stripe") {
      event = parseStripeEvent(payload);
    } else {
      const eventId = request.headers.get("x-razorpay-event-id");
      if (!eventId) return Response.json({ error: "Missing event id" }, { status: 400 });
      event = parseRazorpayEvent(payload, eventId);
    }
  } catch {
    return Response.json({ error: "Malformed payload" }, { status: 400 });
  }

  const businessId = target.scope === "business" ? target.businessId : (event.kind !== "ignored" ? event.metadata.business_id : undefined);
  const inbox = await receiveGatewayEvent({
    provider: target.provider,
    scope: target.scope,
    businessId: businessId && UUID_RE.test(businessId) ? businessId : null,
    event,
    payload,
  });
  if (inbox.alreadyHandled) return Response.json({ received: true, duplicate: true });

  try {
    let outcome: "processed" | "ignored" = "ignored";
    if (target.scope === "platform") {
      if (event.kind === "subscription") outcome = await applySubscriptionEvent(event);
    } else {
      outcome = await applyCollectionEvent(target.businessId, event);
    }
    await completeGatewayEvent(inbox.id, outcome);
    return Response.json({ received: true, outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[webhook:${target.provider}:${target.scope}] event ${event.eventId} failed:`, message);
    await completeGatewayEvent(inbox.id, "failed", message.slice(0, 1000));
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
