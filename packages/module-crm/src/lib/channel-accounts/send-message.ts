import { decryptApiKey } from "@cofounderai/core/crypto/api-key";
import type { ChannelProvider } from "./types";

export type SendResult = { ok: true } | { ok: false; error: string };

const GRAPH_API_VERSION = "v20.0";

/**
 * Sends one outbound message through a connected account's own Send API
 * (docs/design/crm-module-design.md Part A, A3) -- WhatsApp Cloud API and the Meta
 * Messenger/Instagram Send API are both REST-over-HTTPS with a bearer token, so one
 * function covers all three; Google Business Messages is explicitly out of this
 * pass's scope (see docs/design/crm-module-design.md's own P1 sequencing -- "lower
 * volume... sequence after those three are solid") and returns a clear "not
 * implemented" result rather than silently doing nothing.
 */
export async function sendCrmChannelMessage(
  provider: ChannelProvider,
  externalAccountId: string,
  accessTokenEncrypted: string,
  recipientHandle: string,
  text: string,
): Promise<SendResult> {
  if (provider === "google_business_messages") {
    return { ok: false, error: "Google Business Messages sending isn't implemented yet." };
  }

  const accessToken = decryptApiKey(accessTokenEncrypted);
  const url =
    provider === "whatsapp_business"
      ? `https://graph.facebook.com/${GRAPH_API_VERSION}/${externalAccountId}/messages`
      : `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages?access_token=${encodeURIComponent(accessToken)}`;

  const body =
    provider === "whatsapp_business"
      ? { messaging_product: "whatsapp", to: recipientHandle, type: "text", text: { body: text } }
      : { recipient: { id: recipientHandle }, message: { text } };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(provider === "whatsapp_business" ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, error: `${provider} send failed with status ${response.status}.${detail ? ` ${detail}` : ""}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
