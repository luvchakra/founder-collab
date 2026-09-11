import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../db/server";
import { buildPrefilledMessageWithRef, generateRefCode } from "./link";
import type { ClickToChatLink } from "./types";

const POSTGRES_UNIQUE_VIOLATION = "23505";
const MAX_REF_CODE_ATTEMPTS = 5;

/**
 * CRM-07.10: creates a business-owned `wa.me` entry point. The ref code is generated
 * here (not user-entered) so it stays short and URL-safe; a unique-violation on
 * `(business_id, ref_code)` just means an unlucky collision, so this retries with a
 * fresh code rather than surfacing that as a user-facing error.
 */
export async function createClickToChatLink(
  businessId: string,
  input: { label: string; whatsappNumber: string; message: string; campaign?: string | null },
): Promise<ClickToChatLink> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "channel_connections.manage");
  const supabase = await createClient();

  for (let attempt = 0; attempt < MAX_REF_CODE_ATTEMPTS; attempt++) {
    const refCode = generateRefCode();
    const { data, error } = await supabase
      .from("click_to_chat_link")
      .insert({
        business_id: businessId,
        label: input.label,
        whatsapp_number: input.whatsappNumber,
        ref_code: refCode,
        campaign: input.campaign ?? null,
        prefilled_message: buildPrefilledMessageWithRef(input.message, refCode),
      })
      .select("*")
      .single();
    if (!error) return data as ClickToChatLink;
    if ((error as { code?: string }).code !== POSTGRES_UNIQUE_VIOLATION) throw error;
  }
  throw new Error("Could not generate a unique reference code -- try again.");
}

/** Soft-remove only, same reasoning as `deactivateWhatsAppTemplate()` -- a link already
 * shared publicly (a bio link, a printed flyer) keeps attributing past conversations
 * correctly even after it's retired from new use. */
export async function deactivateClickToChatLink(businessId: string, linkId: string): Promise<void> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "channel_connections.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("click_to_chat_link").update({ is_active: false }).eq("business_id", businessId).eq("id", linkId);
  if (error) throw error;
}
