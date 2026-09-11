import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { decryptApiKey } from "@cofounderai/core/crypto/api-key";
import { getChannelConnection, getDecryptedAccessToken } from "../channel-connections/queries";
import { applyChannelConnectionHealthResult } from "../channel-connections/mutations";
import { createAdminClient } from "../../db/admin";
import { whatsAppCloudApiAdapter } from "./cloud-api-adapter";
import type { ChannelConnectionStatus } from "../channel-connections/types";

/**
 * CRM-15.5's user-triggered "Recheck now": re-verifies the stored credentials against
 * the real Graph API right now and applies whatever status change the result implies --
 * the WhatsApp admin page's visible resolution path for `degraded`/`provider_error`
 * (a `reauthorization_required` connection needs a genuinely new token, so its own
 * resolution path is re-submitting the connect form, not this).
 */
export async function checkWhatsAppConnectionNow(businessId: string, connectionId: string): Promise<ChannelConnectionStatus> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "channel_connections.manage");

  const connection = await getChannelConnection(businessId, connectionId);
  if (!connection) throw new Error("This connection could not be found.");
  if (connection.status === "disconnected") return connection.status;

  const accessToken = await getDecryptedAccessToken(businessId, connectionId);
  if (!accessToken) {
    await applyChannelConnectionHealthResult(businessId, connectionId, { ok: false, statusCode: 401 });
  } else {
    const check = await whatsAppCloudApiAdapter.healthCheck({ phoneNumberId: connection.external_account_id, accessToken });
    await applyChannelConnectionHealthResult(businessId, connectionId, check.ok ? { ok: true } : { ok: false, statusCode: check.statusCode });
  }

  const updated = await getChannelConnection(businessId, connectionId);
  return updated?.status ?? connection.status;
}

/**
 * CRM-15.5's periodic reliability check (`WhatsAppProviderAdapter.healthCheck()`'s own
 * doc comment anticipated this exact job): every business's own send/receive traffic
 * already surfaces a failure through `applyChannelConnectionHealthResult()` inline, but a
 * connection nobody has sent through in a while could sit silently broken (token expired
 * with no send to notice it) until a real customer message needs a reply -- this sweeps
 * every non-disconnected WhatsApp connection across every tenant, admin-scoped since a
 * cron invocation has no session/business to resolve. Point a scheduler
 * (`app/api/cron/check-whatsapp-health/route.ts`) at this on the same shared-secret
 * pattern the other cron routes already use.
 */
export async function checkAllWhatsAppConnectionsHealth(): Promise<{ checked: number; changed: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("channel_connection")
    .select("id, business_id, external_account_id, access_token_encrypted")
    .eq("channel", "whatsapp")
    .neq("status", "disconnected");
  if (error) throw error;

  let changed = 0;
  for (const row of data ?? []) {
    const accessToken = row.access_token_encrypted ? decryptApiKey(row.access_token_encrypted) : null;
    const check = accessToken
      ? await whatsAppCloudApiAdapter.healthCheck({ phoneNumberId: row.external_account_id, accessToken })
      : { ok: false as const, statusCode: 401 };
    const didChange = await applyChannelConnectionHealthResult(row.business_id, row.id, check.ok ? { ok: true } : { ok: false, statusCode: check.statusCode }, admin);
    if (didChange) changed += 1;
  }

  return { checked: data?.length ?? 0, changed };
}
