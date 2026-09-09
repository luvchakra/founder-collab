import { NextResponse } from "next/server";
import { verifyMetaSignature, verifyMetaSubscription } from "@cofounderai/module-crm/lib/webhooks/verify-meta-signature";
import { ingestInboundCrmMessage } from "@cofounderai/module-crm/lib/tickets/ingest-inbound-message";

/**
 * WhatsApp Business Platform (Cloud API) inbound webhook (docs/design/
 * crm-module-design.md Part A, A2) -- its own integration, separate from the combined
 * Meta (Instagram/Messenger) one at crm-meta, per that doc's own note ("each their own
 * integration"), even though the signature scheme is identical (both are Meta Graph API
 * products).
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

type WhatsAppChangeValue = {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: { from?: string; text?: { body?: string }; type?: string }[];
};

type WhatsAppWebhookPayload = {
  entry?: { changes?: { field?: string; value?: WhatsAppChangeValue }[] }[];
};

export async function POST(request: Request) {
  const appSecret = process.env.CRM_WHATSAPP_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 401 });
  }

  const rawBody = await request.text();
  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;

  const results: unknown[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      const externalAccountId = value?.metadata?.phone_number_id;
      if (!externalAccountId) continue;

      for (const message of value?.messages ?? []) {
        // Only plain text is normalized here -- media/location/interactive-reply
        // message types are a real feature (transcription/attachment handling) this
        // P0 pass doesn't build; they're simply not ingested rather than half-handled.
        if (message.type !== "text" || !message.from || !message.text?.body) continue;

        const contact = value?.contacts?.find((c) => c.wa_id === message.from);
        const result = await ingestInboundCrmMessage({
          provider: "whatsapp_business",
          externalAccountId,
          senderHandle: message.from,
          senderName: contact?.profile?.name ?? null,
          text: message.text.body,
        });
        results.push(result);
      }
    }
  }

  // 200 regardless -- same "don't make Meta retry forever over an unmatched account"
  // reasoning as crm-meta's own route.
  return NextResponse.json({ processed: results.length, results });
}
