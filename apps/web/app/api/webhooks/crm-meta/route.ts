import { NextResponse } from "next/server";
import { verifyMetaSignature, verifyMetaSubscription } from "@cofounderai/module-crm/lib/webhooks/verify-meta-signature";
import { ingestInboundSocialMessage } from "@cofounderai/module-crm/lib/social/ingest-inbound-message";

/**
 * Combined Instagram DM + Facebook Page Messenger webhook (docs/design/
 * crm-module-design.md Part A, A2's own note: both are reached through the same Meta
 * Graph API and app review process, so one integration with two provider values, not
 * two separate builds). Point the Meta App dashboard's Instagram *and* Messenger
 * webhook subscriptions at this same URL.
 *
 * CRM-08.2/08.3: the ingest call below moved from `ingestInboundCrmMessage()` (the old
 * ticket model) to `ingestInboundSocialMessage()` (the new interaction/conversation
 * model) -- everything else in this route (signature verification, the subscription
 * handshake, the payload shape it parses) is unchanged, reused as-is per
 * docs/design/crm-backlog-audit.md's retirement table.
 */

/** Meta's one-time webhook-registration handshake -- see verify-meta-signature.ts. */
export async function GET(request: Request) {
  const verifyToken = process.env.CRM_META_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 401 });
  }
  const result = verifyMetaSubscription(new URL(request.url).searchParams, verifyToken);
  if (!result.ok) {
    return NextResponse.json({ error: "Verification failed" }, { status: 403 });
  }
  return new NextResponse(result.challenge, { status: 200 });
}

type MetaMessagingEntry = {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { text?: string };
};

type MetaWebhookPayload = {
  object?: "instagram" | "page";
  entry?: { id?: string; messaging?: MetaMessagingEntry[] }[];
};

export async function POST(request: Request) {
  const appSecret = process.env.CRM_META_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 401 });
  }

  const rawBody = await request.text();
  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as MetaWebhookPayload;
  // Meta's own convention: "instagram" for Instagram DMs, "page" for Facebook
  // Messenger -- both webhook families otherwise share this exact entry/messaging shape.
  const provider = payload.object === "instagram" ? "instagram" : "facebook_messenger";

  const results: unknown[] = [];
  for (const entry of payload.entry ?? []) {
    const externalAccountId = entry.id;
    if (!externalAccountId) continue;

    for (const messagingEvent of entry.messaging ?? []) {
      const senderHandle = messagingEvent.sender?.id;
      const text = messagingEvent.message?.text;
      if (!senderHandle || !text) continue;

      const result = await ingestInboundSocialMessage({ provider, externalAccountId, senderHandle, text });
      results.push(result);
    }
  }

  // 200 regardless -- Meta retries aggressively on any non-2xx, and an unmatched
  // account (not yet connected here, or a stray webhook for a deleted one) isn't a
  // webhook failure.
  return NextResponse.json({ processed: results.length, results });
}
