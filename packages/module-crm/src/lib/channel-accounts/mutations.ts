import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { isOfferedInstantReplyMode, ACK_SUPPORTED_PROVIDERS } from "../instant-reply/acknowledgement";
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
  await requirePermission(businessId, "channel_connections.manage");
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
export async function disconnectChannelAccount(businessId: string, channelAccountId: string): Promise<void> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "channel_connections.manage");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channel_accounts")
    .update({ status: "revoked" })
    .eq("business_id", businessId)
    .eq("id", channelAccountId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("This channel account could not be updated -- it may have been removed, or your access to it may have changed.");
  }
}

/** CRM-INSTANT-ACK-01: only the offered modes, and the acknowledgement only on a provider
 * that has an inbound-and-send path here (Instagram DM, Facebook Messenger). */
export async function setInstantReplyMode(businessId: string, channelAccountId: string, mode: InstantReplyMode): Promise<void> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "channel_connections.manage");
  if (!isOfferedInstantReplyMode(mode)) throw new Error("That instant-reply option isn't available.");

  const supabase = await createClient();
  const { data: account, error: accountError } = await supabase
    .from("channel_accounts")
    .select("id, provider, instant_reply_mode")
    .eq("business_id", businessId)
    .eq("id", channelAccountId)
    .maybeSingle();
  if (accountError) throw accountError;
  if (!account) {
    throw new Error("This channel account could not be updated -- it may have been removed, or your access to it may have changed.");
  }
  if (mode !== "off" && !(ACK_SUPPORTED_PROVIDERS as readonly string[]).includes(account.provider)) {
    throw new Error("Instant acknowledgement isn't supported for this provider yet.");
  }

  const { data, error } = await supabase
    .from("channel_accounts")
    .update({ instant_reply_mode: mode })
    .eq("business_id", businessId)
    .eq("id", channelAccountId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("This channel account could not be updated -- it may have been removed, or your access to it may have changed.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_channel_account.instant_reply_mode_changed",
    entityType: "crm_channel_account",
    entityId: channelAccountId,
    before: { instant_reply_mode: account.instant_reply_mode },
    after: { instant_reply_mode: mode },
  });
}
