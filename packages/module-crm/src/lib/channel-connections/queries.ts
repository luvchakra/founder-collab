import { decryptApiKey } from "@cofounderai/core/crypto/api-key";
import { createClient } from "../../db/server";
import type { ChannelConnection } from "./types";

const PUBLIC_COLUMNS = "id, business_id, channel, provider, external_account_id, status, last_synced_at, created_at, updated_at";

export async function listChannelConnections(businessId: string): Promise<ChannelConnection[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("channel_connection").select(PUBLIC_COLUMNS).eq("business_id", businessId).order("created_at", { ascending: false });
  if (error) throw error;
  return data as ChannelConnection[];
}

export async function getChannelConnection(businessId: string, connectionId: string): Promise<ChannelConnection | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("channel_connection").select(PUBLIC_COLUMNS).eq("business_id", businessId).eq("id", connectionId).maybeSingle();
  if (error) throw error;
  return data as ChannelConnection | null;
}

/**
 * The one place `access_token_encrypted` is ever read and decrypted -- only called from
 * a send/health-check mutation path that genuinely needs to call the provider, never
 * from a query a page renders (CRM-07.2's own "credentials/tokens are never rendered to
 * ordinary users"). Returns null (not the raw connection) when there's simply no token
 * on file, so a caller can treat "not connected" and "connected but token missing" the
 * same way without a separate check.
 */
export async function getDecryptedAccessToken(businessId: string, connectionId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channel_connection")
    .select("access_token_encrypted")
    .eq("business_id", businessId)
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.access_token_encrypted) return null;
  return decryptApiKey(data.access_token_encrypted);
}
