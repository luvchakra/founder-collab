import { requireModule } from "@cofounderai/core/licensing/queries";
import { encryptApiKey } from "@cofounderai/core/crypto/api-key";
import { createClient } from "../../db/server";
import type { ChannelProvider, InstantReplyMode } from "./types";

/**
 * Connects one external account (docs/design/crm-module-design.md Part A, A1) --
 * tokens encrypted with the same AES-256-GCM helper BYOK's provider credentials use
 * (core/crypto/api-key.ts), never stored in plaintext. The actual OAuth/token-exchange
 * flow with Meta/Google (getting a real access token in the first place) is outside
 * this function's scope -- this is where a caller lands *after* that exchange, with a
 * real token in hand, same separation module-discovery/lib/ai-providers/mutations.ts
 * draws for BYOK ("tests the key server-side before saving" is that module's own
 * equivalent of an OAuth exchange).
 */
export async function connectChannelAccount(
  businessId: string,
  input: {
    channelId: string;
    provider: ChannelProvider;
    externalAccountId: string;
    accessToken: string;
    refreshToken?: string;
  },
): Promise<void> {
  await requireModule(businessId, "crm");
  const supabase = await createClient();
  const { error } = await supabase.from("channel_accounts").insert({
    business_id: businessId,
    channel_id: input.channelId,
    provider: input.provider,
    external_account_id: input.externalAccountId,
    access_token_encrypted: encryptApiKey(input.accessToken),
    refresh_token_encrypted: input.refreshToken ? encryptApiKey(input.refreshToken) : null,
    status: "connected",
  });
  if (error) throw error;
}

/** See tickets/mutations.ts#updateTicketStatus's own doc comment for why this checks
 * the row actually came back instead of trusting a plain `.update()` with no
 * `.select()`. */
export async function disconnectChannelAccount(channelAccountId: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channel_accounts")
    .update({ status: "revoked" })
    .eq("id", channelAccountId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("This channel account could not be updated -- it may have been removed, or your access to it may have changed.");
  }
}

export async function setInstantReplyMode(channelAccountId: string, mode: InstantReplyMode): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channel_accounts")
    .update({ instant_reply_mode: mode })
    .eq("id", channelAccountId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("This channel account could not be updated -- it may have been removed, or your access to it may have changed.");
  }
}
