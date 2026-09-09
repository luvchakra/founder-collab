import { cache } from "react";
import { createClient } from "../../db/server";
import { createAdminClient } from "../../db/admin";
import type { ChannelAccount, ChannelProvider } from "./types";

const SAFE_COLUMNS = "id, business_id, channel_id, provider, external_account_id, status, instant_reply_mode, last_synced_at, created_at, updated_at";

/** UI-facing read layer -- deliberately never selects access_token_encrypted/
 * refresh_token_encrypted, same discipline module-discovery/lib/ai-providers/queries.ts
 * already established for BYOK credentials: only the webhook's own admin-client lookup
 * (below) touches the encrypted columns, immediately before decrypting for one outbound
 * call. */
/** Which provider (if any) is actually connected to a given channel -- what "Convert
 * to prospect" (docs/design/crm-module-design.md Part A, A4) needs to know which of
 * the four external-lead channel shapes a ticket's own channel_id maps to. */
export async function getConnectedProviderForChannel(channelId: string): Promise<ChannelProvider | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channel_accounts")
    .select("provider")
    .eq("channel_id", channelId)
    .eq("status", "connected")
    .maybeSingle();
  if (error) throw error;
  return data?.provider ?? null;
}

export const listChannelAccounts = cache(async (businessId: string): Promise<ChannelAccount[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channel_accounts")
    .select(SAFE_COLUMNS)
    .eq("business_id", businessId)
    .order("created_at");
  if (error) throw error;
  return data as ChannelAccount[];
});

/**
 * Resolves which business/channel a provider's inbound webhook payload belongs to, by
 * the page/number/location id Meta/Google's payload carries -- the webhook has no
 * session and no businessId of its own, only what the provider tells it. Runs with the
 * admin client (no logged-in user in a webhook request), same as
 * module-discovery/lib/conversations/ingest-inbound-email.ts's own contact lookup.
 */
export async function getConnectedChannelAccountByExternalId(
  provider: ChannelProvider,
  externalAccountId: string,
): Promise<{
  id: string;
  business_id: string;
  channel_id: string;
  external_account_id: string;
  instant_reply_mode: ChannelAccount["instant_reply_mode"];
  accessTokenEncrypted: string;
} | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("channel_accounts")
    .select("id, business_id, channel_id, external_account_id, instant_reply_mode, access_token_encrypted")
    .eq("provider", provider)
    .eq("external_account_id", externalAccountId)
    .eq("status", "connected")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    business_id: data.business_id,
    channel_id: data.channel_id,
    external_account_id: data.external_account_id,
    instant_reply_mode: data.instant_reply_mode,
    accessTokenEncrypted: data.access_token_encrypted,
  };
}
