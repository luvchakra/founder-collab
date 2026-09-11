import type {
  WhatsAppConnectionCredentials,
  WhatsAppMessageStatus,
  WhatsAppProviderAdapter,
  WhatsAppSendResult,
  WhatsAppTemplateVariables,
  WhatsAppWebhookEvent,
} from "./types";

const GRAPH_API_VERSION = "v20.0";
const GRAPH_API_BASE = "https://graph.facebook.com";

type GraphApiRequest = { url: string; body: Record<string, unknown> };

/** Pure request-shape builders, separated from the fetch execution below so each one
 * is unit-testable without a network mock -- same split this codebase already uses
 * for e.g. routing-rules/evaluate.ts (pure decision logic) vs. its own DB-touching
 * caller. */
export function buildSendTextRequest(phoneNumberId: string, to: string, text: string): GraphApiRequest {
  return {
    url: `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    body: { messaging_product: "whatsapp", to, type: "text", text: { body: text } },
  };
}

export function buildSendMediaRequest(phoneNumberId: string, to: string, mediaUrl: string, caption?: string): GraphApiRequest {
  return {
    url: `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    body: { messaging_product: "whatsapp", to, type: "image", image: { link: mediaUrl, caption: caption ?? undefined } },
  };
}

export function buildSendTemplateRequest(
  phoneNumberId: string,
  to: string,
  templateName: string,
  languageCode: string,
  variables: WhatsAppTemplateVariables,
): GraphApiRequest {
  const parameters = Object.values(variables).map((value) => ({ type: "text", text: value }));
  return {
    url: `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    body: {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: parameters.length > 0 ? [{ type: "body", parameters }] : [],
      },
    },
  };
}

export function buildMarkReadRequest(phoneNumberId: string, providerMessageId: string): GraphApiRequest {
  return {
    url: `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    body: { messaging_product: "whatsapp", status: "read", message_id: providerMessageId },
  };
}

async function postToGraphApi(accessToken: string, request: GraphApiRequest): Promise<WhatsAppSendResult> {
  try {
    const response = await fetch(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(request.body),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, error: `WhatsApp send failed with status ${response.status}.${detail ? ` ${detail}` : ""}`, statusCode: response.status };
    }
    const json = (await response.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
    return { ok: true, providerMessageId: json?.messages?.[0]?.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const STATUS_MAP: Record<string, WhatsAppMessageStatus> = { sent: "sent", delivered: "delivered", read: "read", failed: "failed" };

/**
 * CRM-07.1's pure webhook parser: Meta's WhatsApp Cloud API nests inbound
 * messages/statuses under `entry[].changes[].value.{messages,statuses}` -- this
 * flattens every entry/change across the whole payload into one normalized list.
 * Exported standalone (not just via the adapter object) so it's directly unit
 * testable against real Meta payload shapes without constructing a whole adapter.
 */
export function parseWhatsAppWebhookPayload(rawPayload: unknown): WhatsAppWebhookEvent[] {
  const events: WhatsAppWebhookEvent[] = [];
  const entries = (rawPayload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return events;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value;
      if (!value) continue;

      const messages = value.messages as Record<string, unknown>[] | undefined;
      for (const message of messages ?? []) {
        const type = message.type as string;
        const textBody = type === "text" ? ((message.text as { body?: string } | undefined)?.body ?? null) : null;
        const mediaId = type !== "text" ? ((message[type] as { id?: string } | undefined)?.id ?? null) : null;
        events.push({
          kind: "message",
          externalMessageId: String(message.id),
          externalActorId: String(message.from),
          senderPhone: String(message.from),
          occurredAt: new Date(Number(message.timestamp) * 1000).toISOString(),
          text: textBody,
          mediaId,
        });
      }

      const statuses = value.statuses as Record<string, unknown>[] | undefined;
      for (const status of statuses ?? []) {
        events.push({
          kind: "status",
          externalMessageId: String(status.id),
          status: STATUS_MAP[status.status as string] ?? "unknown",
          occurredAt: new Date(Number(status.timestamp) * 1000).toISOString(),
        });
      }
    }
  }

  return events;
}

async function verifyCredentials(credentials: WhatsAppConnectionCredentials): Promise<{ ok: boolean; detail?: string; statusCode?: number }> {
  try {
    const response = await fetch(`${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${credentials.phoneNumberId}`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, detail: `Graph API returned ${response.status}.${detail ? ` ${detail}` : ""}`, statusCode: response.status };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/** CRM-07.1's only implementation of `WhatsAppProviderAdapter` today, against Meta's
 * WhatsApp Cloud API. */
export const whatsAppCloudApiAdapter: WhatsAppProviderAdapter = {
  connect: verifyCredentials,
  healthCheck: verifyCredentials,
  async disconnect() {
    // See the interface's own doc comment: Cloud API has no session to end from here.
  },
  receiveWebhook: parseWhatsAppWebhookPayload,
  sendText: (credentials, to, text) => postToGraphApi(credentials.accessToken, buildSendTextRequest(credentials.phoneNumberId, to, text)),
  sendMedia: (credentials, to, mediaUrl, caption) =>
    postToGraphApi(credentials.accessToken, buildSendMediaRequest(credentials.phoneNumberId, to, mediaUrl, caption)),
  sendTemplate: (credentials, to, templateName, languageCode, variables) =>
    postToGraphApi(credentials.accessToken, buildSendTemplateRequest(credentials.phoneNumberId, to, templateName, languageCode, variables)),
  async markRead(credentials, providerMessageId) {
    await postToGraphApi(credentials.accessToken, buildMarkReadRequest(credentials.phoneNumberId, providerMessageId));
  },
  async getMessageStatus() {
    // Cloud API has no "get status by message id" read endpoint -- status only ever
    // arrives as a webhook push (the `statuses` array `parseWhatsAppWebhookPayload`
    // already handles). CRM-07.9 (Message Status Tracking, P1) is where that pushed
    // status gets persisted and read back from `crm.interaction` itself; this method
    // exists to satisfy the interface uniformly for a provider that might expose one.
    return "unknown";
  },
};
