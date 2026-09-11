import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { encryptApiKey } from "@cofounderai/core/crypto/api-key";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { createClient } from "../../db/server";
import { whatsAppCloudApiAdapter } from "../whatsapp/cloud-api-adapter";

/**
 * CRM-07.2's connect flow: verifies the phone_number_id + access token actually work
 * (`whatsAppCloudApiAdapter.connect()`, a real Graph API call) before ever writing them
 * -- a business initiating a connection sees a clear error immediately rather than a
 * silently-broken connection discovered later at first send. Meta's own Embedded Signup
 * flow (the backlog's "recommended path") is a JS-SDK popup that hands back this same
 * phone_number_id + a short-lived token to exchange server-side; this function is where
 * either that flow or this codebase's simpler manual-token form lands once a real token
 * is in hand, same separation `channel-accounts/mutations.ts#connectChannelAccount`'s
 * own doc comment already draws for the old model.
 */
export async function connectWhatsApp(businessId: string, input: { phoneNumberId: string; accessToken: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "channel_connections.manage");

  const check = await whatsAppCloudApiAdapter.connect({ phoneNumberId: input.phoneNumberId, accessToken: input.accessToken });
  if (!check.ok) return { ok: false, error: check.detail ?? "WhatsApp connection could not be verified." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("channel_connection")
    .upsert(
      {
        business_id: businessId,
        channel: "whatsapp",
        provider: "whatsapp_cloud_api",
        external_account_id: input.phoneNumberId,
        access_token_encrypted: encryptApiKey(input.accessToken),
        status: "connected",
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "business_id,channel,provider,external_account_id" },
    )
    .select("id")
    .single();
  if (error) throw error;

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_channel_connection.connected",
    entityType: "crm_channel_connection",
    entityId: data.id,
    after: { channel: "whatsapp", external_account_id: input.phoneNumberId, status: "connected" },
  });

  return { ok: true };
}

/** CRM-07.2's "disconnect/reconnect is supported": clears the stored token along with
 * flipping status -- reconnecting is just calling `connectWhatsApp()` again with a
 * fresh token, so there's no reason to keep a revoked one around. */
export async function disconnectChannelConnection(businessId: string, connectionId: string): Promise<void> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "channel_connections.manage");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("channel_connection")
    .update({ status: "disconnected", access_token_encrypted: null, refresh_token_encrypted: null })
    .eq("id", connectionId)
    .eq("business_id", businessId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("This connection could not be updated -- it may have been removed, or your access to it may have changed.");
  }

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_channel_connection.disconnected",
    entityType: "crm_channel_connection",
    entityId: connectionId,
    after: { status: "disconnected" },
  });
}
