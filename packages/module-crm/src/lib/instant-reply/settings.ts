import { z } from "zod";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { createClient } from "../../db/server";
import { DEFAULT_ACK_TEXT } from "./acknowledgement";

/** CRM-INSTANT-ACK-01: the business's acknowledgement text, or the default when it has
 * never set one. */
export async function getInstantAckText(businessId: string): Promise<{ text: string; isDefault: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("instant_reply_settings").select("ack_text").eq("business_id", businessId).maybeSingle();
  if (error) throw error;
  const text = (data as { ack_text: string } | null)?.ack_text?.trim();
  return text ? { text, isDefault: false } : { text: DEFAULT_ACK_TEXT, isDefault: true };
}

export const ackTextSchema = z
  .string()
  .trim()
  .min(1, "Write the message to send.")
  .max(500, "Keep the message under 500 characters.");

export async function saveInstantAckText(businessId: string, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "channel_connections.manage");
  const parsed = ackTextSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the message and try again." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("instant_reply_settings")
    .upsert({ business_id: businessId, ack_text: parsed.data, updated_by: user?.id ?? null }, { onConflict: "business_id" });
  if (error) throw error;

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_instant_reply.ack_text_changed",
    entityType: "crm_instant_reply_settings",
    entityId: null,
    after: { ack_text: parsed.data },
  });
  return { ok: true };
}
