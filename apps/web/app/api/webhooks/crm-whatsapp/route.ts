import { NextResponse } from "next/server";
import { verifyMetaSignature, verifyMetaSubscription } from "@cofounderai/module-crm/lib/webhooks/verify-meta-signature";
import { ingestInboundWhatsAppMessage } from "@cofounderai/module-crm/lib/whatsapp/ingest-inbound-message";

/**
 * WhatsApp Business Platform (Cloud API) inbound webhook (docs/design/
 * crm-module-design.md Part A, A2) -- its own integration, separate from the combined
 * Meta (Instagram/Messenger) one at crm-meta, per that doc's own note ("each their own
 * integration"), even though the signature scheme is identical (both are Meta Graph API
 * products).
 *
 * CRM-07.3: the POST handler's message-processing internals were rebuilt on the new
 * provider-neutral `crm.interaction`/`crm.conversation` model (`ingestInboundWhatsAppMessage()`)
 * per docs/design/crm-backlog-audit.md's retirement table -- this is the one webhook Meta
 * can be configured to POST to, so there is no parallel-run option the way a new UI route
 * has; `verify-meta-signature.ts` (both GET and POST) is unaffected, reused as-is.
 */

export async function GET(request: Request) {
  const verifyToken = process.env.CRM_WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 401 });
  }
  const result = verifyMetaSubscription(new URL(request.url).searchParams, verifyToken);
  if (!result.ok) {
    return NextResponse.json({ error: "Verification failed" }, { status: 403 });
  }
  return new NextResponse(result.challenge, { status: 200 });
}

export async function POST(request: Request) {
  const appSecret = process.env.CRM_WHATSAPP_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 401 });
  }

  const rawBody = await request.text();
  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as unknown;
  const results = await ingestInboundWhatsAppMessage(payload);

  // 200 regardless -- same "don't make Meta retry forever over an unmatched account"
  // reasoning as crm-meta's own route.
  return NextResponse.json({ processed: results.length, results });
}
