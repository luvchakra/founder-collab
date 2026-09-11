import type { SupabaseClient } from "@supabase/supabase-js";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { encryptApiKey } from "@cofounderai/core/crypto/api-key";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { createClient } from "../../db/server";
import { whatsAppCloudApiAdapter } from "../whatsapp/cloud-api-adapter";
import { classifyWhatsAppFailure } from "../whatsapp/failure-classification";
import type { ChannelConnectionStatus } from "./types";

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

/**
 * CRM-15.5's own state-transition rule: takes the outcome of one real provider call
 * (a send failure's status code, or a health-check's own ok/fail) and applies whatever
 * `crm.channel_connection.status` change it implies. An inline send failure/success
 * inside `sendWhatsAppReply()`/`sendWhatsAppTemplate()` and the user-triggered
 * "Recheck now" (`checkWhatsAppConnectionNow()`, whatsapp/health.ts) both use the plain
 * session default (this is a system-detected signal, not the human's own action, so
 * it's never permission-gated the way `connectWhatsApp()`/`disconnectChannelConnection()`
 * are) -- and the periodic health-check cron (`checkAllWhatsAppConnectionsHealth()`),
 * which has no session at all and passes its own crm-scoped admin client explicitly.
 *
 * That `adminClient` param is *only* ever the cron's admin client -- when it's set, the
 * audit entry is written with a matching core-scoped *admin* client instead of the
 * ordinary `writeAuditLog()` helper, because `writeAuditLog()` always opens its own
 * cookie/session-based `core`-schema client internally, which would run unauthenticated
 * (`anon`, no execute grant on `core.write_audit_log`) in a cron request with no real
 * user session -- `service_role` does have that grant
 * (`20260907140000_grant_function_execute_to_service_role.sql`), so a matching
 * service-role client for the audit write is what actually needs to happen here.
 *
 * A `disconnected` connection is never touched -- that's a human's own explicit choice,
 * and a stray delayed send/health-check for it shouldn't resurrect it into a failure
 * state. A message-specific 4xx (bad recipient, unknown template --
 * `classifyWhatsAppFailure()` returns `null` for these) never changes the connection's
 * status either. No-ops (no audit entry) when the computed status equals the current one,
 * so a string of identical failures doesn't flood the audit log with duplicate entries.
 * Returns whether a status change was actually applied, so a caller checking many
 * connections at once (the cron) can report how many it actually changed.
 */
export async function applyChannelConnectionHealthResult(
  businessId: string,
  connectionId: string,
  result: { ok: true } | { ok: false; statusCode?: number },
  adminClient?: SupabaseClient,
): Promise<boolean> {
  const supabase = adminClient ?? (await createClient());
  const { data: connection, error: fetchError } = await supabase
    .from("channel_connection")
    .select("status")
    .eq("id", connectionId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!connection || connection.status === "disconnected") return false;

  const nextStatus: ChannelConnectionStatus | null = result.ok ? "connected" : classifyWhatsAppFailure(result.statusCode);
  if (!nextStatus || nextStatus === connection.status) return false;

  const updates: { status: ChannelConnectionStatus; last_synced_at?: string } = { status: nextStatus };
  if (result.ok) updates.last_synced_at = new Date().toISOString();

  const { error: updateError } = await supabase.from("channel_connection").update(updates).eq("id", connectionId).eq("business_id", businessId);
  if (updateError) throw updateError;

  const auditEntry = {
    businessId,
    actorId: null as string | null,
    action: "crm_channel_connection.health_changed",
    entityType: "crm_channel_connection",
    entityId: connectionId,
    before: { status: connection.status },
    after: { status: nextStatus },
  };
  if (adminClient) {
    const coreAdmin = createCoreAdminClient({ schema: "core" });
    const { error: auditError } = await coreAdmin.from("audit_log").insert({
      business_id: auditEntry.businessId,
      actor_id: auditEntry.actorId,
      action: auditEntry.action,
      entity_type: auditEntry.entityType,
      entity_id: auditEntry.entityId,
      before: auditEntry.before,
      after: auditEntry.after,
    });
    if (auditError) throw auditError;
  } else {
    await writeAuditLog(auditEntry);
  }

  return true;
}
