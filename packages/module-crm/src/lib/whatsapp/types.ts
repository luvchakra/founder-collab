export type WhatsAppSendResult = { ok: true; providerMessageId: string | null } | { ok: false; error: string };

export type WhatsAppMessageStatus = "sent" | "delivered" | "read" | "failed" | "unknown";

/** What the adapter needs to act on behalf of one connected WhatsApp Business Account
 * -- the decrypted access token, never the encrypted-at-rest column. Callers read a
 * `crm.channel_connection` row and decrypt its own `access_token_encrypted` before
 * building this (see `lib/channel-connections/queries.ts`), so the adapter itself never
 * touches storage directly -- CRM-07.1's own "provider credentials are isolated". */
export type WhatsAppConnectionCredentials = {
  phoneNumberId: string;
  accessToken: string;
};

export type WhatsAppTemplateVariables = Record<string, string>;

/** One normalized event out of `receiveWebhook()` -- Meta's raw payload nests message/
 * status data under `entry[].changes[].value` in provider-specific shapes; everything
 * downstream of the adapter (CRM-07.3/07.4) works with this shape instead. */
export type WhatsAppWebhookEvent =
  | {
      kind: "message";
      externalMessageId: string;
      externalActorId: string;
      senderPhone: string;
      occurredAt: string;
      text: string | null;
      mediaId: string | null;
    }
  | { kind: "status"; externalMessageId: string; status: WhatsAppMessageStatus; occurredAt: string };

/**
 * CRM-07.1's provider-neutral adapter interface, the exact operation list the backlog
 * specifies. CRM business logic (recordInteraction, conversation state, the inbox UI)
 * calls only this interface, never `fetch("graph.facebook.com/...")` directly --
 * `WhatsAppCloudApiAdapter` (cloud-api-adapter.ts) is today's only implementation, but
 * swapping in a different BSP later means writing a new class against this same
 * interface, not touching any CRM conversation code.
 */
export interface WhatsAppProviderAdapter {
  /** Verifies the credentials work (a Graph API call against the phone number itself)
   * before CRM-07.2's connect flow saves them. */
  connect(credentials: WhatsAppConnectionCredentials): Promise<{ ok: boolean; detail?: string }>;
  /** Cloud API has no session to end from the app's side (revoking happens in Meta's
   * own UI, not via an API call) -- this exists to satisfy the adapter interface
   * uniformly across providers that might have a real session to close, and is a no-op
   * here. The actual local state transition (`status = 'disconnected'`, clearing the
   * stored tokens) is `channel-connections/mutations.ts`'s job, not the adapter's. */
  disconnect(credentials: WhatsAppConnectionCredentials): Promise<void>;
  /** Same underlying check as `connect()` -- CRM-15.5's periodic reliability check
   * calls this on an already-connected credential to catch a token that's since expired
   * or been revoked, distinct from the one-time check `connect()` does at setup time. */
  healthCheck(credentials: WhatsAppConnectionCredentials): Promise<{ ok: boolean; detail?: string }>;
  /** Pure -- parses Meta's raw webhook body into normalized events. No credentials
   * needed (a webhook payload isn't authenticated by a bearer token; that's
   * `verify-meta-signature.ts`'s job, run before this ever gets called). */
  receiveWebhook(rawPayload: unknown): WhatsAppWebhookEvent[];
  sendText(credentials: WhatsAppConnectionCredentials, to: string, text: string): Promise<WhatsAppSendResult>;
  sendMedia(credentials: WhatsAppConnectionCredentials, to: string, mediaUrl: string, caption?: string): Promise<WhatsAppSendResult>;
  sendTemplate(
    credentials: WhatsAppConnectionCredentials,
    to: string,
    templateName: string,
    languageCode: string,
    variables: WhatsAppTemplateVariables,
  ): Promise<WhatsAppSendResult>;
  markRead(credentials: WhatsAppConnectionCredentials, providerMessageId: string): Promise<void>;
  getMessageStatus(credentials: WhatsAppConnectionCredentials, providerMessageId: string): Promise<WhatsAppMessageStatus>;
}
