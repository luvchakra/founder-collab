import type { ChannelType } from "../conversations/types";

export type ChannelConnectionStatus = "connected" | "degraded" | "reauthorization_required" | "disconnected" | "provider_error";

/** crm.channel_connection row -- CRM-01.2's provider-neutral successor to the old
 * crm.channel_accounts (retired by this story per docs/design/crm-backlog-audit.md's
 * retirement table). Never carries decrypted tokens -- see queries.ts's own comment on
 * why the decrypt step happens only where a send/health-check actually needs it. */
export type ChannelConnection = {
  id: string;
  business_id: string;
  channel: ChannelType;
  provider: string;
  external_account_id: string;
  status: ChannelConnectionStatus;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};
